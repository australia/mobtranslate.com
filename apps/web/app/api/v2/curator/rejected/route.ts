import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient();
    
    // Check authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const languageId = searchParams.get('languageId');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = (page - 1) * limit;

    // Check if user is a curator
    const { data: roleAssignments } = await supabase
      .from('user_role_assignments')
      .select(`
        language_id,
        role_id,
        user_roles!inner(name)
      `)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .in('user_roles.name', ['curator', 'dictionary_admin', 'super_admin']);

    if (!roleAssignments || roleAssignments.length === 0) {
      return NextResponse.json({ error: 'Not a curator' }, { status: 403 });
    }

    // Get curator activities for rejected items
    let query = supabase
      .from('curator_activities')
      .select(`
        *,
        languages!language_id(
          id,
          name,
          code
        ),
        profiles!user_id(
          id,
          display_name,
          username
        )
      `, { count: 'exact' })
      .eq('user_id', user.id)
      .in('activity_type', ['word_rejected', 'improvement_rejected'])
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply filters
    if (languageId) {
      query = query.eq('language_id', languageId);
    }
    if (dateFrom) {
      query = query.gte('created_at', dateFrom);
    }
    if (dateTo) {
      query = query.lte('created_at', dateTo);
    }

    const { data: activities, count, error } = await query;

    if (error) {
      console.error('Failed to fetch rejected activities:', error);
      return NextResponse.json(
        { error: 'Failed to fetch rejected activities' },
        { status: 500 }
      );
    }

    // Enrich activities with target details and analyze rejection reasons
    const rejectionReasons: { [key: string]: number } = {};
    
    const enrichedActivities = await Promise.all(
      (activities || []).map(async (activity) => {
        let targetDetails = null;

        // Extract rejection reason from activity data
        const reason = activity.activity_data?.reason || 'Other';
        rejectionReasons[reason] = (rejectionReasons[reason] || 0) + 1;

        if (activity.target_type === 'word' && activity.target_id) {
          const { data: word } = await supabase
            .from('words')
            .select(`
              id,
              word,
              created_at,
              created_by,
              community_notes,
              profiles!created_by(
                id,
                display_name,
                username
              )
            `)
            .eq('id', activity.target_id)
            .single();
          
          targetDetails = word;
        } else if (activity.target_type === 'improvement' && activity.target_id) {
          const { data: improvement } = await supabase
            .from('word_improvement_suggestions')
            .select(`
              id,
              improvement_type,
              field_name,
              current_value,
              suggested_value,
              improvement_reason,
              created_at,
              submitted_by,
              review_comment,
              words!word_id(
                id,
                word
              ),
              profiles!submitted_by(
                id,
                display_name,
                username
              )
            `)
            .eq('id', activity.target_id)
            .single();
          
          targetDetails = improvement;
        }

        return {
          ...activity,
          targetDetails,
          rejectionReason: reason
        };
      })
    );

    // Calculate statistics
    const stats = {
      totalRejected: count || 0,
      wordsRejected: enrichedActivities.filter(a => a.activity_type === 'word_rejected').length,
      improvementsRejected: enrichedActivities.filter(a => a.activity_type === 'improvement_rejected').length,
      commonRejectionReasons: Object.entries(rejectionReasons)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([reason, count]) => ({ reason, count }))
    };

    // Check for resubmission eligibility
    const resubmissionEligible = enrichedActivities.filter(activity => {
      // Items rejected more than 7 days ago might be eligible for resubmission
      const daysSinceRejection = Math.floor(
        (Date.now() - new Date(activity.created_at).getTime()) / (1000 * 60 * 60 * 24)
      );
      return daysSinceRejection >= 7;
    });

    return NextResponse.json({
      activities: enrichedActivities,
      stats: {
        ...stats,
        resubmissionEligible: resubmissionEligible.length
      },
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit)
      }
    });
  } catch (error) {
    console.error('Failed to fetch rejected items:', error);
    return NextResponse.json(
      { error: 'Failed to fetch rejected items' },
      { status: 500 }
    );
  }
}