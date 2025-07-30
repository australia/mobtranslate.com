'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select';
import { 
  BarChart3, 
  TrendingUp, 
  Users, 
  FileText, 
  Activity,
  Calendar,
  Globe,
  MessageSquare
} from 'lucide-react';

interface AnalyticsData {
  userGrowth: Array<{ date: string; count: number }>;
  wordSubmissions: Array<{ date: string; count: number }>;
  curatorActivity: Array<{ curator: string; approved: number; rejected: number }>;
  languageStats: Array<{ language: string; words: number; growth: number }>;
  engagementMetrics: {
    dailyActiveUsers: number;
    avgCommentsPerWord: number;
    avgApprovalsPerDay: number;
    topContributors: Array<{ name: string; contributions: number }>;
  };
}

export default function AnalyticsPage() {
  const [timeRange, setTimeRange] = useState('30d');
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnalytics();
  }, [timeRange]);

  const fetchAnalytics = async () => {
    try {
      const response = await fetch(`/api/v2/admin/analytics?range=${timeRange}`);
      if (response.ok) {
        const data = await response.json();
        setAnalyticsData(data);
      }
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  // Mock data for demonstration
  const mockData: AnalyticsData = {
    userGrowth: [
      { date: '2024-01-01', count: 150 },
      { date: '2024-01-08', count: 165 },
      { date: '2024-01-15', count: 180 },
      { date: '2024-01-22', count: 195 },
      { date: '2024-01-29', count: 210 }
    ],
    wordSubmissions: [
      { date: '2024-01-01', count: 45 },
      { date: '2024-01-08', count: 52 },
      { date: '2024-01-15', count: 48 },
      { date: '2024-01-22', count: 61 },
      { date: '2024-01-29', count: 55 }
    ],
    curatorActivity: [
      { curator: 'John Doe', approved: 125, rejected: 15 },
      { curator: 'Jane Smith', approved: 98, rejected: 12 },
      { curator: 'Bob Wilson', approved: 87, rejected: 8 },
      { curator: 'Alice Brown', approved: 76, rejected: 10 }
    ],
    languageStats: [
      { language: 'Kuku Yalanji', words: 1250, growth: 12 },
      { language: 'Yawuru', words: 890, growth: 8 },
      { language: 'Warlpiri', words: 675, growth: 15 },
      { language: 'Arrernte', words: 542, growth: 5 }
    ],
    engagementMetrics: {
      dailyActiveUsers: 45,
      avgCommentsPerWord: 2.3,
      avgApprovalsPerDay: 12,
      topContributors: [
        { name: 'Sarah Johnson', contributions: 89 },
        { name: 'Mike Chen', contributions: 76 },
        { name: 'Emma Davis', contributions: 64 },
        { name: 'Tom Wilson', contributions: 58 }
      ]
    }
  };

  const data = analyticsData || mockData;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
          <p className="text-muted-foreground mt-2">
            Platform insights and performance metrics
          </p>
        </div>
        <Select value={timeRange} onValueChange={setTimeRange}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="90d">Last 90 days</SelectItem>
            <SelectItem value="1y">Last year</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Daily Active Users
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.engagementMetrics.dailyActiveUsers}</div>
            <p className="text-xs text-muted-foreground">
              <span className="text-green-600">+12%</span> from last period
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Avg Comments/Word
            </CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.engagementMetrics.avgCommentsPerWord}</div>
            <p className="text-xs text-muted-foreground">
              User engagement metric
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Approvals/Day
            </CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.engagementMetrics.avgApprovalsPerDay}</div>
            <p className="text-xs text-muted-foreground">
              Average daily approvals
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Languages
            </CardTitle>
            <Globe className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.languageStats.length}</div>
            <p className="text-xs text-muted-foreground">
              Active languages
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Analytics */}
      <Tabs defaultValue="growth" className="space-y-4">
        <TabsList>
          <TabsTrigger value="growth">Growth</TabsTrigger>
          <TabsTrigger value="languages">Languages</TabsTrigger>
          <TabsTrigger value="curators">Curators</TabsTrigger>
          <TabsTrigger value="contributors">Contributors</TabsTrigger>
        </TabsList>

        <TabsContent value="growth" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>User Growth</CardTitle>
                <CardDescription>New user registrations over time</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64 flex items-center justify-center text-muted-foreground">
                  <BarChart3 className="h-8 w-8 mr-2" />
                  Chart visualization would go here
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Word Submissions</CardTitle>
                <CardDescription>New words added over time</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64 flex items-center justify-center text-muted-foreground">
                  <TrendingUp className="h-8 w-8 mr-2" />
                  Chart visualization would go here
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="languages" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Language Statistics</CardTitle>
              <CardDescription>Word count and growth by language</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {data.languageStats.map((lang) => (
                  <div key={lang.language} className="flex items-center justify-between">
                    <div className="flex-1">
                      <p className="font-medium">{lang.language}</p>
                      <p className="text-sm text-muted-foreground">{lang.words} words</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-green-600">
                        +{lang.growth}%
                      </p>
                      <p className="text-xs text-muted-foreground">growth</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="curators" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Curator Activity</CardTitle>
              <CardDescription>Review statistics by curator</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {data.curatorActivity.map((curator) => (
                  <div key={curator.curator} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="font-medium">{curator.curator}</p>
                      <p className="text-sm text-muted-foreground">
                        {curator.approved + curator.rejected} total reviews
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <div className="flex-1 h-2 bg-green-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-green-600"
                          style={{ 
                            width: `${(curator.approved / (curator.approved + curator.rejected)) * 100}%` 
                          }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {Math.round((curator.approved / (curator.approved + curator.rejected)) * 100)}% approved
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="contributors" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Top Contributors</CardTitle>
              <CardDescription>Most active word contributors</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {data.engagementMetrics.topContributors.map((contributor, index) => (
                  <div key={contributor.name} className="flex items-center gap-4">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium">
                      {index + 1}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">{contributor.name}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">{contributor.contributions}</p>
                      <p className="text-xs text-muted-foreground">contributions</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}