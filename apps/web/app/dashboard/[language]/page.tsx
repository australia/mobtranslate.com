'use client';

import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useParams } from 'next/navigation';
import SharedLayout from '../../components/SharedLayout';
import { PageHeader, Section, Badge, Button } from '@ui/components';
import { StatsCard } from '@/components/stats/StatsCard';
import { WordCard } from '@/components/words/WordCard';
import { DashboardSkeleton, TableSkeleton } from '@/components/loading/Skeleton';
import { useDashboardData, useWordLikes } from '@/hooks/useApi';
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
  Heart,
  Filter
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
import { Line, Bar } from 'react-chartjs-2';
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

export default function LanguageDashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const language = params.language as string;
  
  const [period, setPeriod] = useState('30d');
  const [showAsCards, setShowAsCards] = useState(false);
  const { data, error, isLoading } = useDashboardData(period, language);

  React.useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  const formatMinutes = (minutes: number) => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  const handleWordLike = async (wordId: string, liked: boolean) => {
    try {
      const response = await fetch(`/api/v2/likes/word/${wordId}`, {
        method: liked ? 'POST' : 'DELETE',
      });
      
      if (!response.ok) throw new Error('Failed to update like');
    } catch (error) {
      console.error('Failed to like word:', error);
      throw error;
    }
  };

  if (!user || authLoading) return null;

  const dashboardData = data || {
    overview: {
      totalSessions: 0,
      totalQuestions: 0,
      overallAccuracy: 0,
      currentStreak: 0,
      longestStreak: 0,
      totalStudyTime: 0,
      wordsLearned: 0,
      wordsMastered: 0,
    },
    recentActivity: [],
    performanceByBucket: [],
    weeklyProgress: [],
    wordStats: [],
    languageInfo: { name: language, code: language }
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        padding: 12,
        cornerRadius: 8,
      }
    },
    scales: {
      x: { grid: { display: false } },
      y: {
        beginAtZero: true,
        grid: { color: 'rgba(0, 0, 0, 0.05)' }
      }
    }
  };

  return (
    <SharedLayout fullWidth>
      <div className="min-h-screen">
        <div className="max-w-[1920px] 2xl:max-w-[2200px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 2xl:px-16">
          <div className="mb-6 animate-slide-in">
            <Link href="/dashboard" className="inline-flex items-center text-gray-600 hover:text-gray-900">
              <ChevronLeft className="h-4 w-4 mr-1" />
              Back to Dashboard
            </Link>
          </div>

          <PageHeader
            title={dashboardData.languageInfo.name || language}
            description="Track your progress and performance"
            badge={
              dashboardData.overview.currentStreak ? (
                <Badge variant="default" className="ml-2 animate-scale-in">
                  <Trophy className="h-3 w-3 mr-1" />
                  {dashboardData.overview.currentStreak} day streak
                </Badge>
              ) : null
            }
          />

          {/* Period Selector */}
          <div className="mt-6 flex gap-2 animate-slide-in">
            {['7d', '30d', '90d', 'all'].map((p) => (
              <Button
                key={p}
                variant={period === p ? 'default' : 'outline'}
                size="sm"
                onClick={() => setPeriod(p)}
                className="hover-grow"
              >
                {p === '7d' ? '7 days' : p === '30d' ? '30 days' : p === '90d' ? '90 days' : 'All time'}
              </Button>
            ))}
          </div>

          {isLoading ? (
            <DashboardSkeleton />
          ) : error ? (
            <div className="mt-8 text-center">
              <p className="text-red-600">Failed to load dashboard data</p>
              <Button onClick={() => window.location.reload()} className="mt-4">
                Retry
              </Button>
            </div>
          ) : (
            <>
              {/* Overview Stats */}
              <Section className="mt-8">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
                  <StatsCard
                    title="Total Sessions"
                    value={dashboardData.overview.totalSessions}
                    icon={BookOpen}
                    iconColor="text-blue-500"
                    trend={dashboardData.recentActivity.length > 1 && dashboardData.recentActivity[0].sessions > dashboardData.recentActivity[1].sessions ? {
                      value: dashboardData.recentActivity[0].sessions - dashboardData.recentActivity[1].sessions,
                      label: 'today',
                      positive: true
                    } : undefined}
                    className="animate-slide-in"
                    style={{ animationDelay: '0ms' }}
                  />
                  
                  <StatsCard
                    title="Accuracy"
                    value={`${dashboardData.overview.overallAccuracy.toFixed(1)}%`}
                    icon={Target}
                    iconColor="text-green-500"
                    progress={{
                      value: dashboardData.overview.overallAccuracy,
                      max: 100,
                      color: dashboardData.overview.overallAccuracy >= 80 ? 'bg-green-500' : 
                             dashboardData.overview.overallAccuracy >= 60 ? 'bg-yellow-500' : 'bg-red-500'
                    }}
                    className="animate-slide-in"
                    style={{ animationDelay: '50ms' }}
                  />
                  
                  <StatsCard
                    title="Words Progress"
                    value={dashboardData.overview.wordsLearned}
                    subtitle={`${dashboardData.overview.wordsMastered} mastered`}
                    icon={Brain}
                    iconColor="text-purple-500"
                    className="animate-slide-in"
                    style={{ animationDelay: '100ms' }}
                  />
                  
                  <StatsCard
                    title="Study Time"
                    value={formatMinutes(dashboardData.overview.totalStudyTime)}
                    subtitle={`${(dashboardData.overview.totalStudyTime / Math.max(dashboardData.overview.totalSessions, 1)).toFixed(0)}m per session`}
                    icon={Clock}
                    iconColor="text-orange-500"
                    className="animate-slide-in"
                    style={{ animationDelay: '150ms' }}
                  />
                </div>
              </Section>

              {/* Charts Section */}
              <Section className="mt-8">
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                  {/* Daily Activity Chart */}
                  <div className="bg-white rounded-xl border p-6 animate-slide-in" style={{ animationDelay: '200ms' }}>
                    <h3 className="text-base sm:text-lg font-semibold mb-4 flex items-center">
                      <Activity className="h-4 w-4 sm:h-5 sm:w-5 mr-2 text-blue-500" />
                      Daily Activity
                    </h3>
                    <div className="h-64 sm:h-72">
                      <Line
                        data={{
                          labels: dashboardData.recentActivity.slice(0, 7).reverse().map(d => 
                            new Date(d.date).toLocaleDateString('en', { month: 'short', day: 'numeric' })
                          ),
                          datasets: [{
                            label: 'Accuracy %',
                            data: dashboardData.recentActivity.slice(0, 7).reverse().map(d => d.accuracy),
                            borderColor: 'rgb(59, 130, 246)',
                            backgroundColor: 'rgba(59, 130, 246, 0.1)',
                            fill: true,
                            tension: 0.4
                          }]
                        }}
                        options={chartOptions}
                      />
                    </div>
                  </div>

                  {/* Performance by Difficulty */}
                  <div className="bg-white rounded-xl border p-6 animate-slide-in" style={{ animationDelay: '250ms' }}>
                    <h3 className="text-base sm:text-lg font-semibold mb-4 flex items-center">
                      <BarChart3 className="h-4 w-4 sm:h-5 sm:w-5 mr-2 text-purple-500" />
                      Performance by Difficulty
                    </h3>
                    <div className="h-64 sm:h-72">
                      <Bar
                        data={{
                          labels: dashboardData.performanceByBucket.map(b => b.bucketName),
                          datasets: [{
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
                          }]
                        }}
                        options={chartOptions}
                      />
                    </div>
                  </div>
                </div>
              </Section>

              {/* Word Statistics */}
              <Section className="mt-8">
                <div className="bg-white rounded-xl border overflow-hidden animate-slide-in" style={{ animationDelay: '300ms' }}>
                  <div className="p-4 sm:p-6 border-b">
                    <div className="flex items-center justify-between">
                      <h3 className="text-base sm:text-lg font-semibold flex items-center">
                        <Brain className="h-4 w-4 sm:h-5 sm:w-5 mr-2 text-indigo-500" />
                        Word Performance
                      </h3>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowAsCards(!showAsCards)}
                        className="flex items-center gap-2"
                      >
                        <Filter className="h-4 w-4" />
                        {showAsCards ? 'Table View' : 'Card View'}
                      </Button>
                    </div>
                  </div>
                  
                  {dashboardData.wordStats && dashboardData.wordStats.length > 0 ? (
                    showAsCards ? (
                      <div className="p-4 sm:p-6">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                          {dashboardData.wordStats.map((word: WordStat, index: number) => (
                            <div key={word.id} className="animate-slide-in" style={{ animationDelay: `${index * 30}ms` }}>
                              <WordCard
                                wordId={word.id}
                                word={word.word}
                                languageCode={dashboardData.languageInfo.code}
                                stats={{
                                  attempts: word.totalAttempts,
                                  accuracy: word.accuracy,
                                  avgResponseTime: word.avgResponseTime,
                                  lastSeen: word.lastSeen,
                                  bucket: word.bucket
                                }}
                                onLike={handleWordLike}
                                showStats
                                compact
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs sm:text-sm">
                          <thead className="bg-gray-50">
                            <tr className="border-b">
                              <th className="text-left py-2 sm:py-3 px-3 sm:px-4 font-medium text-gray-700 sticky left-0 bg-gray-50 z-10">Word</th>
                              <th className="text-center py-2 sm:py-3 px-2 sm:px-3 font-medium text-gray-700">
                                <Heart className="h-4 w-4 mx-auto" />
                              </th>
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
                            {dashboardData.wordStats.map((word: WordStat, index: number) => (
                              <WordTableRow key={word.id} word={word} index={index} onLike={handleWordLike} />
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )
                  ) : (
                    <div className="text-center py-12 text-gray-500">
                      <Brain className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                      <p>No word statistics available yet.</p>
                      <p className="text-sm mt-1">Start learning to see your progress!</p>
                    </div>
                  )}
                </div>
              </Section>

              {/* Quick Actions */}
              <Section className="mt-8 mb-8">
                <h2 className="text-lg sm:text-xl font-semibold mb-4">Quick Actions</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
                  <Link href={`/learn/${language}`} className="block animate-slide-in hover-lift">
                    <div className="bg-white rounded-xl border hover:border-green-300 p-4 sm:p-6 h-full transition-all">
                      <div className="flex items-center justify-between">
                        <div className="min-w-0 flex-1">
                          <h3 className="font-medium text-sm sm:text-base">Continue Learning</h3>
                          <p className="text-xs sm:text-sm text-gray-600 mt-1">Practice more {dashboardData.languageInfo.name} words</p>
                        </div>
                        <BookOpen className="h-6 w-6 sm:h-8 sm:w-8 text-green-500 flex-shrink-0 ml-3" />
                      </div>
                    </div>
                  </Link>

                  <Link href={`/stats/${language}`} className="block animate-slide-in hover-lift" style={{ animationDelay: '50ms' }}>
                    <div className="bg-white rounded-xl border hover:border-purple-300 p-4 sm:p-6 h-full transition-all">
                      <div className="flex items-center justify-between">
                        <div className="min-w-0 flex-1">
                          <h3 className="font-medium text-sm sm:text-base">Detailed Stats</h3>
                          <p className="text-xs sm:text-sm text-gray-600 mt-1">View word-level statistics</p>
                        </div>
                        <BarChart3 className="h-6 w-6 sm:h-8 sm:w-8 text-purple-500 flex-shrink-0 ml-3" />
                      </div>
                    </div>
                  </Link>

                  <Link href={`/leaderboard/${language}`} className="block animate-slide-in hover-lift" style={{ animationDelay: '100ms' }}>
                    <div className="bg-gradient-to-br from-yellow-50 to-orange-50 rounded-xl border border-yellow-200 hover:border-yellow-300 p-4 sm:p-6 h-full transition-all">
                      <div className="flex items-center justify-between">
                        <div className="min-w-0 flex-1">
                          <h3 className="font-medium text-sm sm:text-base">Leaderboard</h3>
                          <p className="text-xs sm:text-sm text-gray-600 mt-1">Compete with other learners</p>
                        </div>
                        <Trophy className="h-6 w-6 sm:h-8 sm:w-8 text-yellow-500 flex-shrink-0 ml-3" />
                      </div>
                    </div>
                  </Link>

                  <Link href="/dashboard" className="block animate-slide-in hover-lift" style={{ animationDelay: '150ms' }}>
                    <div className="bg-white rounded-xl border hover:border-blue-300 p-4 sm:p-6 h-full transition-all">
                      <div className="flex items-center justify-between">
                        <div className="min-w-0 flex-1">
                          <h3 className="font-medium text-sm sm:text-base">All Languages</h3>
                          <p className="text-xs sm:text-sm text-gray-600 mt-1">View dashboard overview</p>
                        </div>
                        <Activity className="h-6 w-6 sm:h-8 sm:w-8 text-blue-500 flex-shrink-0 ml-3" />
                      </div>
                    </div>
                  </Link>
                </div>
              </Section>
            </>
          )}
        </div>
      </div>
    </SharedLayout>
  );
}

// Word table row component with like functionality
function WordTableRow({ word, index, onLike }: { word: WordStat; index: number; onLike: (wordId: string, liked: boolean) => Promise<void> }) {
  const [liked, setLiked] = useState(false);
  const [likeLoading, setLikeLoading] = useState(false);

  const handleLike = async () => {
    if (likeLoading) return;
    
    setLikeLoading(true);
    try {
      const newLikedState = !liked;
      setLiked(newLikedState);
      await onLike(word.id, newLikedState);
    } catch (error) {
      setLiked(!liked);
    } finally {
      setLikeLoading(false);
    }
  };

  return (
    <tr className={`hover:bg-gray-50 ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
      <td className="py-2 sm:py-3 px-3 sm:px-4 sticky left-0 bg-inherit">
        <Link 
          href={`/word/${word.id}`}
          className="text-blue-600 hover:text-blue-800 hover:underline font-medium block truncate max-w-[150px] sm:max-w-none"
        >
          {word.word}
        </Link>
      </td>
      <td className="text-center py-2 sm:py-3 px-2 sm:px-3">
        <button
          onClick={handleLike}
          disabled={likeLoading}
          className={`p-1 rounded-full transition-all ${
            liked ? 'text-red-500' : 'text-gray-400 hover:text-red-500'
          }`}
        >
          <Heart className={`h-4 w-4 ${liked ? 'fill-current' : ''}`} />
        </button>
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
  );
}