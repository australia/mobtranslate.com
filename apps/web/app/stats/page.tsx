'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import SharedLayout from '../components/SharedLayout';
import { Card, CardContent, CardHeader, CardTitle, Badge, Button } from '@mobtranslate/ui';
import { LoadingState } from '@/components/layout/LoadingState';
import {
  BarChart3,
  TrendingUp,
  Brain,
  Clock,
  CheckCircle,
  XCircle,
  Sparkles,
  Target,
  Award,
  Flame,
  BookOpen,
  ChevronRight,
  LogIn
} from 'lucide-react';
import Link from 'next/link';

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
    word: string;
    language: string;
    isCorrect: boolean;
    responseTime: number;
    date: string;
  }>;
}

export default function StatsPage() {
  const { user, loading } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(true);

  useEffect(() => {
    if (loading) return;

    if (!user) {
      setIsLoadingStats(false);
      return;
    }

    fetchStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading]);

  const fetchStats = async () => {
    setIsLoadingStats(true);
    try {
      const response = await fetch('/api/v2/stats/simple');
      const data = await response.json();

      if (!data.error) {
        setStats(data);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setIsLoadingStats(false);
    }
  };

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

  if (loading || isLoadingStats) {
    return (
      <SharedLayout>
        <div className="py-12">
          <LoadingState />
        </div>
      </SharedLayout>
    );
  }

  if (!user) {
    return (
      <SharedLayout>
        <div className="min-h-screen">
          <div className="max-w-[1920px] 2xl:max-w-[2200px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 2xl:px-16">
            {/* Page Header */}
            <div className="py-8 md:py-12">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-100/80 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-sm font-medium mb-4">
                <Sparkles className="w-3.5 h-3.5" />
                Analytics
              </div>
              <h1 className="text-3xl md:text-4xl lg:text-5xl font-display font-bold tracking-tight text-foreground">
                Learning Stats
              </h1>
              <p className="text-muted-foreground mt-2 text-base lg:text-lg max-w-2xl">
                Track your progress across all languages
              </p>
            </div>

            <div className="pb-12">
              <div className="text-center py-20 bg-card rounded-2xl border border-border/60 max-w-lg mx-auto">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-100/80 dark:bg-amber-900/30 mb-5">
                  <BarChart3 className="h-8 w-8 text-amber-600 dark:text-amber-400" />
                </div>
                <h3 className="text-xl font-semibold mb-2">Sign in to see your stats</h3>
                <p className="text-muted-foreground mb-8 px-6 max-w-sm mx-auto">
                  Track your learning progress, accuracy, streaks, and mastered words across all languages.
                </p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <Link href="/auth/signin?redirect=/stats">
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

  return (
    <SharedLayout>
      <div className="min-h-screen">
        <div className="max-w-[1920px] 2xl:max-w-[2200px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 2xl:px-16">
          {/* Page Header */}
          <div className="py-8 md:py-12">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-100/80 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-sm font-medium mb-4">
              <Sparkles className="w-3.5 h-3.5" />
              Analytics
            </div>
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-display font-bold tracking-tight text-foreground">
              Your Learning Stats
            </h1>
            <p className="text-muted-foreground mt-2 text-base lg:text-lg max-w-2xl">
              Track your progress across all languages
            </p>
          </div>

          <div className="pb-12">
            {!stats || stats.overall.totalAttempts === 0 ? (
              <div className="text-center py-16 bg-card rounded-2xl border border-border/60 max-w-md mx-auto">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-5">
                  <BarChart3 className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-xl font-semibold mb-2">No Stats Yet</h3>
                <p className="text-muted-foreground mb-6 px-6">
                  Start learning to see your progress here.
                </p>
                <Link href="/learn" className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium transition-colors">
                  <BookOpen className="h-4 w-4" />
                  Go to Learn
                </Link>
              </div>
            ) : (
              <div className="space-y-8">
                {/* Overview Stats Cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-card rounded-xl border border-border/60 p-5 lg:p-6 relative overflow-hidden group hover:shadow-md transition-all">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="p-2.5 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                        <BookOpen className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                      </div>
                    </div>
                    <p className="text-3xl lg:text-4xl font-bold text-foreground tracking-tight">{stats.overall.totalWords}</p>
                    <p className="text-sm text-muted-foreground mt-1 font-medium">Total Words Seen</p>
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-400/40 via-blue-300/30 to-transparent" />
                  </div>

                  <div className="bg-card rounded-xl border border-border/60 p-5 lg:p-6 relative overflow-hidden group hover:shadow-md transition-all">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="p-2.5 rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                        <Award className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                      </div>
                    </div>
                    <p className="text-3xl lg:text-4xl font-bold text-emerald-600 dark:text-emerald-400 tracking-tight">{stats.overall.masteredWords}</p>
                    <p className="text-sm text-muted-foreground mt-1 font-medium">Mastered</p>
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-emerald-400/40 via-emerald-300/30 to-transparent" />
                  </div>

                  <div className="bg-card rounded-xl border border-border/60 p-5 lg:p-6 relative overflow-hidden group hover:shadow-md transition-all">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="p-2.5 rounded-lg bg-amber-100 dark:bg-amber-900/30">
                        <Target className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                      </div>
                    </div>
                    <p className="text-3xl lg:text-4xl font-bold text-foreground tracking-tight">{stats.overall.accuracy.toFixed(1)}%</p>
                    <p className="text-sm text-muted-foreground mt-1 font-medium">Overall Accuracy</p>
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-amber-400/40 via-amber-300/30 to-transparent" />
                  </div>

                  <div className="bg-card rounded-xl border border-border/60 p-5 lg:p-6 relative overflow-hidden group hover:shadow-md transition-all">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="p-2.5 rounded-lg bg-orange-100 dark:bg-orange-900/30">
                        <Flame className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                      </div>
                    </div>
                    <p className="text-3xl lg:text-4xl font-bold text-foreground tracking-tight">{stats.overall.streakDays}</p>
                    <p className="text-sm text-muted-foreground mt-1 font-medium">Day Streak</p>
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-orange-400/40 via-orange-300/30 to-transparent" />
                  </div>
                </div>

                {/* Performance Trends */}
                <Card className="border-border/60">
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

                {/* Language Breakdown */}
                <Card className="border-border/60">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2.5">
                      <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                        <Brain className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                      </div>
                      Language Progress
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {stats.languages.map((language) => (
                        <Link key={language.code} href={`/stats/${language.code}`}>
                          <div className="p-4 rounded-xl border border-border/60 hover:border-amber-400/40 hover:shadow-md bg-card transition-all duration-200 cursor-pointer group">
                            <div className="flex justify-between items-center">
                              <div className="min-w-0 flex-1">
                                <h4 className="font-semibold text-foreground group-hover:text-amber-700 dark:group-hover:text-amber-400 transition-colors">{language.name}</h4>
                                <p className="text-sm text-muted-foreground mt-0.5">
                                  {language.totalWords} words -- {language.attempts} attempts -- {language.accuracy.toFixed(1)}% accuracy
                                </p>
                              </div>
                              <div className="flex gap-2 items-center flex-shrink-0 ml-3">
                                {language.mastered > 0 && (
                                  <Badge variant="secondary" className="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-0 text-xs">
                                    {language.mastered} mastered
                                  </Badge>
                                )}
                                {language.due > 0 && (
                                  <Badge variant="outline" className="text-xs">
                                    {language.due} due
                                  </Badge>
                                )}
                                <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-amber-600 dark:group-hover:text-amber-400 group-hover:translate-x-0.5 transition-all" />
                              </div>
                            </div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Recent Activity */}
                <Card className="border-border/60">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2.5">
                      <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-900/30">
                        <Clock className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                      </div>
                      Recent Activity
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-1">
                      {stats.recentAttempts.slice(0, 10).map((attempt, index) => (
                        <div key={index} className="flex items-center justify-between py-3 px-3 hover:bg-muted/50 rounded-lg transition-colors">
                          <div className="flex items-center gap-3">
                            {attempt.isCorrect ? (
                              <div className="p-1.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                                <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                              </div>
                            ) : (
                              <div className="p-1.5 rounded-full bg-red-100 dark:bg-red-900/30">
                                <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                              </div>
                            )}
                            <div>
                              <div className="font-medium text-foreground">{attempt.word}</div>
                              <div className="text-sm text-muted-foreground">{attempt.language}</div>
                            </div>
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {formatDate(attempt.date)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </div>
      </div>
    </SharedLayout>
  );
}
