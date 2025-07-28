import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { languageId: string } }
) {
  const { languageId } = params;
  const supabase = createClient();
  
  try {
    // Check authentication and curator role
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Check if user is a curator for this language
    const { data: roleCheck } = await supabase
      .rpc('user_has_role', {
        user_uuid: user.id,
        role_names: ['curator', 'dictionary_admin', 'super_admin'],
        lang_id: languageId
      });

    if (!roleCheck) {
      return NextResponse.json(
        { error: 'Forbidden: User is not a curator for this language' },
        { status: 403 }
      );
    }

    // Get dashboard stats
    const [
      pendingImprovements,
      recentComments,
      unverifiedWords,
      recentActivity,
      languageSettings
    ] = await Promise.all([
      // Pending improvements
      supabase
        .from('word_improvement_suggestions')
        .select('id', { count: 'exact' })
        .eq('status', 'pending')
        .in('word_id', 
          supabase
            .from('words')
            .select('id')
            .eq('language_id', languageId)
        ),

      // Recent comments (last 24 hours)
      supabase
        .from('word_comments')
        .select('id', { count: 'exact' })
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .in('word_id',
          supabase
            .from('words')
            .select('id')
            .eq('language_id', languageId)
        ),

      // Unverified words
      supabase
        .from('words')
        .select('id', { count: 'exact' })
        .eq('language_id', languageId)
        .eq('is_verified', false),

      // Recent curator activity
      supabase
        .from('curator_activities')
        .select(`
          *,
          user:profiles!user_id(
            display_name,
            avatar_url
          )
        `)
        .eq('language_id', languageId)
        .order('created_at', { ascending: false })
        .limit(10),

      // Language curation settings
      supabase
        .from('language_curation_settings')
        .select('*')
        .eq('language_id', languageId)
        .single()
    ]);

    // Get words needing review
    const { data: wordsNeedingReview } = await supabase
      .from('words_needing_review')
      .select('*')
      .eq('language_id', languageId)
      .limit(5);

    // Get curator's recent metrics
    const currentMonth = new Date();
    const periodStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
    const periodEnd = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);

    const { data: curatorMetrics } = await supabase
      .from('curator_metrics')
      .select('*')
      .eq('user_id', user.id)
      .eq('language_id', languageId)
      .gte('period_start', periodStart.toISOString())
      .lte('period_end', periodEnd.toISOString())
      .single();

    const dashboardData = {
      stats: {
        pending_improvements: pendingImprovements?.count || 0,
        recent_comments: recentComments?.count || 0,
        unverified_words: unverifiedWords?.count || 0
      },
      recent_activity: recentActivity?.data || [],
      words_needing_review: wordsNeedingReview || [],
      curator_metrics: curatorMetrics || {
        words_reviewed: 0,
        words_approved: 0,
        words_rejected: 0,
        improvements_reviewed: 0,
        comments_moderated: 0
      },
      language_settings: languageSettings?.data || null
    };

    return NextResponse.json(dashboardData);
  } catch (error) {
    console.error('Error fetching curator dashboard:', error);
    return NextResponse.json(
      { error: 'Failed to fetch dashboard data' },
      { status: 500 }
    );
  }
}