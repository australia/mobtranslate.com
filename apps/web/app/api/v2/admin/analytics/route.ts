import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface AnalyticsData {
  period: string;
  users: number;
  words: number;
  comments: number;
  reviews: number;
}

interface LanguageStats {
  language_id: string;
  language_name: string;
  total_words: number;
  verified_words: number;
  pending_improvements: number;
  total_comments: number;
}

interface CuratorPerformance {
  user_id: string;
  display_name: string;
  words_reviewed: number;
  improvements_reviewed: number;
  comments_moderated: number;
  average_review_time: number;
}

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient();
    
    // Check authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    const { data: roleAssignments } = await supabase
      .from('user_role_assignments')
      .select(`
        role_id,
        user_roles!inner(name)
      `)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .in('user_roles.name', ['super_admin', 'dictionary_admin']);

    const isAdmin = roleAssignments && roleAssignments.length > 0;

    if (!isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || '7d'; // 7d, 30d, 90d

    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    switch (period) {
      case '30d':
        startDate.setDate(endDate.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(endDate.getDate() - 90);
        break;
      default: // 7d
        startDate.setDate(endDate.getDate() - 7);
    }

    // Generate daily data points for the period
    const dailyData: AnalyticsData[] = [];
    const currentDate = new Date(startDate);
    
    while (currentDate <= endDate) {
      const dayStart = new Date(currentDate);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(currentDate);
      dayEnd.setHours(23, 59, 59, 999);

      // Fetch counts for this day
      const [
        { count: newUsers = 0 },
        { count: newWords = 0 },
        { count: newComments = 0 },
        { count: reviews = 0 }
      ] = await Promise.all([
        // New users
        supabase.from('profiles')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', dayStart.toISOString())
          .lte('created_at', dayEnd.toISOString()),
        
        // New words
        supabase.from('words')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', dayStart.toISOString())
          .lte('created_at', dayEnd.toISOString()),
        
        // New comments
        supabase.from('word_comments')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', dayStart.toISOString())
          .lte('created_at', dayEnd.toISOString()),
        
        // Reviews (curator activities)
        supabase.from('curator_activities')
          .select('*', { count: 'exact', head: true })
          .in('activity_type', ['word_approved', 'word_rejected', 'improvement_approved', 'improvement_rejected'])
          .gte('created_at', dayStart.toISOString())
          .lte('created_at', dayEnd.toISOString())
      ]);

      dailyData.push({
        period: currentDate.toISOString().split('T')[0],
        users: newUsers ?? 0,
        words: newWords ?? 0,
        comments: newComments ?? 0,
        reviews: reviews ?? 0
      });

      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Fetch language statistics
    const { data: languageStats } = await supabase
      .from('languages')
      .select(`
        id,
        name,
        words!inner(
          id,
          is_verified
        ),
        word_improvement_suggestions!inner(
          id,
          status
        ),
        word_comments!inner(
          id
        )
      `);

    // Process language stats
    const processedLanguageStats: LanguageStats[] = (languageStats || []).map(lang => ({
      language_id: lang.id,
      language_name: lang.name,
      total_words: lang.words?.length || 0,
      verified_words: lang.words?.filter((w: any) => w.is_verified).length || 0,
      pending_improvements: lang.word_improvement_suggestions?.filter((s: any) => s.status === 'pending').length || 0,
      total_comments: lang.word_comments?.length || 0
    }));

    // Fetch curator performance metrics
    const { data: curatorMetrics } = await supabase
      .from('curator_metrics')
      .select(`
        user_id,
        words_reviewed,
        improvements_reviewed,
        comments_moderated,
        average_review_time_seconds,
        profiles!user_id(
          display_name
        )
      `)
      .gte('period_start', startDate.toISOString())
      .lte('period_end', endDate.toISOString());

    // Aggregate curator metrics by user
    const curatorPerformance: { [key: string]: CuratorPerformance } = {};
    
    (curatorMetrics || []).forEach(metric => {
      const userId = metric.user_id;
      if (!curatorPerformance[userId]) {
        curatorPerformance[userId] = {
          user_id: userId,
          display_name: (metric.profiles as any)?.display_name || 'Unknown',
          words_reviewed: 0,
          improvements_reviewed: 0,
          comments_moderated: 0,
          average_review_time: 0
        };
      }
      
      curatorPerformance[userId].words_reviewed += metric.words_reviewed || 0;
      curatorPerformance[userId].improvements_reviewed += metric.improvements_reviewed || 0;
      curatorPerformance[userId].comments_moderated += metric.comments_moderated || 0;
      
      // Calculate weighted average for review time
      if (metric.average_review_time_seconds) {
        const totalReviews = metric.words_reviewed + metric.improvements_reviewed;
        curatorPerformance[userId].average_review_time = 
          (curatorPerformance[userId].average_review_time * curatorPerformance[userId].words_reviewed +
           metric.average_review_time_seconds * totalReviews) /
          (curatorPerformance[userId].words_reviewed + totalReviews);
      }
    });

    const topCurators = Object.values(curatorPerformance)
      .sort((a, b) => (b.words_reviewed + b.improvements_reviewed) - (a.words_reviewed + a.improvements_reviewed))
      .slice(0, 10);

    // Calculate growth percentages
    const calculateGrowth = (current: number, previous: number) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return Math.round(((current - previous) / previous) * 100);
    };

    // Get current period totals
    const currentPeriodTotals = dailyData.reduce((acc, day) => ({
      users: acc.users + day.users,
      words: acc.words + day.words,
      comments: acc.comments + day.comments,
      reviews: acc.reviews + day.reviews
    }), { users: 0, words: 0, comments: 0, reviews: 0 });

    // Get previous period for comparison
    const previousStartDate = new Date(startDate);
    previousStartDate.setDate(previousStartDate.getDate() - (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    
    const [
      { count: previousUsers = 0 },
      { count: previousWords = 0 },
      { count: previousComments = 0 },
      { count: previousReviews = 0 }
    ] = await Promise.all([
      supabase.from('profiles')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', previousStartDate.toISOString())
        .lt('created_at', startDate.toISOString()),
      
      supabase.from('words')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', previousStartDate.toISOString())
        .lt('created_at', startDate.toISOString()),
      
      supabase.from('word_comments')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', previousStartDate.toISOString())
        .lt('created_at', startDate.toISOString()),
      
      supabase.from('curator_activities')
        .select('*', { count: 'exact', head: true })
        .in('activity_type', ['word_approved', 'word_rejected', 'improvement_approved', 'improvement_rejected'])
        .gte('created_at', previousStartDate.toISOString())
        .lt('created_at', startDate.toISOString())
    ]);

    return NextResponse.json({
      timeSeriesData: dailyData,
      languageStats: processedLanguageStats,
      topCurators,
      growth: {
        users: calculateGrowth(currentPeriodTotals.users, previousUsers ?? 0),
        words: calculateGrowth(currentPeriodTotals.words, previousWords ?? 0),
        comments: calculateGrowth(currentPeriodTotals.comments, previousComments ?? 0),
        reviews: calculateGrowth(currentPeriodTotals.reviews, previousReviews ?? 0)
      },
      totals: currentPeriodTotals
    });
  } catch (error) {
    console.error('Failed to fetch analytics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch analytics' },
      { status: 500 }
    );
  }
}