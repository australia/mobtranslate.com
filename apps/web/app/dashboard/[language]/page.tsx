'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useParams } from 'next/navigation';
import SharedLayout from '../../components/SharedLayout';
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
  BookOpen,
  Timer,
  ChevronLeft,
  ArrowUp,
  ArrowDown
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

interface WordStat {
  id: string;
  word: string;
  totalAttempts: number;
  correctAttempts: number;
  failedAttempts: number;
  accuracy: number;
  avgResponseTime: number;
  bucket: number;
  lastSeen: string;
}

interface DashboardData {
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
  performanceByBucket: Array<{
    bucket: number;
    bucketName: string;
    accuracy: number;
    totalQuestions: number;
    avgResponseTime: number;
  }>;
  weeklyProgress: Array<{
    week: string;
    sessions: number;
    accuracy: number;
    questionsAnswered: number;
  }>;
  wordStats?: WordStat[];
  languageInfo: {
    name: string;
    code: string;
  };
}

export default function LanguageDashboardPage() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useParams();
  const language = params.language as string;
  
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [period, setPeriod] = useState('30d');

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }
    fetchDashboardData();
  }, [user, router, language, period]);

  const fetchDashboardData = async () => {
    try {
      const response = await fetch(`/api/v2/dashboard/analytics?period=${period}&language=${language}`);
      if (!response.ok) throw new Error('Failed to fetch dashboard data');
      
      const data = await response.json();
      setDashboardData({
        ...data,
        languageInfo: data.languageInfo || { name: language, code: language }
      });
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatMinutes = (minutes: number) => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  if (!user) return null;

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        padding: 12,
        cornerRadius: 8,
      }
    },
    scales: {
      x: {
        grid: {
          display: false
        }
      },
      y: {
        beginAtZero: true,
        grid: {
          color: 'rgba(0, 0, 0, 0.05)'
        }
      }
    }
  };

  return (
    <SharedLayout>
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-6">
            <Link href="/dashboard" className="inline-flex items-center text-gray-600 hover:text-gray-900">
              <ChevronLeft className="h-4 w-4 mr-1" />
              Back to Dashboard
            </Link>
          </div>

          <PageHeader
            title={dashboardData?.languageInfo.name || language}
            description="Track your progress and performance"
            badge={
              dashboardData?.overview.currentStreak ? (
                <Badge variant="default" className="ml-2">
                  <Trophy className="h-3 w-3 mr-1" />
                  {dashboardData.overview.currentStreak} day streak
                </Badge>
              ) : null
            }
          />

          {/* Period Selector */}
          <div className="mt-6 flex gap-2">
            <Button
              variant={period === '7d' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setPeriod('7d')}
            >
              7 days
            </Button>
            <Button
              variant={period === '30d' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setPeriod('30d')}
            >
              30 days
            </Button>
            <Button
              variant={period === '90d' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setPeriod('90d')}
            >
              90 days
            </Button>
            <Button
              variant={period === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setPeriod('all')}
            >
              All time
            </Button>
          </div>

          {loading ? (
            <LoadingState />
          ) : dashboardData ? (
            <>
              {/* Overview Stats */}
              <Section className="mt-8">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <Card className="h-full">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm text-gray-600 truncate">Total Sessions</p>
                        <BookOpen className="h-5 w-5 text-blue-500 flex-shrink-0 ml-2" />
                      </div>
                      <p className="text-2xl font-bold">{dashboardData.overview.totalSessions}</p>
                      {dashboardData.recentActivity.length > 1 && (
                        <p className="text-sm text-gray-500 mt-1">
                          {dashboardData.recentActivity[0].sessions > dashboardData.recentActivity[1].sessions ? (
                            <span className="text-green-600 flex items-center">
                              <ArrowUp className="h-3 w-3 mr-1" />
                              +{dashboardData.recentActivity[0].sessions - dashboardData.recentActivity[1].sessions} today
                            </span>
                          ) : (
                            <span className="text-gray-500">No change today</span>
                          )}
                        </p>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="h-full">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm text-gray-600 truncate">Accuracy</p>
                        <Target className="h-5 w-5 text-green-500 flex-shrink-0 ml-2" />
                      </div>
                      <p className="text-2xl font-bold">{dashboardData.overview.overallAccuracy.toFixed(1)}%</p>
                      <div className="mt-2">
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-green-500 h-2 rounded-full transition-all duration-500"
                            style={{ width: `${dashboardData.overview.overallAccuracy}%` }}
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="h-full">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm text-gray-600 truncate">Words Progress</p>
                        <Brain className="h-5 w-5 text-purple-500 flex-shrink-0 ml-2" />
                      </div>
                      <p className="text-2xl font-bold">{dashboardData.overview.wordsLearned}</p>
                      <p className="text-sm text-gray-500 mt-1">
                        {dashboardData.overview.wordsMastered} mastered
                      </p>
                    </CardContent>
                  </Card>

                  <Card className="h-full">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm text-gray-600 truncate">Study Time</p>
                        <Clock className="h-5 w-5 text-orange-500 flex-shrink-0 ml-2" />
                      </div>
                      <p className="text-2xl font-bold">{formatMinutes(dashboardData.overview.totalStudyTime)}</p>
                      <p className="text-sm text-gray-500 mt-1">
                        {(dashboardData.overview.totalStudyTime / Math.max(dashboardData.overview.totalSessions, 1)).toFixed(0)}m per session
                      </p>
                    </CardContent>
                  </Card>
                </div>
              </Section>

              {/* Charts Section */}
              <Section className="mt-8">
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                  {/* Daily Activity Chart */}
                  <Card className="h-full">
                    <CardHeader>
                      <CardTitle className="flex items-center text-base sm:text-lg">
                        <Activity className="h-4 w-4 sm:h-5 sm:w-5 mr-2 text-blue-500" />
                        Daily Activity
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-64 sm:h-72">
                        <Line
                          data={{
                            labels: dashboardData.recentActivity.slice(0, 7).reverse().map(d => 
                              new Date(d.date).toLocaleDateString('en', { month: 'short', day: 'numeric' })
                            ),
                            datasets: [
                              {
                                label: 'Accuracy %',
                                data: dashboardData.recentActivity.slice(0, 7).reverse().map(d => d.accuracy),
                                borderColor: 'rgb(59, 130, 246)',
                                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                                fill: true,
                                tension: 0.4
                              }
                            ]
                          }}
                          options={chartOptions}
                        />
                      </div>
                    </CardContent>
                  </Card>

                  {/* Performance by Difficulty */}
                  <Card className="h-full">
                    <CardHeader>
                      <CardTitle className="flex items-center text-base sm:text-lg">
                        <BarChart3 className="h-4 w-4 sm:h-5 sm:w-5 mr-2 text-purple-500" />
                        Performance by Difficulty
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-64 sm:h-72">
                        <Bar
                          data={{
                            labels: dashboardData.performanceByBucket.map(b => b.bucketName),
                            datasets: [
                              {
                                label: 'Accuracy %',
                                data: dashboardData.performanceByBucket.map(b => b.accuracy),
                                backgroundColor: [
                                  'rgba(239, 68, 68, 0.8)',
                                  'rgba(245, 158, 11, 0.8)',
                                  'rgba(251, 191, 36, 0.8)',
                                  'rgba(59, 130, 246, 0.8)',
                                  'rgba(34, 197, 94, 0.8)',
                                  'rgba(168, 85, 247, 0.8)'
                                ]
                              }
                            ]
                          }}
                          options={chartOptions}
                        />
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </Section>

              {/* Weekly Progress */}
              <Section className="mt-8">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center text-base sm:text-lg">
                      <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 mr-2 text-green-500" />
                      Weekly Progress
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-64 sm:h-72">
                      <Line
                        data={{
                          labels: dashboardData.weeklyProgress.map(w => 
                            new Date(w.week).toLocaleDateString('en', { month: 'short', day: 'numeric' })
                          ),
                          datasets: [
                            {
                              label: 'Questions Answered',
                              data: dashboardData.weeklyProgress.map(w => w.questionsAnswered),
                              borderColor: 'rgb(34, 197, 94)',
                              backgroundColor: 'rgba(34, 197, 94, 0.1)',
                              fill: true,
                              tension: 0.4
                            }
                          ]
                        }}
                        options={chartOptions}
                      />
                    </div>
                  </CardContent>
                </Card>
              </Section>

              {/* Word Statistics Table */}
              <Section className="mt-8">
                <Card className="overflow-hidden">
                  <CardHeader>
                    <CardTitle className="flex items-center text-base sm:text-lg">
                      <Brain className="h-4 w-4 sm:h-5 sm:w-5 mr-2 text-indigo-500" />
                      Word Performance
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0 sm:p-6">
                    {dashboardData.wordStats && dashboardData.wordStats.length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs sm:text-sm">
                          <thead className="bg-gray-50">
                            <tr className="border-b">
                              <th className="text-left py-2 sm:py-3 px-3 sm:px-4 font-medium text-gray-700 sticky left-0 bg-gray-50 z-10">Word</th>
                              <th className="text-center py-2 sm:py-3 px-2 sm:px-3 font-medium text-gray-700 hidden sm:table-cell">Attempts</th>
                              <th className="text-center py-2 sm:py-3 px-2 sm:px-3 font-medium text-gray-700">Correct</th>
                              <th className="text-center py-2 sm:py-3 px-2 sm:px-3 font-medium text-gray-700">Failed</th>
                              <th className="text-center py-2 sm:py-3 px-2 sm:px-3 font-medium text-gray-700">Accuracy</th>
                              <th className="text-center py-2 sm:py-3 px-2 sm:px-3 font-medium text-gray-700 hidden md:table-cell">Avg Time</th>
                              <th className="text-center py-2 sm:py-3 px-2 sm:px-3 font-medium text-gray-700">Level</th>
                              <th className="text-center py-2 sm:py-3 px-2 sm:px-3 font-medium text-gray-700 hidden lg:table-cell">Last Seen</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200">
                            {dashboardData.wordStats.map((word, index) => (
                              <tr key={word.id} className={`hover:bg-gray-50 ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                                <td className="py-2 sm:py-3 px-3 sm:px-4 sticky left-0 bg-inherit">
                                  <Link 
                                    href={`/word/${word.id}`}
                                    className="text-blue-600 hover:text-blue-800 hover:underline font-medium block truncate max-w-[150px] sm:max-w-none"
                                  >
                                    {word.word}
                                  </Link>
                                </td>
                                <td className="text-center py-2 sm:py-3 px-2 sm:px-3 hidden sm:table-cell">{word.totalAttempts}</td>
                                <td className="text-center py-2 sm:py-3 px-2 sm:px-3 text-green-600 font-medium">{word.correctAttempts}</td>
                                <td className="text-center py-2 sm:py-3 px-2 sm:px-3 text-red-600 font-medium">{word.failedAttempts}</td>
                                <td className="text-center py-2 sm:py-3 px-2 sm:px-3">
                                  <span className={`font-bold ${
                                    word.accuracy >= 80 ? 'text-green-600' : 
                                    word.accuracy >= 60 ? 'text-yellow-600' : 
                                    'text-red-600'
                                  }`}>
                                    {word.accuracy.toFixed(0)}%
                                  </span>
                                </td>
                                <td className="text-center py-2 sm:py-3 px-2 sm:px-3 hidden md:table-cell text-gray-600">
                                  {word.avgResponseTime}ms
                                </td>
                                <td className="text-center py-2 sm:py-3 px-2 sm:px-3">
                                  <Badge 
                                    variant={word.bucket >= 4 ? 'default' : word.bucket >= 2 ? 'secondary' : 'outline'}
                                    className="text-xs px-2 py-0.5"
                                  >
                                    {['New', 'Learning', 'Learning+', 'Review', 'Review+', 'Mastered'][word.bucket] || 'New'}
                                  </Badge>
                                </td>
                                <td className="text-center py-2 sm:py-3 px-2 sm:px-3 text-gray-500 text-xs hidden lg:table-cell">
                                  {new Date(word.lastSeen).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="text-center py-12 text-gray-500">
                        <Brain className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                        <p>No word statistics available yet.</p>
                        <p className="text-sm mt-1">Start learning to see your progress!</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </Section>

              {/* Quick Actions */}
              <Section className="mt-8 mb-8">
                <h2 className="text-lg sm:text-xl font-semibold mb-4">Quick Actions</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <Link href={`/learn/${language}`} className="block">
                    <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                      <CardContent className="p-4 sm:p-6">
                        <div className="flex items-center justify-between">
                          <div className="min-w-0 flex-1">
                            <h3 className="font-medium text-sm sm:text-base">Continue Learning</h3>
                            <p className="text-xs sm:text-sm text-gray-600 mt-1">Practice more {dashboardData.languageInfo.name} words</p>
                          </div>
                          <BookOpen className="h-6 w-6 sm:h-8 sm:w-8 text-green-500 flex-shrink-0 ml-3" />
                        </div>
                      </CardContent>
                    </Card>
                  </Link>

                  <Link href={`/stats/${language}`} className="block">
                    <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                      <CardContent className="p-4 sm:p-6">
                        <div className="flex items-center justify-between">
                          <div className="min-w-0 flex-1">
                            <h3 className="font-medium text-sm sm:text-base">Detailed Stats</h3>
                            <p className="text-xs sm:text-sm text-gray-600 mt-1">View word-level statistics</p>
                          </div>
                          <BarChart3 className="h-6 w-6 sm:h-8 sm:w-8 text-purple-500 flex-shrink-0 ml-3" />
                        </div>
                      </CardContent>
                    </Card>
                  </Link>

                  <Link href="/dashboard" className="block sm:col-span-2 lg:col-span-1">
                    <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                      <CardContent className="p-4 sm:p-6">
                        <div className="flex items-center justify-between">
                          <div className="min-w-0 flex-1">
                            <h3 className="font-medium text-sm sm:text-base">All Languages</h3>
                            <p className="text-xs sm:text-sm text-gray-600 mt-1">View dashboard overview</p>
                          </div>
                          <Activity className="h-6 w-6 sm:h-8 sm:w-8 text-blue-500 flex-shrink-0 ml-3" />
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                </div>
              </Section>
            </>
          ) : (
            <div className="mt-8 text-center">
              <p className="text-gray-600">No data found for this language</p>
              <Link href="/dashboard">
                <Button className="mt-4">
                  <ChevronLeft className="mr-2 h-4 w-4" />
                  Back to Dashboard
                </Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </SharedLayout>
  );
}