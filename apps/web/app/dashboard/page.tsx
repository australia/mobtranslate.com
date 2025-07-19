'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import SharedLayout from '../components/SharedLayout';
import { PageHeader, Section, Card, CardContent, CardHeader, CardTitle, Badge, Button, LoadingState } from '@ui/components';
import { 
  TrendingUp, 
  Brain, 
  Clock, 
  Target, 
  Calendar,
  BarChart3,
  Trophy,
  Zap,
  Activity,
  Users,
  BookOpen,
  Timer
} from 'lucide-react';

interface DashboardStats {
  overview: {
    totalSessions: number;
    totalQuestions: number;
    overallAccuracy: number;
    currentStreak: number;
    longestStreak: number;
    totalStudyTime: number;
    wordsLearned: number;
    wordsMastered: number;
  };
  recentActivity: Array<{
    date: string;
    sessions: number;
    accuracy: number;
    streak: number;
    studyTime: number;
  }>;
  languageProgress: Array<{
    language: string;
    code: string;
    sessions: number;
    accuracy: number;
    wordsLearned: number;
    lastSession: string;
  }>;
  performanceByBucket: Array<{
    bucket: number;
    bucketName: string;
    accuracy: number;
    totalQuestions: number;
    avgResponseTime: number;
  }>;
  timeOfDayStats: Array<{
    hour: number;
    sessions: number;
    accuracy: number;
  }>;
  streakHistory: Array<{
    date: string;
    streak: number;
    sessions: number;
  }>;
  weeklyProgress: Array<{
    week: string;
    sessions: number;
    accuracy: number;
    questionsAnswered: number;
  }>;
}

export default function DashboardPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d' | 'all'>('30d');

  useEffect(() => {
    if (loading) return;
    
    if (!user) {
      router.push('/auth/signin?redirect=/dashboard');
      return;
    }

    fetchDashboardStats();
  }, [user, loading, timeRange]);

  const fetchDashboardStats = async () => {
    setIsLoadingStats(true);
    try {
      const response = await fetch(`/api/v2/dashboard/analytics?period=${timeRange}`);
      const data = await response.json();
      
      if (data.error) {
        console.error('Error fetching dashboard stats:', data.error);
        return;
      }
      
      setStats(data);
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
    } finally {
      setIsLoadingStats(false);
    }
  };

  const formatStudyTime = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  const getPerformanceColor = (accuracy: number) => {
    if (accuracy >= 90) return 'text-green-600';
    if (accuracy >= 80) return 'text-blue-600';
    if (accuracy >= 70) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getBucketName = (bucket: number) => {
    const names = ['New', 'Learning', 'Learning+', 'Review', 'Review+', 'Mastered'];
    return names[bucket] || 'Unknown';
  };

  // Show loading while checking auth
  if (loading) {
    return (
      <SharedLayout>
        <Section>
          <LoadingState />
        </Section>
      </SharedLayout>
    );
  }

  if (!user) {
    return null; // Will redirect
  }

  return (
    <SharedLayout>
      <PageHeader 
        title="Your Learning Dashboard"
        description="Track your progress and discover insights about your learning journey"
      >
        <div className="flex items-center gap-2 mt-4">
          <select 
            value={timeRange} 
            onChange={(e) => setTimeRange(e.target.value as any)}
            className="px-3 py-1 border rounded-md text-sm"
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="all">All time</option>
          </select>
        </div>
      </PageHeader>

      <Section>
        {isLoadingStats ? (
          <LoadingState />
        ) : !stats ? (
          <Card>
            <CardContent className="text-center py-12">
              <Brain className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Data Yet</h3>
              <p className="text-muted-foreground mb-6">
                Start practicing to see your learning analytics here.
              </p>
              <Button onClick={() => router.push('/learn')}>
                Start Learning
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* Overview Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-4 text-center">
                  <div className="text-2xl font-bold text-blue-600 mb-1">
                    {stats.overview.totalSessions}
                  </div>
                  <div className="text-sm text-muted-foreground flex items-center justify-center gap-1">
                    <Calendar className="h-3 w-3" />
                    Sessions
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4 text-center">
                  <div className={`text-2xl font-bold mb-1 ${getPerformanceColor(stats.overview.overallAccuracy)}`}>
                    {stats.overview.overallAccuracy.toFixed(0)}%
                  </div>
                  <div className="text-sm text-muted-foreground flex items-center justify-center gap-1">
                    <Target className="h-3 w-3" />
                    Accuracy
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4 text-center">
                  <div className="text-2xl font-bold text-orange-600 mb-1">
                    {stats.overview.currentStreak}
                  </div>
                  <div className="text-sm text-muted-foreground flex items-center justify-center gap-1">
                    <Zap className="h-3 w-3" />
                    Current Streak
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4 text-center">
                  <div className="text-2xl font-bold text-purple-600 mb-1">
                    {formatStudyTime(stats.overview.totalStudyTime)}
                  </div>
                  <div className="text-sm text-muted-foreground flex items-center justify-center gap-1">
                    <Timer className="h-3 w-3" />
                    Study Time
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Secondary Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-4 text-center">
                  <div className="text-xl font-semibold text-green-600 mb-1">
                    {stats.overview.wordsMastered}
                  </div>
                  <div className="text-sm text-muted-foreground">Words Mastered</div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4 text-center">
                  <div className="text-xl font-semibold text-blue-600 mb-1">
                    {stats.overview.wordsLearned}
                  </div>
                  <div className="text-sm text-muted-foreground">Words Learning</div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4 text-center">
                  <div className="text-xl font-semibold text-yellow-600 mb-1">
                    {stats.overview.longestStreak}
                  </div>
                  <div className="text-sm text-muted-foreground">Best Streak</div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4 text-center">
                  <div className="text-xl font-semibold text-indigo-600 mb-1">
                    {stats.overview.totalQuestions}
                  </div>
                  <div className="text-sm text-muted-foreground">Questions Answered</div>
                </CardContent>
              </Card>
            </div>

            {/* Performance by Difficulty Level */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Performance by Difficulty Level
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {stats.performanceByBucket.map((bucket) => (
                    <div key={bucket.bucket} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Badge variant="outline">{getBucketName(bucket.bucket)}</Badge>
                          <span className="text-sm text-muted-foreground">
                            {bucket.totalQuestions} questions
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-sm">
                          <span className={getPerformanceColor(bucket.accuracy)}>
                            {bucket.accuracy.toFixed(0)}% accuracy
                          </span>
                          <span className="text-muted-foreground">
                            {(bucket.avgResponseTime / 1000).toFixed(1)}s avg
                          </span>
                        </div>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className={`h-2 rounded-full ${
                            bucket.accuracy >= 90 ? 'bg-green-500' :
                            bucket.accuracy >= 80 ? 'bg-blue-500' :
                            bucket.accuracy >= 70 ? 'bg-yellow-500' : 'bg-red-500'
                          }`}
                          style={{ width: `${bucket.accuracy}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Language Progress */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5" />
                  Progress by Language
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-2 gap-4">
                  {stats.languageProgress.map((lang) => (
                    <div key={lang.code} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-semibold">{lang.language}</h4>
                        <Badge variant="secondary">{lang.sessions} sessions</Badge>
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span>Accuracy</span>
                          <span className={getPerformanceColor(lang.accuracy)}>
                            {lang.accuracy.toFixed(0)}%
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span>Words Learning</span>
                          <span>{lang.wordsLearned}</span>
                        </div>
                        <div className="flex justify-between text-sm text-muted-foreground">
                          <span>Last Session</span>
                          <span>{new Date(lang.lastSession).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Recent Activity Timeline */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Recent Activity
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {stats.recentActivity.slice(0, 7).map((day, index) => (
                    <div key={day.date} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="text-sm font-medium">
                          {new Date(day.date).toLocaleDateString('en-US', { 
                            weekday: 'short', 
                            month: 'short', 
                            day: 'numeric' 
                          })}
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {day.sessions} session{day.sessions !== 1 ? 's' : ''}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        <span className={getPerformanceColor(day.accuracy)}>
                          {day.accuracy.toFixed(0)}%
                        </span>
                        <span className="text-muted-foreground">
                          {formatStudyTime(day.studyTime)}
                        </span>
                        {day.streak > 0 && (
                          <Badge variant="secondary" className="text-xs">
                            <Zap className="h-3 w-3 mr-1" />
                            {day.streak}
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Study Time by Hour */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Your Learning Schedule
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-12 gap-1">
                  {Array.from({ length: 24 }, (_, hour) => {
                    const hourData = stats.timeOfDayStats.find(h => h.hour === hour);
                    const sessions = hourData?.sessions || 0;
                    const maxSessions = Math.max(...stats.timeOfDayStats.map(h => h.sessions));
                    const intensity = maxSessions > 0 ? sessions / maxSessions : 0;
                    
                    return (
                      <div key={hour} className="text-center">
                        <div 
                          className={`h-8 rounded mb-1 ${
                            intensity > 0.7 ? 'bg-blue-500' :
                            intensity > 0.4 ? 'bg-blue-300' :
                            intensity > 0.1 ? 'bg-blue-100' : 'bg-gray-100'
                          }`}
                          title={`${hour}:00 - ${sessions} sessions`}
                        />
                        <div className="text-xs text-muted-foreground">
                          {hour}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-4 text-sm text-muted-foreground">
                  Your most active learning time: {
                    stats.timeOfDayStats.length > 0 
                      ? `${stats.timeOfDayStats.reduce((max, curr) => curr.sessions > max.sessions ? curr : max).hour}:00`
                      : 'No data yet'
                  }
                </div>
              </CardContent>
            </Card>

            {/* Weekly Progress Trend */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Weekly Progress Trend
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {stats.weeklyProgress.map((week, index) => (
                    <div key={week.week} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="text-sm font-medium">
                          Week of {new Date(week.week).toLocaleDateString()}
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        <span>{week.sessions} sessions</span>
                        <span className={getPerformanceColor(week.accuracy)}>
                          {week.accuracy.toFixed(0)}%
                        </span>
                        <span className="text-muted-foreground">
                          {week.questionsAnswered} questions
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </Section>
    </SharedLayout>
  );
}