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

    // Fetch various stats
    const [
      { count: totalUsers = 0 },
      { count: activeUsers = 0 },
      { count: pendingReviews = 0 },
      { count: totalWords = 0 },
      { count: totalComments = 0 },
      { count: improvementSuggestions = 0 },
      { data: recentActivity }
    ] = await Promise.all([
      // Total users
      supabase.from('profiles').select('*', { count: 'exact', head: true }),
      
      // Active users (last 30 days)
      supabase.from('profiles')
        .select('*', { count: 'exact', head: true })
        .gte('updated_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
      
      // Pending reviews (unverified words)
      supabase.from('words')
        .select('*', { count: 'exact', head: true })
        .eq('is_verified', false),
      
      // Total words
      supabase.from('words')
        .select('*', { count: 'exact', head: true }),
      
      // Total comments
      supabase.from('word_comments')
        .select('*', { count: 'exact', head: true })
        .eq('is_deleted', false),
      
      // Improvement suggestions
      supabase.from('word_improvement_suggestions')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending'),
      
      // Recent activity (last 10 actions)
      supabase.from('curator_activities')
        .select(`
          id,
          activity_type,
          activity_data,
          created_at,
          user_id,
          profiles!user_id(
            display_name,
            username
          )
        `)
        .order('created_at', { ascending: false })
        .limit(10)
    ]);

    // Calculate approval rate (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { count: approvedCount = 0 } = await supabase
      .from('curator_activities')
      .select('*', { count: 'exact', head: true })
      .in('activity_type', ['word_approved', 'improvement_approved'])
      .gte('created_at', thirtyDaysAgo);
    
    const { count: rejectedCount = 0 } = await supabase
      .from('curator_activities')
      .select('*', { count: 'exact', head: true })
      .in('activity_type', ['word_rejected', 'improvement_rejected'])
      .gte('created_at', thirtyDaysAgo);

    const totalReviews = approvedCount + rejectedCount;
    const approvalRate = totalReviews > 0 ? Math.round((approvedCount / totalReviews) * 100) : 0;

    return NextResponse.json({
      totalUsers,
      activeUsers,
      pendingReviews,
      totalWords,
      totalComments,
      improvementSuggestions,
      approvalRate,
      recentActivity: recentActivity || []
    });
  } catch (error) {
    console.error('Failed to fetch admin stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch stats' },
      { status: 500 }
    );
  }
}