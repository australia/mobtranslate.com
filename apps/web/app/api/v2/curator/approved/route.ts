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

    // Get curator activities for approved items
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
      .in('activity_type', ['word_approved', 'improvement_approved'])
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
      console.error('Failed to fetch approved activities:', error);
      return NextResponse.json(
        { error: 'Failed to fetch approved activities' },
        { status: 500 }
      );
    }

    // Enrich activities with target details
    const enrichedActivities = await Promise.all(
      (activities || []).map(async (activity) => {
        let targetDetails = null;

        if (activity.target_type === 'word' && activity.target_id) {
          const { data: word } = await supabase
            .from('words')
            .select(`
              id,
              word,
              created_at,
              definitions!inner(
                definition
              ),
              translations!inner(
                translation
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
              suggested_value,
              created_at,
              words!word_id(
                id,
                word
              )
            `)
            .eq('id', activity.target_id)
            .single();
          
          targetDetails = improvement;
        }

        return {
          ...activity,
          targetDetails
        };
      })
    );

    // Calculate statistics
    const stats = {
      totalApproved: count || 0,
      wordsApproved: enrichedActivities.filter(a => a.activity_type === 'word_approved').length,
      improvementsApproved: enrichedActivities.filter(a => a.activity_type === 'improvement_approved').length,
      averagePerDay: count ? Math.round((count / 30) * 10) / 10 : 0
    };

    return NextResponse.json({
      activities: enrichedActivities,
      stats,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit)
      }
    });
  } catch (error) {
    console.error('Failed to fetch approved items:', error);
    return NextResponse.json(
      { error: 'Failed to fetch approved items' },
      { status: 500 }
    );
  }
}