import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Users, FileText, MessageSquare, TrendingUp, Clock, CheckCircle, Activity, Calendar } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@mobtranslate/ui';

export default async function AdminDashboard() {
  const supabase = createClient();
  
  // Check authentication
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect('/auth/signin?redirect=/admin');
  }

  // Check if user is admin
  const { data: isAdmin } = await supabase
    .rpc('user_has_role', {
      user_uuid: user.id,
      role_names: ['super_admin', 'dictionary_admin']
    });

  if (!isAdmin) {
    redirect('/');
  }

  // Fetch stats
  const [
    totalUsersResult,
    { count: activeUsers = 0 },
    { count: totalWords = 0 },
    { count: pendingReviews = 0 },
    { count: totalComments = 0 },
    { count: improvements = 0 },
    { data: recentActivity },
    // eslint-disable-next-line no-unused-vars
    { data: languageStats },
    { count: totalLanguages = 0 }
  ] = await Promise.all([
    // Total users - count from auth.users using RPC or fallback to user_profiles
    supabase.rpc('count_auth_users').single(),
    
    // Active users (last 30 days) - count from user_profiles
    supabase.from('user_profiles')
      .select('*', { count: 'exact', head: true })
      .gte('updated_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
    
    // Total words
    supabase.from('words').select('*', { count: 'exact', head: true }),
    
    // Pending reviews
    supabase.from('words')
      .select('*', { count: 'exact', head: true })
      .eq('is_verified', false),
    
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
        language_id,
        languages!language_id(name),
        profiles!user_id(
          display_name,
          username
        )
      `)
      .order('created_at', { ascending: false })
      .limit(10),
    
    // Language statistics
    supabase.from('languages')
      .select(`
        id,
        name,
        words!inner(count)
      `)
      .eq('is_active', true),
    
    // Total active languages
    supabase.from('languages')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true)
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

  const totalReviews = (approvedCount || 0) + (rejectedCount || 0);
  const approvalRate = totalReviews > 0 ? Math.round(((approvedCount || 0) / totalReviews) * 100) : 0;

  // Handle totalUsers from RPC result or fallback
  let totalUsers = 0;
  if (totalUsersResult.data !== null) {
    totalUsers = totalUsersResult.data as number;
  } else {
    // Fallback to counting user_profiles if RPC fails
    const { count } = await supabase
      .from('user_profiles')
      .select('*', { count: 'exact', head: true });
    totalUsers = count || 0;
  }

  // Calculate growth percentages
  const { count: previousMonthUsersRaw } = await supabase
    .from('user_profiles')
    .select('*', { count: 'exact', head: true })
    .lt('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
  const previousMonthUsers = previousMonthUsersRaw || 0;

  const userGrowth = previousMonthUsers > 0
    ? Math.round(((totalUsers - previousMonthUsers) / previousMonthUsers) * 100)
    : 0;

  const { count: previousMonthWordsRaw } = await supabase
    .from('words')
    .select('*', { count: 'exact', head: true })
    .lt('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
  const previousMonthWords = previousMonthWordsRaw || 0;

  const wordGrowth = previousMonthWords > 0
    ? Math.round((((totalWords || 0) - previousMonthWords) / previousMonthWords) * 100)
    : 0;

  const statCards = [
    {
      title: 'Total Users',
      value: totalUsers,
      description: `${activeUsers} active this month`,
      icon: Users,
      color: 'text-primary bg-primary/10',
      change: userGrowth > 0 ? `+${userGrowth}%` : userGrowth < 0 ? `${userGrowth}%` : null
    },
    {
      title: 'Pending Reviews',
      value: pendingReviews,
      description: 'Words awaiting review',
      icon: Clock,
      color: 'text-warning bg-warning/10',
      change: null
    },
    {
      title: 'Total Words',
      value: totalWords,
      description: `Across ${totalLanguages} languages`,
      icon: FileText,
      color: 'text-success bg-success/10',
      change: wordGrowth > 0 ? `+${wordGrowth}%` : wordGrowth < 0 ? `${wordGrowth}%` : null
    },
    {
      title: 'Comments',
      value: totalComments,
      description: 'User interactions',
      icon: MessageSquare,
      color: 'text-foreground bg-muted',
      change: null
    },
    {
      title: 'Improvements',
      value: improvements,
      description: 'Pending suggestions',
      icon: TrendingUp,
      color: 'text-primary bg-primary/10',
      change: null
    },
    {
      title: 'Approval Rate',
      value: `${approvalRate}%`,
      description: 'Last 30 days',
      icon: CheckCircle,
      color: 'text-primary bg-primary/10',
      change: null
    }
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Admin Overview</h1>
        <p className="text-muted-foreground mt-2">
          Monitor and manage your Mob Translate platform
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {statCards.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {stat.title}
              </CardTitle>
              <div className={`p-2 rounded-lg ${stat.color}`}>
                <stat.icon className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {typeof stat.value === 'number' ? stat.value.toLocaleString() : stat.value}
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {stat.description}
                </p>
                {stat.change && (
                  <span className="text-xs font-medium text-success">
                    {stat.change}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Activity Overview */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Recent Activity
            </CardTitle>
            <CardDescription>Latest actions across the platform</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentActivity && recentActivity.length > 0 ? (
                recentActivity.slice(0, 5).map((activity: any) => {
                  const getActivityIcon = () => {
                    switch (activity.activity_type) {
                      case 'word_approved':
                      case 'improvement_approved':
                        return <CheckCircle className="h-4 w-4 text-success" />;
                      case 'word_rejected':
                      case 'improvement_rejected':
                        return <Clock className="h-4 w-4 text-error" />;
                      case 'comment_created':
                      case 'comment_moderated':
                        return <MessageSquare className="h-4 w-4 text-foreground" />;
                      case 'user_role_assigned':
                        return <Users className="h-4 w-4 text-primary" />;
                      default:
                        return <Activity className="h-4 w-4 text-muted-foreground" />;
                    }
                  };

                  const getActivityColor = () => {
                    switch (activity.activity_type) {
                      case 'word_approved':
                      case 'improvement_approved':
                        return 'bg-success/10';
                      case 'word_rejected':
                      case 'improvement_rejected':
                        return 'bg-error/10';
                      case 'comment_created':
                      case 'comment_moderated':
                        return 'bg-muted';
                      case 'user_role_assigned':
                        return 'bg-primary/10';
                      default:
                        return 'bg-muted';
                    }
                  };

                  const getActivityDescription = () => {
                    const userName = activity.profiles?.display_name || activity.profiles?.username || 'Unknown user';
                    const languageName = activity.languages?.name || 'Unknown language';
                    
                    switch (activity.activity_type) {
                      case 'word_approved':
                        return `${userName} approved words in ${languageName}`;
                      case 'word_rejected':
                        return `${userName} rejected words in ${languageName}`;
                      case 'improvement_approved':
                        return `${userName} approved improvements`;
                      case 'improvement_rejected':
                        return `${userName} rejected improvements`;
                      case 'comment_created':
                        return `${userName} commented on a word`;
                      case 'comment_moderated':
                        return `${userName} moderated comments`;
                      case 'user_role_assigned':
                        return `${userName} was assigned a new role`;
                      default:
                        return `${userName} performed ${activity.activity_type}`;
                    }
                  };

                  const formatTimeAgo = (date: string) => {
                    const now = new Date();
                    const activityDate = new Date(date);
                    const diffMs = now.getTime() - activityDate.getTime();
                    const diffMins = Math.floor(diffMs / 60000);
                    const diffHours = Math.floor(diffMs / 3600000);
                    const diffDays = Math.floor(diffMs / 86400000);

                    if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
                    if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
                    if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
                    return activityDate.toLocaleDateString();
                  };

                  return (
                    <div key={activity.id} className="flex items-start gap-3">
                      <div className={`h-8 w-8 rounded-full ${getActivityColor()} flex items-center justify-center`}>
                        {getActivityIcon()}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium">{activity.activity_type.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}</p>
                        <p className="text-xs text-muted-foreground">{getActivityDescription()}</p>
                        <p className="text-xs text-muted-foreground">{formatTimeAgo(activity.created_at)}</p>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">No recent activity</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Platform Statistics
            </CardTitle>
            <CardDescription>Key metrics and insights</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {(pendingReviews || 0) > 0 && (
                <div className="flex items-start gap-3">
                  <div className="h-8 w-8 rounded-full bg-warning/10 flex items-center justify-center">
                    <Clock className="h-4 w-4 text-warning" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">Pending Reviews</p>
                    <p className="text-xs text-muted-foreground">{pendingReviews} words awaiting verification</p>
                    <p className="text-xs text-muted-foreground">Across all languages</p>
                  </div>
                </div>
              )}
              {(improvements || 0) > 0 && (
                <div className="flex items-start gap-3">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <TrendingUp className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">Improvement Suggestions</p>
                    <p className="text-xs text-muted-foreground">{improvements} suggestions pending review</p>
                    <p className="text-xs text-muted-foreground">From community contributors</p>
                  </div>
                </div>
              )}
              <div className="flex items-start gap-3">
                <div className="h-8 w-8 rounded-full bg-success/10 flex items-center justify-center">
                  <CheckCircle className="h-4 w-4 text-success" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">Monthly Activity</p>
                  <p className="text-xs text-muted-foreground">{activeUsers} active users this month</p>
                  <p className="text-xs text-muted-foreground">{approvalRate}% approval rate</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}