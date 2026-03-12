'use client';

import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useParams } from 'next/navigation';
import SharedLayout from '../../components/SharedLayout';
import { Card, CardContent, CardHeader, CardTitle, Badge, Button } from '@mobtranslate/ui';
import { StatsCard } from '@/components/stats/StatsCard';
import { WordCard } from '@/components/words/WordCard';
import { DashboardSkeleton } from '@/components/loading/Skeleton';
import { useStatsData } from '@/hooks/useApi';
import {
  BarChart3,
  Trophy,
  Target,
  TrendingUp,
  Brain,
  Clock,
  CheckCircle,
  XCircle,
  ArrowLeft,
  BookOpen,
  Heart,
  Zap,
  Award,
  Filter,
  Sparkles,
  Flame
} from 'lucide-react';
import Link from 'next/link';

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
          {/* Back Link */}
          <div className="pt-6 mb-2">
            <Link href="/stats" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="h-4 w-4" />
              Back to Stats Overview
            </Link>
          </div>

          {/* Page Header */}
          <div className="py-6 md:py-10">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-100/80 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-sm font-medium mb-4">
              <Sparkles className="w-3.5 h-3.5" />
              Language Analytics
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-3xl md:text-4xl lg:text-5xl font-display font-bold tracking-tight text-foreground">
                {languageName || languageCode} Statistics
              </h1>
              {stats?.overall.streakDays > 0 && (
                <Badge variant="outline" className="gap-1.5 border-amber-300/60 dark:border-amber-700/40 text-amber-700 dark:text-amber-300">
                  <Flame className="h-3 w-3" />
                  {stats.overall.streakDays} day streak
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground mt-2 text-base lg:text-lg max-w-2xl">
              Track your learning progress and performance
            </p>
          </div>

          {isLoading ? (
            <DashboardSkeleton />
          ) : error ? (
            <div className="mt-8 text-center py-16 bg-card rounded-2xl border border-border/60">
              <p className="text-red-600 dark:text-red-400 font-medium">Failed to load stats data</p>
              <Button onClick={() => window.location.reload()} className="mt-4" variant="outline">
                Retry
              </Button>
            </div>
          ) : !stats || stats.overall.totalAttempts === 0 ? (
            <div className="mt-8">
              <div className="text-center py-16 bg-card rounded-2xl border border-border/60 max-w-md mx-auto">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-5">
                  <BarChart3 className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-xl font-semibold mb-2">No Stats Yet</h3>
                <p className="text-muted-foreground mb-6 px-6">
                  Start learning {languageName || languageCode} to see your progress here.
                </p>
                <Link href={`/learn/${languageCode}`}>
                  <Button className="bg-amber-600 hover:bg-amber-700 text-white">
                    <BookOpen className="h-4 w-4 mr-2" />
                    Start Learning
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            <>
              {/* Overview Stats */}
              <div className="mt-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <StatsCard
                    title="Total Words Seen"
                    value={stats.overall.totalWords}
                    icon={Brain}
                    iconColor="text-blue-600 dark:text-blue-400"
                    className="animate-slide-in"
                    style={{ animationDelay: '0ms' }}
                  />

                  <StatsCard
                    title="Words Mastered"
                    value={stats.overall.masteredWords}
                    description={`of ${stats.overall.totalWords} words`}
                    icon={Award}
                    iconColor="text-emerald-600 dark:text-emerald-400"
                    progress={{
                      value: stats.overall.masteredWords,
                      max: stats.overall.totalWords,
                      color: 'bg-emerald-500'
                    }}
                    className="animate-slide-in"
                    style={{ animationDelay: '50ms' }}
                  />

                  <StatsCard
                    title="Overall Accuracy"
                    value={`${stats.overall.accuracy.toFixed(1)}%`}
                    icon={Target}
                    iconColor="text-amber-600 dark:text-amber-400"
                    progress={{
                      value: stats.overall.accuracy,
                      max: 100,
                      color: stats.overall.accuracy >= 80 ? 'bg-emerald-500' :
                             stats.overall.accuracy >= 60 ? 'bg-amber-500' : 'bg-red-500'
                    }}
                    className="animate-slide-in"
                    style={{ animationDelay: '100ms' }}
                  />

                  <StatsCard
                    title="Current Streak"
                    value={stats.overall.streakDays}
                    description="days"
                    icon={Zap}
                    iconColor="text-orange-600 dark:text-orange-400"
                    trend={stats.overall.streakDays > 0 ? {
                      value: stats.overall.streakDays,
                      isPositive: true
                    } : undefined}
                    className="animate-slide-in"
                    style={{ animationDelay: '150ms' }}
                  />
                </div>
              </div>

              {/* Progress Overview */}
              <div className="mt-8">
                <Card className="animate-slide-in border-border/60" style={{ animationDelay: '200ms' }}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2.5">
                      <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30">
                        <Target className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                      </div>
                      Learning Progress
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div>
                        <div className="flex justify-between text-sm mb-2">
                          <span className="text-muted-foreground font-medium">Overall Progress</span>
                          <span className="font-bold text-foreground">
                            {stats.overall.totalWords > 0
                              ? Math.round((stats.overall.masteredWords / stats.overall.totalWords) * 100)
                              : 0}%
                          </span>
                        </div>
                        <div className="h-3 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-amber-500 to-orange-400 transition-all duration-500 rounded-full"
                            style={{
                              width: `${stats.overall.totalWords > 0
                                ? (stats.overall.masteredWords / stats.overall.totalWords) * 100
                                : 0}%`
                            }}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-4 text-center pt-4">
                        <div className="p-3 rounded-xl bg-muted/50">
                          <div className="text-2xl lg:text-3xl font-bold text-foreground">{stats.overall.totalAttempts}</div>
                          <div className="text-xs text-muted-foreground font-medium mt-1">Total Attempts</div>
                        </div>
                        <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/20">
                          <div className="text-2xl lg:text-3xl font-bold text-emerald-600 dark:text-emerald-400">{stats.overall.correctAttempts}</div>
                          <div className="text-xs text-muted-foreground font-medium mt-1">Correct Answers</div>
                        </div>
                        <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/20">
                          <div className="text-2xl lg:text-3xl font-bold text-amber-600 dark:text-amber-400">{stats.overall.dueWords}</div>
                          <div className="text-xs text-muted-foreground font-medium mt-1">Due for Review</div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Performance Trends */}
              <div className="mt-8">
                <Card className="animate-slide-in border-border/60" style={{ animationDelay: '250ms' }}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2.5">
                      <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                        <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      Performance Trends
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid md:grid-cols-2 gap-6">
                      <div className="bg-gradient-to-br from-amber-50/80 to-orange-50/50 dark:from-amber-950/20 dark:to-orange-950/10 rounded-xl p-5 border border-amber-200/50 dark:border-amber-800/30">
                        <h4 className="font-semibold text-foreground mb-4">Last 7 Days</h4>
                        <div className="space-y-3">
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-muted-foreground">Attempts</span>
                            <span className="font-semibold text-foreground">{stats.recent.last7Days.attempts}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-muted-foreground">Correct</span>
                            <span className="font-semibold text-emerald-600 dark:text-emerald-400">{stats.recent.last7Days.correct}</span>
                          </div>
                          <div className="pt-3 border-t border-amber-200/50 dark:border-amber-800/20">
                            <p className="text-3xl font-bold text-foreground tracking-tight">
                              {stats.recent.last7Days.accuracy.toFixed(1)}%
                            </p>
                            <p className="text-sm text-muted-foreground">Accuracy</p>
                          </div>
                        </div>
                      </div>

                      <div className="bg-muted/50 rounded-xl p-5 border border-border/40">
                        <h4 className="font-semibold text-foreground mb-4">Last 30 Days</h4>
                        <div className="space-y-3">
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-muted-foreground">Attempts</span>
                            <span className="font-semibold text-foreground">{stats.recent.last30Days.attempts}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-muted-foreground">Correct</span>
                            <span className="font-semibold text-emerald-600 dark:text-emerald-400">{stats.recent.last30Days.correct}</span>
                          </div>
                          <div className="pt-3 border-t border-border/40">
                            <p className="text-3xl font-bold text-foreground tracking-tight">
                              {stats.recent.last30Days.accuracy.toFixed(1)}%
                            </p>
                            <p className="text-sm text-muted-foreground">Accuracy</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Recent Activity */}
              <div className="mt-8">
                <Card className="animate-slide-in border-border/60" style={{ animationDelay: '300ms' }}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2.5">
                        <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-900/30">
                          <Clock className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                        </div>
                        Recent Activity
                      </CardTitle>
                      {stats.recentAttempts.length > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShowAsCards(!showAsCards)}
                          className="flex items-center gap-2 text-xs"
                        >
                          <Filter className="h-3.5 w-3.5" />
                          {showAsCards ? 'List View' : 'Card View'}
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    {stats.recentAttempts.length === 0 ? (
                      <div className="text-center py-12">
                        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-muted mb-3">
                          <Clock className="h-6 w-6 text-muted-foreground" />
                        </div>
                        <p className="text-muted-foreground">No recent activity</p>
                      </div>
                    ) : showAsCards ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {stats.recentAttempts.slice(0, 12).map((attempt: any, index: number) => (
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
                      <div className="space-y-1">
                        {stats.recentAttempts.slice(0, 20).map((attempt: any, index: number) => (
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
              </div>

              {/* Quick Actions */}
              <div className="mt-8 mb-8">
                <h2 className="text-xl lg:text-2xl font-display font-bold mb-6">Quick Actions</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <Link href={`/learn/${languageCode}`} className="block group">
                    <div className="bg-card rounded-xl border border-border/60 hover:border-emerald-400/40 hover:shadow-md p-5 sm:p-6 h-full transition-all duration-200 group-hover:-translate-y-0.5">
                      <div className="flex items-center justify-between">
                        <div className="min-w-0 flex-1">
                          <h3 className="font-semibold text-sm sm:text-base text-foreground">Continue Learning</h3>
                          <p className="text-xs sm:text-sm text-muted-foreground mt-1">Keep up your {stats.overall.streakDays} day streak!</p>
                        </div>
                        <div className="p-2.5 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex-shrink-0 ml-3">
                          <BookOpen className="h-5 w-5 sm:h-6 sm:w-6 text-emerald-600 dark:text-emerald-400" />
                        </div>
                      </div>
                    </div>
                  </Link>

                  <Link href={`/dashboard/${languageCode}`} className="block group">
                    <div className="bg-card rounded-xl border border-border/60 hover:border-blue-400/40 hover:shadow-md p-5 sm:p-6 h-full transition-all duration-200 group-hover:-translate-y-0.5">
                      <div className="flex items-center justify-between">
                        <div className="min-w-0 flex-1">
                          <h3 className="font-semibold text-sm sm:text-base text-foreground">Language Dashboard</h3>
                          <p className="text-xs sm:text-sm text-muted-foreground mt-1">View detailed analytics</p>
                        </div>
                        <div className="p-2.5 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex-shrink-0 ml-3">
                          <BarChart3 className="h-5 w-5 sm:h-6 sm:w-6 text-blue-600 dark:text-blue-400" />
                        </div>
                      </div>
                    </div>
                  </Link>

                  <Link href={`/leaderboard/${languageCode}`} className="block group">
                    <div className="bg-card rounded-xl border border-amber-200/60 dark:border-amber-800/30 hover:border-amber-400/60 hover:shadow-md p-5 sm:p-6 h-full transition-all duration-200 group-hover:-translate-y-0.5">
                      <div className="flex items-center justify-between">
                        <div className="min-w-0 flex-1">
                          <h3 className="font-semibold text-sm sm:text-base text-foreground">Leaderboard</h3>
                          <p className="text-xs sm:text-sm text-muted-foreground mt-1">Compete with other learners</p>
                        </div>
                        <div className="p-2.5 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex-shrink-0 ml-3">
                          <Trophy className="h-5 w-5 sm:h-6 sm:w-6 text-amber-600 dark:text-amber-400" />
                        </div>
                      </div>
                    </div>
                  </Link>
                </div>
              </div>
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
  onLike: (_wordId: string, _liked: boolean) => Promise<void>;
  formatDate: (_date: string) => string;
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
    <div className="flex items-center justify-between py-3 px-3 hover:bg-muted/50 rounded-lg transition-colors">
      <div className="flex items-center gap-3 flex-1">
        {attempt.isCorrect ? (
          <div className="p-1.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex-shrink-0">
            <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </div>
        ) : (
          <div className="p-1.5 rounded-full bg-red-100 dark:bg-red-900/30 flex-shrink-0">
            <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
          </div>
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Link
              href={`/word/${attempt.id}`}
              className="font-medium text-amber-700 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300 hover:underline truncate transition-colors"
            >
              {attempt.word}
            </Link>
            {attempt.id && (
              <Button
                variant="ghost"
                onClick={handleLike}
                disabled={likeLoading}
                className={`p-1 rounded-full transition-all flex-shrink-0 ${
                  liked ? 'text-red-500' : 'text-muted-foreground hover:text-red-500'
                }`}
              >
                <Heart className={`h-4 w-4 ${liked ? 'fill-current' : ''}`} />
              </Button>
            )}
          </div>
          <div className="text-sm text-muted-foreground">
            {attempt.responseTime}ms response time
          </div>
        </div>
      </div>
      <div className="text-sm text-muted-foreground flex-shrink-0">
        {formatDate(attempt.date)}
      </div>
    </div>
  );
}
