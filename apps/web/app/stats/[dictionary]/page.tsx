'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useParams } from 'next/navigation';
import SharedLayout from '../../components/SharedLayout';
import { PageHeader, Section, Card, CardContent, CardHeader, CardTitle, Badge, LoadingState } from '@ui/components';
import { BarChart3, Trophy, Target, TrendingUp, Calendar, Brain, Clock, CheckCircle, XCircle, ArrowLeft, BookOpen } from 'lucide-react';
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
    word: string;
    language: string;
    isCorrect: boolean;
    responseTime: number;
    date: string;
  }>;
}

export default function DictionaryStatsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const languageCode = params.dictionary as string;
  
  const [stats, setStats] = useState<Stats | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [languageName, setLanguageName] = useState<string>('');

  useEffect(() => {
    if (loading) return;
    
    if (!user) {
      router.push(`/auth/signin?redirect=/stats/${languageCode}`);
      return;
    }

    fetchLanguageName();
    fetchStats();
  }, [user, loading, languageCode]);

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

  const fetchStats = async () => {
    setIsLoadingStats(true);
    try {
      const response = await fetch(`/api/v2/stats/simple?language=${languageCode}`);
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
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
          <div className="relative">
            <div className="w-20 h-20 rounded-full border-4 border-indigo-200 dark:border-indigo-800"></div>
            <div className="absolute top-0 left-0 w-20 h-20 rounded-full border-4 border-transparent border-t-indigo-500 dark:border-t-indigo-400 animate-spin"></div>
          </div>
        </div>
      </SharedLayout>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <SharedLayout>
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white/80 dark:bg-gray-900/80 backdrop-blur-lg border-b border-gray-200 dark:border-gray-700">
          <div className="max-w-6xl mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Link href="/stats" className="touch-target">
                  <button className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                </Link>
                <div>
                  <h1 className="text-xl font-semibold">{languageName || languageCode} Stats</h1>
                  <p className="text-sm text-muted-foreground">Your learning progress</p>
                </div>
              </div>
              
              <Link href={`/learn/${languageCode}`} className="touch-target">
                <button className={cn(
                  "px-4 py-2 rounded-lg font-medium text-sm",
                  "bg-gradient-to-r from-indigo-500 to-purple-500 text-white",
                  "hover:from-indigo-600 hover:to-purple-600",
                  "transition-all duration-200"
                )}>
                  <BookOpen className="h-4 w-4 inline mr-2" />
                  Continue Learning
                </button>
              </Link>
            </div>
          </div>
        </div>

        <Section className="max-w-6xl mx-auto px-4 py-8">
          {!stats || stats.overall.totalAttempts === 0 ? (
            <Card className="max-w-md mx-auto shadow-xl">
              <CardContent className="p-8 text-center">
                <BarChart3 className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-xl font-semibold mb-2">No Stats Yet</h3>
                <p className="text-muted-foreground mb-4">
                  Start learning {languageName || languageCode} to see your progress here.
                </p>
                <Link href={`/learn/${languageCode}`}>
                  <button className={cn(
                    "px-6 py-3 rounded-lg font-medium",
                    "bg-gradient-to-r from-indigo-500 to-purple-500 text-white",
                    "hover:from-indigo-600 hover:to-purple-600",
                    "transition-all duration-200"
                  )}>
                    Start Learning
                  </button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {/* Overview Cards */}
              <div className="grid gap-4 md:grid-cols-4">
                <Card className="shadow-lg hover:shadow-xl transition-shadow">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Total Words Seen
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 text-transparent bg-clip-text">
                      {stats.overall.totalWords}
                    </div>
                  </CardContent>
                </Card>

                <Card className="shadow-lg hover:shadow-xl transition-shadow">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Mastered
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-green-600">
                      {stats.overall.masteredWords}
                    </div>
                  </CardContent>
                </Card>

                <Card className="shadow-lg hover:shadow-xl transition-shadow">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Overall Accuracy
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">
                      {stats.overall.accuracy.toFixed(1)}%
                    </div>
                  </CardContent>
                </Card>

                <Card className="shadow-lg hover:shadow-xl transition-shadow">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Current Streak
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-purple-600">
                      {stats.overall.streakDays} <span className="text-lg font-normal">days</span>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Progress Overview */}
              <Card className="shadow-xl">
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
                      <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
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
                        <div className="text-sm text-muted-foreground">Total Attempts</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-green-600">{stats.overall.correctAttempts}</div>
                        <div className="text-sm text-muted-foreground">Correct Answers</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-orange-600">{stats.overall.dueWords}</div>
                        <div className="text-sm text-muted-foreground">Due for Review</div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Performance Trends */}
              <Card className="shadow-xl">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-green-500" />
                    Performance Trends
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
                      <h4 className="font-medium mb-3">Last 7 Days</h4>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">Attempts</span>
                          <span className="font-medium">{stats.recent.last7Days.attempts}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">Correct</span>
                          <span className="font-medium text-green-600">{stats.recent.last7Days.correct}</span>
                        </div>
                        <div className="pt-2 border-t">
                          <div className="text-2xl font-bold">
                            {stats.recent.last7Days.accuracy.toFixed(1)}%
                          </div>
                          <div className="text-sm text-muted-foreground">Accuracy</div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="p-4 bg-purple-50 dark:bg-purple-950/20 rounded-lg">
                      <h4 className="font-medium mb-3">Last 30 Days</h4>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">Attempts</span>
                          <span className="font-medium">{stats.recent.last30Days.attempts}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">Correct</span>
                          <span className="font-medium text-green-600">{stats.recent.last30Days.correct}</span>
                        </div>
                        <div className="pt-2 border-t">
                          <div className="text-2xl font-bold">
                            {stats.recent.last30Days.accuracy.toFixed(1)}%
                          </div>
                          <div className="text-sm text-muted-foreground">Accuracy</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Recent Activity */}
              <Card className="shadow-xl">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="h-5 w-5 text-indigo-500" />
                    Recent Activity
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {stats.recentAttempts.length === 0 ? (
                      <p className="text-center text-muted-foreground py-8">
                        No recent activity
                      </p>
                    ) : (
                      stats.recentAttempts.slice(0, 10).map((attempt, index) => (
                        <div key={index} className="flex items-center justify-between py-3 border-b last:border-0">
                          <div className="flex items-center gap-3">
                            {attempt.isCorrect ? (
                              <CheckCircle className="h-5 w-5 text-green-500" />
                            ) : (
                              <XCircle className="h-5 w-5 text-red-500" />
                            )}
                            <div>
                              <div className="font-medium">{attempt.word}</div>
                              <div className="text-sm text-muted-foreground">
                                {attempt.responseTime}ms response time
                              </div>
                            </div>
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {formatDate(attempt.date)}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </Section>
      </div>
    </SharedLayout>
  );
}