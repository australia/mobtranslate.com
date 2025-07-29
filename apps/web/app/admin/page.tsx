import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Users, FileText, MessageSquare, TrendingUp, Clock, CheckCircle, Activity, Calendar } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ui/components/card';

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
    { count: totalUsers = 0 },
    { count: totalWords = 0 },
    { count: pendingReviews = 0 },
    { count: totalComments = 0 },
    { count: improvements = 0 }
  ] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('dictionary_words').select('*', { count: 'exact', head: true }),
    supabase.from('dictionary_words').select('*', { count: 'exact', head: true }).eq('is_verified', false),
    supabase.from('word_comments').select('*', { count: 'exact', head: true }),
    supabase.from('improvement_suggestions').select('*', { count: 'exact', head: true }).eq('status', 'pending')
  ]);

  const statCards = [
    {
      title: 'Total Users',
      value: totalUsers,
      description: 'Registered users',
      icon: Users,
      color: 'text-blue-600 bg-blue-100',
      change: '+12%'
    },
    {
      title: 'Pending Reviews',
      value: pendingReviews,
      description: 'Words awaiting review',
      icon: Clock,
      color: 'text-orange-600 bg-orange-100',
      change: null
    },
    {
      title: 'Total Words',
      value: totalWords,
      description: 'Across all languages',
      icon: FileText,
      color: 'text-green-600 bg-green-100',
      change: '+5%'
    },
    {
      title: 'Comments',
      value: totalComments,
      description: 'User interactions',
      icon: MessageSquare,
      color: 'text-purple-600 bg-purple-100',
      change: '+23%'
    },
    {
      title: 'Improvements',
      value: improvements,
      description: 'Pending suggestions',
      icon: TrendingUp,
      color: 'text-indigo-600 bg-indigo-100',
      change: null
    },
    {
      title: 'Approval Rate',
      value: '92%',
      description: 'Last 30 days',
      icon: CheckCircle,
      color: 'text-teal-600 bg-teal-100',
      change: '+2%'
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
                  <span className="text-xs font-medium text-green-600">
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
              <div className="flex items-start gap-3">
                <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
                  <Users className="h-4 w-4 text-blue-600" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">New curator assigned</p>
                  <p className="text-xs text-muted-foreground">John Doe assigned to Kuku Yalanji</p>
                  <p className="text-xs text-muted-foreground">2 hours ago</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="h-8 w-8 rounded-full bg-green-100 flex items-center justify-center">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">Bulk approval</p>
                  <p className="text-xs text-muted-foreground">25 words approved in Yawuru</p>
                  <p className="text-xs text-muted-foreground">5 hours ago</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="h-8 w-8 rounded-full bg-purple-100 flex items-center justify-center">
                  <MessageSquare className="h-4 w-4 text-purple-600" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">Comment flagged</p>
                  <p className="text-xs text-muted-foreground">Inappropriate content reported</p>
                  <p className="text-xs text-muted-foreground">1 day ago</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Upcoming Tasks
            </CardTitle>
            <CardDescription>Scheduled reviews and deadlines</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="h-8 w-8 rounded-full bg-orange-100 flex items-center justify-center">
                  <Clock className="h-4 w-4 text-orange-600" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">Document review deadline</p>
                  <p className="text-xs text-muted-foreground">5 documents pending from last week</p>
                  <p className="text-xs text-muted-foreground">Due in 2 days</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center">
                  <TrendingUp className="h-4 w-4 text-indigo-600" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">Monthly curation report</p>
                  <p className="text-xs text-muted-foreground">Generate and review monthly stats</p>
                  <p className="text-xs text-muted-foreground">Due in 5 days</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}