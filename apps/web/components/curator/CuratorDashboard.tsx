'use client';

import { useState, useEffect } from 'react';
import { Shield, MessageSquare, Lightbulb, FileCheck, Activity, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Button, Badge, Tabs, TabsContent, TabsList, TabsTrigger, Select, SelectPortal, SelectPositioner, SelectPopup, SelectItem, SelectTrigger, SelectValue } from '@mobtranslate/ui';
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
  languageId?: string;
  languageName?: string;
}

export function CuratorDashboard({ languageId, languageName }: CuratorDashboardProps) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTab, setSelectedTab] = useState('overview');

  useEffect(() => {
    fetchDashboardData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        return <FileCheck className="h-4 w-4 text-success" />;
      case 'improvement_approved':
        return <Lightbulb className="h-4 w-4 text-primary" />;
      case 'improvement_rejected':
        return <Lightbulb className="h-4 w-4 text-error" />;
      case 'comment_moderated':
        return <MessageSquare className="h-4 w-4 text-warning" />;
      default:
        return <Activity className="h-4 w-4 text-muted-foreground" />;
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
          <p className="text-muted-foreground">
            Managing {languageName} dictionary
          </p>
        </div>
        
        <Select defaultValue={languageId}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectPortal><SelectPositioner><SelectPopup>
            <SelectItem value={languageId}>{languageName}</SelectItem>
          </SelectPopup></SelectPositioner></SelectPortal>
        </Select>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatsCard
          title="Pending Reviews"
          value={data.stats.pending_improvements}
          icon={Lightbulb}
          iconColor="text-primary"
        />
        <StatsCard
          title="Recent Comments"
          value={data.stats.recent_comments}
          description="Last 24 hours"
          icon={MessageSquare}
          iconColor="text-success"
        />
        <StatsCard
          title="Unverified Words"
          value={data.stats.unverified_words}
          icon={FileCheck}
          iconColor="text-warning"
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
                        <div className="text-sm text-muted-foreground">
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
                    <p className="text-center text-muted-foreground py-4">
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
                        <p className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(activity.created_at))}
                        </p>
                      </div>
                    </div>
                  ))}
                  {data.recent_activity.length === 0 && (
                    <p className="text-center text-muted-foreground py-4">
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
              <p className="text-center text-muted-foreground py-8">
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
                      <p className="text-xs text-muted-foreground">
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
              description="This month"
              icon={FileCheck}
              iconColor="text-primary"
            />
            <StatsCard
              title="Words Approved"
              value={data.curator_metrics.words_approved}
              description="This month"
              icon={TrendingUp}
              iconColor="text-success"
            />
            <StatsCard
              title="Improvements Reviewed"
              value={data.curator_metrics.improvements_reviewed}
              description="This month"
              icon={Lightbulb}
              iconColor="text-warning"
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}