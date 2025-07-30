'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import SharedLayout from '../components/SharedLayout';
import { PageHeader, Section, Card, CardContent, CardHeader, CardTitle, Badge, LoadingState } from '@/app/components/ui/table';
import { BarChart3, Trophy, Target, TrendingUp, Calendar, Brain, Clock, CheckCircle, XCircle } from 'lucide-react';
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
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(true);

  useEffect(() => {
    if (loading) return;
    
    if (!user) {
      router.push('/auth/signin?redirect=/stats');
      return;
    }

    fetchStats();
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
        <Section>
          <LoadingState />
        </Section>
      </SharedLayout>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <SharedLayout>
      <PageHeader 
        title="Your Learning Stats"
        description="Track your progress across all languages"
      />

      <Section>
        {!stats || stats.overall.totalAttempts === 0 ? (
          <Card className="max-w-md mx-auto">
            <CardContent className="p-8 text-center">
              <BarChart3 className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold mb-2">No Stats Yet</h3>
              <p className="text-muted-foreground mb-4">
                Start learning to see your progress here.
              </p>
              <Link href="/learn" className="text-primary hover:underline">
                Go to Learn
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* Overview Cards */}
            <div className="grid gap-4 md:grid-cols-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Total Words Seen
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.overall.totalWords}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Mastered
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">
                    {stats.overall.masteredWords}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Overall Accuracy
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {stats.overall.accuracy.toFixed(1)}%
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Current Streak
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-purple-600">
                    {stats.overall.streakDays} days
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Performance Trends */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Performance Trends
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <h4 className="font-medium">Last 7 Days</h4>
                    <div className="space-y-1">
                      <div className="text-sm text-muted-foreground">
                        {stats.recent.last7Days.attempts} attempts
                      </div>
                      <div className="text-2xl font-bold">
                        {stats.recent.last7Days.accuracy.toFixed(1)}% accuracy
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {stats.recent.last7Days.correct} correct answers
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-medium">Last 30 Days</h4>
                    <div className="space-y-1">
                      <div className="text-sm text-muted-foreground">
                        {stats.recent.last30Days.attempts} attempts
                      </div>
                      <div className="text-2xl font-bold">
                        {stats.recent.last30Days.accuracy.toFixed(1)}% accuracy
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {stats.recent.last30Days.correct} correct answers
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Language Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Brain className="h-5 w-5" />
                  Language Progress
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {stats.languages.map((language) => (
                    <Link key={language.code} href={`/stats/${language.code}`}>
                      <div className="p-4 rounded-lg border hover:border-indigo-300 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/20 transition-all cursor-pointer">
                        <div className="flex justify-between items-center">
                          <div>
                            <h4 className="font-medium">{language.name}</h4>
                            <p className="text-sm text-muted-foreground">
                              {language.totalWords} words • {language.attempts} attempts • {language.accuracy.toFixed(1)}% accuracy
                            </p>
                          </div>
                          <div className="flex gap-2 items-center">
                            {language.mastered > 0 && (
                              <Badge variant="secondary" className="bg-green-100 text-green-700">
                                {language.mastered} mastered
                              </Badge>
                            )}
                            {language.due > 0 && (
                              <Badge variant="outline">
                                {language.due} due
                              </Badge>
                            )}
                            <div className="ml-2 text-muted-foreground">
                              →
                            </div>
                          </div>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Recent Activity */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Recent Activity
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {stats.recentAttempts.slice(0, 10).map((attempt, index) => (
                    <div key={index} className="flex items-center justify-between py-2 border-b last:border-0">
                      <div className="flex items-center gap-3">
                        {attempt.isCorrect ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-500" />
                        )}
                        <div>
                          <div className="font-medium">{attempt.word}</div>
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
      </Section>
    </SharedLayout>
  );
}