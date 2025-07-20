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
  Timer,
  Heart,
  ChevronRight,
  Globe
} from 'lucide-react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import Link from 'next/link';

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

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

interface UserLikesStats {
  totalLikes: number;
  recentLikes: Array<{
    id: string;
    word: string;
    language: string;
    likedAt: string;
  }>;
}

export default function DashboardPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [likesStats, setLikesStats] = useState<UserLikesStats | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d' | 'all'>('30d');

  useEffect(() => {
    if (loading) return;
    
    if (!user) {
      router.push('/auth/signin?redirect=/dashboard');
      return;
    }

    fetchDashboardStats();
    fetchLikesStats();
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

  const fetchLikesStats = async () => {
    try {
      const response = await fetch('/api/v2/user/likes?limit=5');
      const data = await response.json();
      
      if (!data.error) {
        setLikesStats({
          totalLikes: data.pagination.total,
          recentLikes: data.likes.map((like: any) => ({
            id: like.id,
            word: like.word.word,
            language: like.word.language.name,
            likedAt: like.liked_at
          }))
        });
      }
    } catch (error) {
      console.error('Error fetching likes stats:', error);
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

  // Chart configurations
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false
      }
    },
    scales: {
      y: {
        beginAtZero: true
      }
    }
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
            {/* Quick Stats with Links */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Liked Words Card */}
              <Link href="/my-likes" className="block">
                <Card className="h-full hover:shadow-lg transition-shadow cursor-pointer">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div className="p-3 bg-red-50 rounded-lg">
                        <Heart className="h-6 w-6 text-red-600" />
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-2xl font-bold">{likesStats?.totalLikes || 0}</p>
                      <p className="text-sm text-muted-foreground">Liked Words</p>
                    </div>
                    {likesStats && likesStats.recentLikes.length > 0 && (
                      <div className="mt-4 text-xs text-muted-foreground">
                        Latest: {likesStats.recentLikes[0].word}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </Link>

              {/* Languages Card */}
              <Link href="/stats" className="block">
                <Card className="h-full hover:shadow-lg transition-shadow cursor-pointer">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div className="p-3 bg-blue-50 rounded-lg">
                        <Globe className="h-6 w-6 text-blue-600" />
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-2xl font-bold">{stats.languageProgress.length}</p>
                      <p className="text-sm text-muted-foreground">Languages</p>
                    </div>
                    <div className="mt-4 text-xs text-muted-foreground">
                      View detailed stats
                    </div>
                  </CardContent>
                </Card>
              </Link>

              {/* Overall Progress Card */}
              <Card className="h-full">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-3 bg-green-50 rounded-lg">
                      <Trophy className="h-6 w-6 text-green-600" />
                    </div>
                    <Badge variant="secondary">{stats.overview.overallAccuracy.toFixed(0)}%</Badge>
                  </div>
                  <div className="space-y-1">
                    <p className="text-2xl font-bold">{stats.overview.wordsMastered}</p>
                    <p className="text-sm text-muted-foreground">Words Mastered</p>
                  </div>
                  <div className="mt-4">
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="h-2 rounded-full bg-gradient-to-r from-green-400 to-green-600"
                        style={{ width: `${(stats.overview.wordsMastered / (stats.overview.wordsLearned || 1)) * 100}%` }}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

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

            {/* Charts Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Accuracy Trend Chart */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    Accuracy Trend
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-64">
                    <Line 
                      data={{
                        labels: stats.recentActivity.slice(-7).map(d => 
                          new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                        ),
                        datasets: [{
                          label: 'Accuracy',
                          data: stats.recentActivity.slice(-7).map(d => d.accuracy),
                          borderColor: 'rgb(59, 130, 246)',
                          backgroundColor: 'rgba(59, 130, 246, 0.1)',
                          tension: 0.3,
                          fill: true
                        }]
                      }}
                      options={{
                        ...chartOptions,
                        scales: {
                          y: {
                            beginAtZero: true,
                            max: 100,
                            ticks: {
                              callback: function(value) {
                                return value + '%';
                              }
                            }
                          }
                        }
                      }}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Language Distribution Chart */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Globe className="h-5 w-5" />
                    Language Distribution
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-64">
                    <Doughnut 
                      data={{
                        labels: stats.languageProgress.map(l => l.language),
                        datasets: [{
                          data: stats.languageProgress.map(l => l.sessions),
                          backgroundColor: [
                            'rgba(59, 130, 246, 0.8)',
                            'rgba(16, 185, 129, 0.8)',
                            'rgba(251, 146, 60, 0.8)',
                            'rgba(147, 51, 234, 0.8)',
                            'rgba(244, 63, 94, 0.8)',
                            'rgba(20, 184, 166, 0.8)'
                          ],
                          borderWidth: 1
                        }]
                      }}
                      options={{
                        ...chartOptions,
                        plugins: {
                          legend: {
                            display: true,
                            position: 'right'
                          }
                        }
                      }}
                    />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Study Pattern Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Study Pattern by Hour
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <Bar 
                    data={{
                      labels: Array.from({ length: 24 }, (_, i) => `${i}:00`),
                      datasets: [{
                        label: 'Sessions',
                        data: Array.from({ length: 24 }, (_, hour) => {
                          const hourData = stats.timeOfDayStats.find(h => h.hour === hour);
                          return hourData?.sessions || 0;
                        }),
                        backgroundColor: 'rgba(59, 130, 246, 0.8)',
                        borderColor: 'rgb(59, 130, 246)',
                        borderWidth: 1
                      }]
                    }}
                    options={{
                      ...chartOptions,
                      scales: {
                        y: {
                          beginAtZero: true,
                          ticks: {
                            stepSize: 1
                          }
                        },
                        x: {
                          ticks: {
                            autoSkip: true,
                            maxTicksLimit: 12
                          }
                        }
                      }
                    }}
                  />
                </div>
              </CardContent>
            </Card>

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

            {/* Language Progress with Links */}
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
                    <Link 
                      key={lang.code} 
                      href={`/stats/${lang.code}`}
                      className="block"
                    >
                      <div className="border rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="font-semibold">{lang.language}</h4>
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary">{lang.sessions} sessions</Badge>
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          </div>
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
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Recent Likes */}
            {likesStats && likesStats.recentLikes.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Heart className="h-5 w-5" />
                      Recent Likes
                    </div>
                    <Link href="/my-likes">
                      <Button variant="ghost" size="sm">
                        View All
                        <ChevronRight className="h-4 w-4 ml-1" />
                      </Button>
                    </Link>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {likesStats.recentLikes.map((like) => (
                      <div key={like.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex items-center gap-3">
                          <Heart className="h-4 w-4 text-red-500 fill-red-500" />
                          <div>
                            <span className="font-medium">{like.word}</span>
                            <span className="text-sm text-muted-foreground ml-2">
                              ({like.language})
                            </span>
                          </div>
                        </div>
                        <span className="text-sm text-muted-foreground">
                          {new Date(like.likedAt).toLocaleDateString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </Section>
    </SharedLayout>
  );
}