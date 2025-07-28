'use client';

import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useParams } from 'next/navigation';
import SharedLayout from '../../components/SharedLayout';
import { PageHeader, Section, Card, CardContent, CardHeader, CardTitle, Badge, Button } from '@ui/components';
import { StatsCard } from '@/components/stats/StatsCard';
import { WordCard } from '@/components/words/WordCard';
import { DashboardSkeleton } from '@/components/loading/Skeleton';
import { useStatsData } from '@/hooks/useApi';
import { 
  BarChart3, 
  Trophy, 
  Target, 
  TrendingUp, 
  Calendar, 
  Brain, 
  Clock, 
  CheckCircle, 
  XCircle, 
  ArrowLeft, 
  BookOpen,
  Heart,
  Zap,
  Award,
  Timer,
  Filter
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/app/lib/utils';

interface Stats {
  overall: {
    totalWords: number;
    masteredWords: number;
    dueWords: number;
    totalAttempts: number;
    correctAttempts: number;
    accuracy: number;
    streakDays: number;
  };
  recent: {
    last7Days: {
      attempts: number;
      correct: number;
      accuracy: number;
    };
    last30Days: {
      attempts: number;
      correct: number;
      accuracy: number;
    };
  };
  languages: Array<{
    code: string;
    name: string;
    totalWords: number;
    attempts: number;
    correct: number;
    accuracy: number;
    mastered: number;
    due: number;
  }>;
  recentAttempts: Array<{
    id: string;
    word: string;
    language: string;
    isCorrect: boolean;
    responseTime: number;
    date: string;
  }>;
}

export default function DictionaryStatsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const languageCode = params.dictionary as string;
  
  const [showAsCards, setShowAsCards] = useState(false);
  const [languageName, setLanguageName] = useState<string>('');
  const { data: stats, error, isLoading } = useStatsData(languageCode);

  React.useEffect(() => {
    if (!authLoading && !user) {
      router.push(`/auth/signin?redirect=/stats/${languageCode}`);
    }
  }, [user, authLoading, router, languageCode]);

  React.useEffect(() => {
    const fetchLanguageName = async () => {
      try {
        const response = await fetch('/api/v2/languages');
        const languages = await response.json();
        const language = languages.find((lang: any) => lang.code === languageCode);
        if (language) {
          setLanguageName(language.name);
        }
      } catch (error) {
        console.error('Error fetching language name:', error);
      }
    };
    
    fetchLanguageName();
  }, [languageCode]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (date.toDateString() === today.toDateString()) {
      return `Today at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } else if (date.toDateString() === yesterday.toDateString()) {
      return `Yesterday at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    }
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

  return (
    <SharedLayout>
      <div className="min-h-screen">
        <div className="max-w-[1920px] 2xl:max-w-[2200px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 2xl:px-16">
          <div className="mb-6 animate-slide-in">
            <Link href="/stats" className="inline-flex items-center text-gray-600 hover:text-gray-900">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back to Stats Overview
            </Link>
          </div>

          <PageHeader
            title={`${languageName || languageCode} Statistics`}
            description="Track your learning progress and performance"
            badge={
              stats?.overall.streakDays ? (
                <Badge variant="default" className="ml-2 animate-scale-in">
                  <Trophy className="h-3 w-3 mr-1" />
                  {stats.overall.streakDays} day streak
                </Badge>
              ) : null
            }
          />

          {isLoading ? (
            <DashboardSkeleton />
          ) : error ? (
            <div className="mt-8 text-center">
              <p className="text-red-600">Failed to load stats data</p>
              <Button onClick={() => window.location.reload()} className="mt-4">
                Retry
              </Button>
            </div>
          ) : !stats || stats.overall.totalAttempts === 0 ? (
            <Section className="mt-8">
              <Card className="max-w-md mx-auto">
                <CardContent className="p-8 text-center">
                  <BarChart3 className="h-16 w-16 mx-auto text-gray-300 mb-4" />
                  <h3 className="text-xl font-semibold mb-2">No Stats Yet</h3>
                  <p className="text-gray-600 mb-4">
                    Start learning {languageName || languageCode} to see your progress here.
                  </p>
                  <Link href={`/learn/${languageCode}`}>
                    <Button className="hover-grow">
                      <BookOpen className="h-4 w-4 mr-2" />
                      Start Learning
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            </Section>
          ) : (
            <>
              {/* Overview Stats */}
              <Section className="mt-8">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <StatsCard
                    title="Total Words Seen"
                    value={stats.overall.totalWords}
                    icon={Brain}
                    iconColor="text-indigo-500"
                    className="animate-slide-in"
                    style={{ animationDelay: '0ms' }}
                  />

                  <StatsCard
                    title="Words Mastered"
                    value={stats.overall.masteredWords}
                    subtitle={`of ${stats.overall.totalWords} words`}
                    icon={Award}
                    iconColor="text-green-500"
                    progress={{
                      value: stats.overall.masteredWords,
                      max: stats.overall.totalWords,
                      color: 'bg-green-500'
                    }}
                    className="animate-slide-in"
                    style={{ animationDelay: '50ms' }}
                  />

                  <StatsCard
                    title="Overall Accuracy"
                    value={`${stats.overall.accuracy.toFixed(1)}%`}
                    icon={Target}
                    iconColor="text-purple-500"
                    progress={{
                      value: stats.overall.accuracy,
                      max: 100,
                      color: stats.overall.accuracy >= 80 ? 'bg-green-500' : 
                             stats.overall.accuracy >= 60 ? 'bg-yellow-500' : 'bg-red-500'
                    }}
                    className="animate-slide-in"
                    style={{ animationDelay: '100ms' }}
                  />

                  <StatsCard
                    title="Current Streak"
                    value={stats.overall.streakDays}
                    subtitle="days"
                    icon={Zap}
                    iconColor="text-orange-500"
                    trend={stats.overall.streakDays > 0 ? {
                      value: stats.overall.streakDays,
                      label: 'consecutive days',
                      positive: true
                    } : undefined}
                    className="animate-slide-in"
                    style={{ animationDelay: '150ms' }}
                  />
                </div>
              </Section>

              {/* Progress Overview */}
              <Section className="mt-8">
                <Card className="animate-slide-in" style={{ animationDelay: '200ms' }}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Target className="h-5 w-5 text-indigo-500" />
                      Learning Progress
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div>
                        <div className="flex justify-between text-sm mb-2">
                          <span>Overall Progress</span>
                          <span className="font-medium">
                            {stats.overall.totalWords > 0 
                              ? Math.round((stats.overall.masteredWords / stats.overall.totalWords) * 100)
                              : 0}%
                          </span>
                        </div>
                        <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-500"
                            style={{ 
                              width: `${stats.overall.totalWords > 0 
                                ? (stats.overall.masteredWords / stats.overall.totalWords) * 100 
                                : 0}%` 
                            }}
                          />
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-3 gap-4 text-center pt-4">
                        <div>
                          <div className="text-2xl font-bold">{stats.overall.totalAttempts}</div>
                          <div className="text-sm text-gray-600">Total Attempts</div>
                        </div>
                        <div>
                          <div className="text-2xl font-bold text-green-600">{stats.overall.correctAttempts}</div>
                          <div className="text-sm text-gray-600">Correct Answers</div>
                        </div>
                        <div>
                          <div className="text-2xl font-bold text-orange-600">{stats.overall.dueWords}</div>
                          <div className="text-sm text-gray-600">Due for Review</div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Section>

              {/* Performance Trends */}
              <Section className="mt-8">
                <Card className="animate-slide-in" style={{ animationDelay: '250ms' }}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <TrendingUp className="h-5 w-5 text-green-500" />
                      Performance Trends
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid md:grid-cols-2 gap-6">
                      <div className="p-4 bg-blue-50 rounded-lg">
                        <h4 className="font-medium mb-3">Last 7 Days</h4>
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <span className="text-sm text-gray-600">Attempts</span>
                            <span className="font-medium">{stats.recent.last7Days.attempts}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm text-gray-600">Correct</span>
                            <span className="font-medium text-green-600">{stats.recent.last7Days.correct}</span>
                          </div>
                          <div className="pt-2 border-t">
                            <div className="text-2xl font-bold">
                              {stats.recent.last7Days.accuracy.toFixed(1)}%
                            </div>
                            <div className="text-sm text-gray-600">Accuracy</div>
                          </div>
                        </div>
                      </div>
                      
                      <div className="p-4 bg-purple-50 rounded-lg">
                        <h4 className="font-medium mb-3">Last 30 Days</h4>
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <span className="text-sm text-gray-600">Attempts</span>
                            <span className="font-medium">{stats.recent.last30Days.attempts}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm text-gray-600">Correct</span>
                            <span className="font-medium text-green-600">{stats.recent.last30Days.correct}</span>
                          </div>
                          <div className="pt-2 border-t">
                            <div className="text-2xl font-bold">
                              {stats.recent.last30Days.accuracy.toFixed(1)}%
                            </div>
                            <div className="text-sm text-gray-600">Accuracy</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Section>

              {/* Recent Activity */}
              <Section className="mt-8">
                <Card className="animate-slide-in" style={{ animationDelay: '300ms' }}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2">
                        <Clock className="h-5 w-5 text-indigo-500" />
                        Recent Activity
                      </CardTitle>
                      {stats.recentAttempts.length > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShowAsCards(!showAsCards)}
                          className="flex items-center gap-2"
                        >
                          <Filter className="h-4 w-4" />
                          {showAsCards ? 'List View' : 'Card View'}
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    {stats.recentAttempts.length === 0 ? (
                      <p className="text-center text-gray-500 py-8">
                        No recent activity
                      </p>
                    ) : showAsCards ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {stats.recentAttempts.slice(0, 12).map((attempt, index) => (
                          <div key={attempt.id || index} className="animate-slide-in" style={{ animationDelay: `${index * 30}ms` }}>
                            <WordCard
                              wordId={attempt.id}
                              word={attempt.word}
                              languageCode={languageCode}
                              stats={{
                                accuracy: attempt.isCorrect ? 100 : 0,
                                avgResponseTime: attempt.responseTime,
                                lastSeen: attempt.date
                              }}
                              onLike={handleWordLike}
                              showStats
                              compact
                            />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {stats.recentAttempts.slice(0, 20).map((attempt, index) => (
                          <RecentAttemptRow 
                            key={attempt.id || index} 
                            attempt={attempt} 
                            onLike={handleWordLike}
                            formatDate={formatDate}
                          />
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </Section>

              {/* Quick Actions */}
              <Section className="mt-8 mb-8">
                <h2 className="text-lg sm:text-xl font-semibold mb-4">Quick Actions</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <Link href={`/learn/${languageCode}`} className="block animate-slide-in hover-lift">
                    <div className="bg-white rounded-xl border hover:border-green-300 p-4 sm:p-6 h-full transition-all">
                      <div className="flex items-center justify-between">
                        <div className="min-w-0 flex-1">
                          <h3 className="font-medium text-sm sm:text-base">Continue Learning</h3>
                          <p className="text-xs sm:text-sm text-gray-600 mt-1">Keep up your {stats.overall.streakDays} day streak!</p>
                        </div>
                        <BookOpen className="h-6 w-6 sm:h-8 sm:w-8 text-green-500 flex-shrink-0 ml-3" />
                      </div>
                    </div>
                  </Link>

                  <Link href={`/dashboard/${languageCode}`} className="block animate-slide-in hover-lift" style={{ animationDelay: '50ms' }}>
                    <div className="bg-white rounded-xl border hover:border-blue-300 p-4 sm:p-6 h-full transition-all">
                      <div className="flex items-center justify-between">
                        <div className="min-w-0 flex-1">
                          <h3 className="font-medium text-sm sm:text-base">Language Dashboard</h3>
                          <p className="text-xs sm:text-sm text-gray-600 mt-1">View detailed analytics</p>
                        </div>
                        <BarChart3 className="h-6 w-6 sm:h-8 sm:w-8 text-blue-500 flex-shrink-0 ml-3" />
                      </div>
                    </div>
                  </Link>

                  <Link href={`/leaderboard/${languageCode}`} className="block animate-slide-in hover-lift" style={{ animationDelay: '100ms' }}>
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
                </div>
              </Section>
            </>
          )}
        </div>
      </div>
    </SharedLayout>
  );
}

// Recent attempt row component with like functionality
function RecentAttemptRow({ 
  attempt, 
  onLike,
  formatDate 
}: { 
  attempt: any; 
  onLike: (wordId: string, liked: boolean) => Promise<void>;
  formatDate: (date: string) => string;
}) {
  const [liked, setLiked] = useState(false);
  const [likeLoading, setLikeLoading] = useState(false);

  const handleLike = async () => {
    if (likeLoading || !attempt.id) return;
    
    setLikeLoading(true);
    try {
      const newLikedState = !liked;
      setLiked(newLikedState);
      await onLike(attempt.id, newLikedState);
    } catch (error) {
      setLiked(!liked);
    } finally {
      setLikeLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-between py-3 px-2 hover:bg-gray-50 rounded-lg transition-colors">
      <div className="flex items-center gap-3 flex-1">
        {attempt.isCorrect ? (
          <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
        ) : (
          <XCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Link 
              href={`/word/${attempt.id}`}
              className="font-medium text-blue-600 hover:text-blue-800 hover:underline truncate"
            >
              {attempt.word}
            </Link>
            {attempt.id && (
              <button
                onClick={handleLike}
                disabled={likeLoading}
                className={`p-1 rounded-full transition-all flex-shrink-0 ${
                  liked ? 'text-red-500' : 'text-gray-400 hover:text-red-500'
                }`}
              >
                <Heart className={`h-4 w-4 ${liked ? 'fill-current' : ''}`} />
              </button>
            )}
          </div>
          <div className="text-sm text-gray-600">
            {attempt.responseTime}ms response time
          </div>
        </div>
      </div>
      <div className="text-sm text-gray-500 flex-shrink-0">
        {formatDate(attempt.date)}
      </div>
    </div>
  );
}