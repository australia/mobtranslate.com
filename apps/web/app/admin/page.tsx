import { redirect } from 'next/navigation';
import { and, count, desc, eq, gte, inArray, lt } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import { sql } from 'drizzle-orm';
import { getSessionUser, userHasRole } from '@/lib/auth-helpers';
import {
  curatorActivities as curatorActivitiesT,
  languages as languagesT,
  userProfiles as userProfilesT,
  wordComments as wordCommentsT,
  wordImprovementSuggestions as wisT,
  words as wordsT,
} from '@/lib/db/schema';
import { Users, FileText, MessageSquare, TrendingUp, Clock, CheckCircle, Activity, Calendar } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@mobtranslate/ui';

export default async function AdminDashboard() {
  // Check authentication
  const user = await getSessionUser();
  if (!user) {
    redirect('/auth/signin?redirect=/admin');
  }

  // Check if user is admin
  const isAdmin = await userHasRole(user.id, ['super_admin', 'dictionary_admin']);
  if (!isAdmin) {
    redirect('/');
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Fetch stats
  const [
    totalUsersResult,
    activeUsersRows,
    totalWordsRows,
    pendingReviewsRows,
    totalCommentsRows,
    improvementRows,
    recentActivityRows,
    totalLanguagesRows,
  ] = await Promise.all([
    // Total users — count from auth.users via the count_auth_users() SQL function.
    db.execute(sql`select public.count_auth_users() as count`),

    // Active users (last 30 days) — count from user_profiles
    db
      .select({ value: count() })
      .from(userProfilesT)
      .where(gte(userProfilesT.updatedAt, thirtyDaysAgo)),

    // Total words
    db.select({ value: count() }).from(wordsT),

    // Pending reviews
    db.select({ value: count() }).from(wordsT).where(eq(wordsT.isVerified, false)),

    // Total comments
    db.select({ value: count() }).from(wordCommentsT).where(eq(wordCommentsT.isDeleted, false)),

    // Improvement suggestions
    db.select({ value: count() }).from(wisT).where(eq(wisT.status, 'pending')),

    // Recent activity (last 10 actions) + the actor's profile + the language name.
    db
      .select({
        id: curatorActivitiesT.id,
        activity_type: curatorActivitiesT.activityType,
        activity_data: curatorActivitiesT.activityData,
        created_at: curatorActivitiesT.createdAt,
        user_id: curatorActivitiesT.userId,
        language_id: curatorActivitiesT.languageId,
        language_name: languagesT.name,
        display_name: userProfilesT.displayName,
        username: userProfilesT.username,
      })
      .from(curatorActivitiesT)
      .leftJoin(languagesT, eq(curatorActivitiesT.languageId, languagesT.id))
      .leftJoin(userProfilesT, eq(curatorActivitiesT.userId, userProfilesT.userId))
      .orderBy(desc(curatorActivitiesT.createdAt))
      .limit(10),

    // Total active languages
    db.select({ value: count() }).from(languagesT).where(eq(languagesT.isActive, true)),
  ]);

  const activeUsers = activeUsersRows[0]?.value ?? 0;
  const totalWords = totalWordsRows[0]?.value ?? 0;
  const pendingReviews = pendingReviewsRows[0]?.value ?? 0;
  const totalComments = totalCommentsRows[0]?.value ?? 0;
  const improvements = improvementRows[0]?.value ?? 0;
  const totalLanguages = totalLanguagesRows[0]?.value ?? 0;

  // Shape recent activity to match the original nested relation embeds.
  const recentActivity = recentActivityRows.map((r) => ({
    id: r.id,
    activity_type: r.activity_type,
    activity_data: r.activity_data,
    created_at: r.created_at,
    user_id: r.user_id,
    language_id: r.language_id,
    languages: r.language_name ? { name: r.language_name } : null,
    profiles: r.display_name || r.username
      ? { display_name: r.display_name, username: r.username }
      : null,
  }));

  // Calculate approval rate (last 30 days)
  const [approvedRows, rejectedRows] = await Promise.all([
    db
      .select({ value: count() })
      .from(curatorActivitiesT)
      .where(
        and(
          inArray(curatorActivitiesT.activityType, ['word_approved', 'improvement_approved']),
          gte(curatorActivitiesT.createdAt, thirtyDaysAgo)
        )
      ),
    db
      .select({ value: count() })
      .from(curatorActivitiesT)
      .where(
        and(
          inArray(curatorActivitiesT.activityType, ['word_rejected', 'improvement_rejected']),
          gte(curatorActivitiesT.createdAt, thirtyDaysAgo)
        )
      ),
  ]);
  const approvedCount = approvedRows[0]?.value ?? 0;
  const rejectedCount = rejectedRows[0]?.value ?? 0;

  const totalReviews = approvedCount + rejectedCount;
  const approvalRate = totalReviews > 0 ? Math.round((approvedCount / totalReviews) * 100) : 0;

  // Handle totalUsers from the count_auth_users() result, falling back to a
  // user_profiles count if it returns nothing.
  const authCountRows: any[] = Array.isArray(totalUsersResult)
    ? totalUsersResult
    : (totalUsersResult as any)?.rows ?? [];
  let totalUsers = 0;
  const rawCount = authCountRows[0]?.count;
  if (rawCount !== null && rawCount !== undefined) {
    totalUsers = Number(rawCount) || 0;
  } else {
    const fallback = await db.select({ value: count() }).from(userProfilesT);
    totalUsers = fallback[0]?.value ?? 0;
  }

  // Calculate growth percentages
  const previousMonthUsersRows = await db
    .select({ value: count() })
    .from(userProfilesT)
    .where(lt(userProfilesT.createdAt, thirtyDaysAgo));
  const previousMonthUsers = previousMonthUsersRows[0]?.value ?? 0;

  const userGrowth = previousMonthUsers > 0
    ? Math.round(((totalUsers - previousMonthUsers) / previousMonthUsers) * 100)
    : 0;

  const previousMonthWordsRows = await db
    .select({ value: count() })
    .from(wordsT)
    .where(lt(wordsT.createdAt, thirtyDaysAgo));
  const previousMonthWords = previousMonthWordsRows[0]?.value ?? 0;

  const wordGrowth = previousMonthWords > 0
    ? Math.round(((totalWords - previousMonthWords) / previousMonthWords) * 100)
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

      {/* Stats Grid — left-aligned tiles */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {statCards.map((stat) => (
          <div key={stat.title} className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-muted-foreground">{stat.title}</p>
              <div className={`p-1.5 rounded-lg ${stat.color}`}>
                <stat.icon className="h-4 w-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-semibold tabular-nums tracking-tight">
                {typeof stat.value === 'number' ? stat.value.toLocaleString() : stat.value}
              </span>
              {stat.change && (
                <span className="text-xs font-medium text-success">{stat.change}</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">{stat.description}</p>
          </div>
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
