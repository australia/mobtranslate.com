'use client';

import { useState, useEffect } from 'react';
import { Shield, MessageSquare, Lightbulb, FileCheck, Activity, Users, TrendingUp, Clock } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Badge } from '@/app/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select';
import { StatsCard } from '@/components/stats/StatsCard';
import { formatDistanceToNow } from '@/lib/utils/date';

interface DashboardData {
  stats: {
    pending_improvements: number;
    recent_comments: number;
    unverified_words: number;
  };
  recent_activity: Array<{
    id: string;
    activity_type: string;
    target_type: string;
    target_id: string;
    activity_data: any;
    created_at: string;
    user: {
      display_name: string;
      avatar_url?: string;
    };
  }>;
  words_needing_review: Array<{
    id: string;
    word: string;
    language_name: string;
    quality_score: number;
    definition_count: number;
    translation_count: number;
    example_count: number;
    created_at: string;
  }>;
  curator_metrics: {
    words_reviewed: number;
    words_approved: number;
    words_rejected: number;
    improvements_reviewed: number;
    comments_moderated: number;
  };
}

interface CuratorDashboardProps {
  languageId: string;
  languageName: string;
}

export function CuratorDashboard({ languageId, languageName }: CuratorDashboardProps) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTab, setSelectedTab] = useState('overview');

  useEffect(() => {
    fetchDashboardData();
  }, [languageId]);

  const fetchDashboardData = async () => {
    try {
      const response = await fetch(`/api/v2/curator/dashboard/${languageId}`);
      if (!response.ok) throw new Error('Failed to fetch dashboard data');
      const dashboardData = await response.json();
      setData(dashboardData);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getActivityIcon = (activityType: string) => {
    switch (activityType) {
      case 'word_verified':
      case 'word_approved':
        return <FileCheck className="h-4 w-4 text-green-600" />;
      case 'improvement_approved':
        return <Lightbulb className="h-4 w-4 text-blue-600" />;
      case 'improvement_rejected':
        return <Lightbulb className="h-4 w-4 text-red-600" />;
      case 'comment_moderated':
        return <MessageSquare className="h-4 w-4 text-orange-600" />;
      default:
        return <Activity className="h-4 w-4 text-gray-600" />;
    }
  };

  const getActivityDescription = (activity: any) => {
    const { activity_type, activity_data, user } = activity;
    const username = user.display_name;
    
    switch (activity_type) {
      case 'word_verified':
        return `${username} verified word "${activity_data?.word}"`;
      case 'improvement_approved':
        return `${username} approved an improvement suggestion`;
      case 'improvement_rejected':
        return `${username} rejected an improvement suggestion`;
      case 'comment_moderated':
        return `${username} moderated a comment`;
      default:
        return `${username} performed ${activity_type.replace(/_/g, ' ')}`;
    }
  };

  if (loading) {
    return <div className="animate-pulse">Loading dashboard...</div>;
  }

  if (!data) {
    return <div>Failed to load dashboard data</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6" />
            Curator Dashboard
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Managing {languageName} dictionary
          </p>
        </div>
        
        <Select defaultValue={languageId}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={languageId}>{languageName}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatsCard
          title="Pending Reviews"
          value={data.stats.pending_improvements}
          icon={<Lightbulb className="h-5 w-5" />}
          trend={data.stats.pending_improvements > 10 ? 'up' : 'stable'}
          color="blue"
        />
        <StatsCard
          title="Recent Comments"
          value={data.stats.recent_comments}
          subtitle="Last 24 hours"
          icon={<MessageSquare className="h-5 w-5" />}
          trend="stable"
          color="green"
        />
        <StatsCard
          title="Unverified Words"
          value={data.stats.unverified_words}
          icon={<FileCheck className="h-5 w-5" />}
          trend={data.stats.unverified_words > 50 ? 'up' : 'down'}
          color="orange"
        />
      </div>

      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="reviews">Reviews</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="metrics">Metrics</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Words Needing Review */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileCheck className="h-5 w-5" />
                  Words Needing Review
                </CardTitle>
                <CardDescription>
                  Words with low quality scores or pending verification
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {data.words_needing_review.slice(0, 5).map((word) => (
                    <div key={word.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <div className="font-medium">{word.word}</div>
                        <div className="text-sm text-gray-600">
                          Quality Score: {word.quality_score}% • 
                          {word.definition_count} definitions • 
                          {word.translation_count} translations
                        </div>
                      </div>
                      <Button size="sm" variant="outline">
                        Review
                      </Button>
                    </div>
                  ))}
                  {data.words_needing_review.length === 0 && (
                    <p className="text-center text-gray-500 py-4">
                      No words need review right now
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Recent Activity */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Recent Activity
                </CardTitle>
                <CardDescription>
                  Latest curation activities in this language
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {data.recent_activity.slice(0, 5).map((activity) => (
                    <div key={activity.id} className="flex items-start gap-3">
                      {getActivityIcon(activity.activity_type)}
                      <div className="flex-1">
                        <p className="text-sm">{getActivityDescription(activity)}</p>
                        <p className="text-xs text-gray-500">
                          {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                  ))}
                  {data.recent_activity.length === 0 && (
                    <p className="text-center text-gray-500 py-4">
                      No recent activity
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="reviews">
          <Card>
            <CardHeader>
              <CardTitle>Pending Reviews</CardTitle>
              <CardDescription>
                Improvement suggestions and submissions awaiting your review
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-center text-gray-500 py-8">
                Review queue will be implemented here
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity">
          <Card>
            <CardHeader>
              <CardTitle>Activity Log</CardTitle>
              <CardDescription>
                Complete history of curation activities
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {data.recent_activity.map((activity) => (
                  <div key={activity.id} className="flex items-start gap-3 p-3 border rounded-lg">
                    {getActivityIcon(activity.activity_type)}
                    <div className="flex-1">
                      <p className="text-sm font-medium">{getActivityDescription(activity)}</p>
                      <p className="text-xs text-gray-500">
                        {new Date(activity.created_at).toLocaleString()}
                      </p>
                      {activity.activity_data && (
                        <div className="mt-2">
                          <Badge variant="secondary" className="text-xs">
                            {activity.target_type}
                          </Badge>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="metrics">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <StatsCard
              title="Words Reviewed"
              value={data.curator_metrics.words_reviewed}
              subtitle="This month"
              icon={<FileCheck className="h-5 w-5" />}
              trend="up"
              color="blue"
            />
            <StatsCard
              title="Words Approved"
              value={data.curator_metrics.words_approved}
              subtitle="This month"
              icon={<TrendingUp className="h-5 w-5" />}
              trend="up"
              color="green"
            />
            <StatsCard
              title="Improvements Reviewed"
              value={data.curator_metrics.improvements_reviewed}
              subtitle="This month"
              icon={<Lightbulb className="h-5 w-5" />}
              trend="stable"
              color="orange"
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}