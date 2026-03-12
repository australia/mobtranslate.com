'use client';

import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import SharedLayout from '../components/SharedLayout';
import { Badge, Button } from '@mobtranslate/ui';
import { StatsCard } from '@/components/stats/StatsCard';
import { DashboardSkeleton } from '@/components/loading/Skeleton';
import { useDashboardData } from '@/hooks/useApi';
import {
  Globe,
  BookOpen,
  Target,
  Clock,
  Trophy,
  Activity,
  ChevronRight,
  TrendingUp,
  Zap,
  Sparkles,
  Flame,
  LogIn
} from 'lucide-react';
import Link from 'next/link';

interface LanguageStats {
  language: string;
  code: string;
  totalSessions: number;
  totalWords: number;
  accuracy: number;
  lastPracticed: string;
  streak: number;
  studyTime: number;
}

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const { data, error, isLoading } = useDashboardData();

  // No redirect needed - we show a sign-in prompt for unauthenticated users

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (diffInDays === 0) return 'Today';
    if (diffInDays === 1) return 'Yesterday';
    if (diffInDays < 7) return `${diffInDays} days ago`;
    if (diffInDays < 30) return `${Math.floor(diffInDays / 7)} weeks ago`;
    return `${Math.floor(diffInDays / 30)} months ago`;
  };

  const formatStudyTime = (minutes: number) => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  if (authLoading) return null;

  if (!user) {
    return (
      <SharedLayout>
        <div className="min-h-screen">
          <div className="max-w-[1920px] 2xl:max-w-[2200px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 2xl:px-16">
            <div className="py-8 md:py-12">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-100/80 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-sm font-medium mb-4">
                <Sparkles className="w-3.5 h-3.5" />
                Dashboard
              </div>
              <h1 className="text-3xl md:text-4xl lg:text-5xl font-display font-bold tracking-tight text-foreground">
                Your Learning Dashboard
              </h1>
              <p className="text-muted-foreground mt-2 text-base lg:text-lg max-w-2xl">
                Track your progress across all languages
              </p>
            </div>

            <div className="pb-12">
              <div className="text-center py-20 bg-card rounded-2xl border border-border/60 max-w-lg mx-auto">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-100/80 dark:bg-amber-900/30 mb-5">
                  <Activity className="h-8 w-8 text-amber-600 dark:text-amber-400" />
                </div>
                <h3 className="text-xl font-semibold mb-2">Sign in to view your dashboard</h3>
                <p className="text-muted-foreground mb-8 px-6 max-w-sm mx-auto">
                  See your learning progress, streaks, study time, and language statistics all in one place.
                </p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <Link href="/auth/signin?redirect=/dashboard">
                    <Button className="bg-amber-600 hover:bg-amber-700 text-white gap-2">
                      <LogIn className="h-4 w-4" />
                      Sign In
                    </Button>
                  </Link>
                  <Link href="/education">
                    <Button variant="outline" className="gap-2">
                      <BookOpen className="h-4 w-4" />
                      Explore Languages
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </SharedLayout>
    );
  }

  const languageStats = data?.languages || [];
  const overviewStats = data?.overview || {
    totalLanguages: 0,
    totalSessions: 0,
    totalWords: 0,
    overallAccuracy: 0,
    currentStreak: 0,
    totalStudyTime: 0
  };

  return (
    <SharedLayout>
      <div className="min-h-screen">
        <div className="max-w-[1920px] 2xl:max-w-[2200px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 2xl:px-16">
          {/* Dashboard Header */}
          <div className="py-8 md:py-12">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-100/80 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-sm font-medium mb-4">
              <Sparkles className="w-3.5 h-3.5" />
              Your Progress
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-3xl md:text-4xl lg:text-5xl font-display font-bold tracking-tight text-foreground">
                Welcome back{user?.user_metadata?.username ? `, ${user.user_metadata.username}` : ''}
              </h1>
              {overviewStats.currentStreak > 0 && (
                <Badge variant="outline" className="gap-1.5 border-amber-300/60 dark:border-amber-700/40 text-amber-700 dark:text-amber-300">
                  <Flame className="h-3 w-3" />
                  {overviewStats.currentStreak} day streak
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground mt-2 text-base lg:text-lg max-w-2xl">
              Track your progress across all languages
            </p>
          </div>

          {isLoading ? (
            <DashboardSkeleton />
          ) : error ? (
            <div className="mt-8 text-center py-16 bg-card rounded-2xl border border-border/60">
              <p className="text-red-600 dark:text-red-400 font-medium">Failed to load dashboard data</p>
              <Button onClick={() => window.location.reload()} className="mt-4" variant="outline">
                Retry
              </Button>
            </div>
          ) : (
            <>
              {/* Overview Stats */}
              <div className="mt-4">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 lg:gap-5">
                  <StatsCard
                    title="Languages"
                    value={overviewStats.totalLanguages}
                    icon={Globe}
                    iconColor="text-blue-600 dark:text-blue-400"
                    className="animate-slide-in"
                    style={{ animationDelay: '0ms' }}
                  />
                  <StatsCard
                    title="Total Sessions"
                    value={overviewStats.totalSessions}
                    icon={BookOpen}
                    iconColor="text-emerald-600 dark:text-emerald-400"
                    className="animate-slide-in"
                    style={{ animationDelay: '50ms' }}
                  />
                  <StatsCard
                    title="Words Learned"
                    value={overviewStats.totalWords}
                    icon={Target}
                    iconColor="text-amber-600 dark:text-amber-400"
                    className="animate-slide-in"
                    style={{ animationDelay: '100ms' }}
                  />
                  <StatsCard
                    title="Accuracy"
                    value={`${overviewStats.overallAccuracy.toFixed(0)}%`}
                    icon={Activity}
                    iconColor="text-orange-600 dark:text-orange-400"
                    progress={{
                      value: overviewStats.overallAccuracy,
                      max: 100,
                      color: overviewStats.overallAccuracy >= 80 ? 'bg-emerald-500' :
                             overviewStats.overallAccuracy >= 60 ? 'bg-amber-500' : 'bg-red-500'
                    }}
                    className="animate-slide-in"
                    style={{ animationDelay: '150ms' }}
                  />
                  <StatsCard
                    title="Current Streak"
                    value={overviewStats.currentStreak}
                    description="days"
                    icon={Trophy}
                    iconColor="text-amber-600 dark:text-amber-400"
                    className="animate-slide-in"
                    style={{ animationDelay: '200ms' }}
                  />
                  <StatsCard
                    title="Study Time"
                    value={formatStudyTime(overviewStats.totalStudyTime)}
                    icon={Clock}
                    iconColor="text-rose-600 dark:text-rose-400"
                    className="animate-slide-in"
                    style={{ animationDelay: '250ms' }}
                  />
                </div>
              </div>

              {/* Language Cards */}
              <div className="mt-14">
                <h2 className="text-2xl lg:text-3xl font-display font-bold mb-8 flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-amber-100/80 dark:bg-amber-900/30">
                    <Zap className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  </div>
                  Your Languages
                </h2>
                {languageStats.length === 0 ? (
                  <div className="text-center py-16 bg-card rounded-2xl border border-border/60">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-5">
                      <Globe className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <h3 className="text-xl font-semibold mb-2">No languages yet</h3>
                    <p className="text-muted-foreground mb-6 max-w-sm mx-auto">Start learning your first language to see your progress here</p>
                    <Link href="/learn">
                      <Button className="bg-amber-600 hover:bg-amber-700 text-white">
                        Start Learning
                        <ChevronRight className="ml-2 h-4 w-4" />
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 lg:gap-6">
                    {languageStats.map((lang: LanguageStats, index: number) => (
                      <Link
                        key={lang.code}
                        href={`/dashboard/${lang.code}`}
                        className="block group animate-slide-in"
                        style={{ animationDelay: `${index * 50}ms` }}
                      >
                        <div className="relative bg-card rounded-xl border border-border/60 hover:border-amber-400/40 hover:shadow-lg p-6 lg:p-7 h-full transition-all duration-200 group-hover:-translate-y-0.5 overflow-hidden">
                          {/* Warm accent top line */}
                          <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-amber-400/50 via-orange-400/40 to-transparent" />

                          <div className="flex items-center justify-between mb-5">
                            <h3 className="text-xl font-bold text-foreground truncate group-hover:text-amber-700 dark:group-hover:text-amber-400 transition-colors">{lang.language}</h3>
                            <Badge variant="outline" className="flex-shrink-0 ml-2 text-xs border-border/60">
                              {lang.code.toUpperCase()}
                            </Badge>
                          </div>

                          <div className="grid grid-cols-2 gap-4 mb-5">
                            <div>
                              <p className="text-xs text-muted-foreground font-medium">Sessions</p>
                              <p className="text-xl font-bold text-foreground">{lang.totalSessions}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground font-medium">Words</p>
                              <p className="text-xl font-bold text-foreground">{lang.totalWords}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground font-medium">Accuracy</p>
                              <p className={`text-xl font-bold ${
                                lang.accuracy >= 80 ? 'text-emerald-600 dark:text-emerald-400' :
                                lang.accuracy >= 60 ? 'text-amber-600 dark:text-amber-400' :
                                'text-red-600 dark:text-red-400'
                              }`}>
                                {lang.accuracy.toFixed(0)}%
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground font-medium">Streak</p>
                              <p className="text-xl font-bold text-foreground flex items-center gap-1">
                                {lang.streak}
                                {lang.streak > 0 && <Flame className="h-4 w-4 text-orange-500" />}
                              </p>
                            </div>
                          </div>

                          <div className="pt-4 border-t border-border/40 space-y-2">
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">Last practiced</span>
                              <span className="font-medium text-foreground">{formatDate(lang.lastPracticed)}</span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">Study time</span>
                              <span className="font-medium text-foreground">{formatStudyTime(lang.studyTime)}</span>
                            </div>
                          </div>

                          <div className="pt-4 mt-3 border-t border-border/40">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium text-amber-700 dark:text-amber-400">View details</span>
                              <ChevronRight className="h-4 w-4 text-amber-600 dark:text-amber-400 group-hover:translate-x-0.5 transition-transform" />
                            </div>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              {/* Quick Actions */}
              {languageStats.length > 0 && (
                <div className="mt-14 mb-8">
                  <h2 className="text-2xl lg:text-3xl font-display font-bold mb-8">Quick Actions</h2>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-5">
                    <Link href="/learn" className="block group">
                      <div className="bg-card rounded-xl border border-border/60 hover:border-emerald-400/40 hover:shadow-md p-6 lg:p-7 h-full transition-all duration-200 group-hover:-translate-y-0.5">
                        <div className="flex items-center justify-between">
                          <div className="min-w-0 flex-1">
                            <h3 className="font-semibold text-foreground">Continue Learning</h3>
                            <p className="text-sm text-muted-foreground mt-1">Pick up where you left off</p>
                          </div>
                          <div className="p-2.5 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex-shrink-0 ml-4">
                            <BookOpen className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                          </div>
                        </div>
                      </div>
                    </Link>

                    <Link href="/stats" className="block group">
                      <div className="bg-card rounded-xl border border-border/60 hover:border-blue-400/40 hover:shadow-md p-6 lg:p-7 h-full transition-all duration-200 group-hover:-translate-y-0.5">
                        <div className="flex items-center justify-between">
                          <div className="min-w-0 flex-1">
                            <h3 className="font-semibold text-foreground">View Stats</h3>
                            <p className="text-sm text-muted-foreground mt-1">See detailed statistics</p>
                          </div>
                          <div className="p-2.5 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex-shrink-0 ml-4">
                            <TrendingUp className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                          </div>
                        </div>
                      </div>
                    </Link>

                    <Link href="/leaderboard" className="block group">
                      <div className="bg-card rounded-xl border border-amber-200/60 dark:border-amber-800/30 hover:border-amber-400/60 hover:shadow-md p-6 lg:p-7 h-full transition-all duration-200 group-hover:-translate-y-0.5">
                        <div className="flex items-center justify-between">
                          <div className="min-w-0 flex-1">
                            <h3 className="font-semibold text-foreground">Global Leaderboards</h3>
                            <p className="text-sm text-muted-foreground mt-1">Compete with other learners</p>
                          </div>
                          <div className="p-2.5 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex-shrink-0 ml-4">
                            <Trophy className="h-6 w-6 text-amber-600 dark:text-amber-400" />
                          </div>
                        </div>
                      </div>
                    </Link>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </SharedLayout>
  );
}
