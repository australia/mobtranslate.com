'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import SharedLayout from '../components/SharedLayout';
import { PageHeader, Section, Card, CardContent, CardHeader, CardTitle, Badge, LoadingState } from '@ui/components';
import { BarChart3, Trophy, Target, TrendingUp, Calendar, Brain } from 'lucide-react';

interface Stats {
  summary: {
    total_words: number;
    mastered_words: number;
    due_for_review: number;
    best_streak: number;
    languages: number;
  };
  streak_days: number;
  languages: Array<{
    code: string;
    name: string;
    mastered: number;
    total: number;
    due: number;
  }>;
  recent_performance: {
    last_7_days: {
      attempts: number;
      correct: number;
      accuracy: number;
    };
    last_30_days: {
      attempts: number;
      correct: number;
      accuracy: number;
    };
  };
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
      const response = await fetch('/api/v2/quiz/stats');
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
        {!stats ? (
          <Card className="max-w-md mx-auto">
            <CardContent className="p-8 text-center">
              <BarChart3 className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold mb-2">No Stats Yet</h3>
              <p className="text-muted-foreground">
                Start learning to see your progress here.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* Overview Cards */}
            <div className="grid gap-4 md:grid-cols-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Total Words
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.summary.total_words}</div>
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
                    {stats.summary.mastered_words}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Due for Review
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-orange-600">
                    {stats.summary.due_for_review}
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
                    {stats.streak_days} days
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Performance Stats */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Recent Performance
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <h4 className="font-medium">Last 7 Days</h4>
                    <div className="text-sm text-muted-foreground">
                      {stats.recent_performance.last_7_days.attempts} attempts
                    </div>
                    <div className="text-2xl font-bold">
                      {stats.recent_performance.last_7_days.accuracy.toFixed(1)}% accuracy
                    </div>
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-medium">Last 30 Days</h4>
                    <div className="text-sm text-muted-foreground">
                      {stats.recent_performance.last_30_days.attempts} attempts
                    </div>
                    <div className="text-2xl font-bold">
                      {stats.recent_performance.last_30_days.accuracy.toFixed(1)}% accuracy
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
                    <div key={language.code} className="space-y-2">
                      <div className="flex justify-between items-center">
                        <div>
                          <h4 className="font-medium">{language.name}</h4>
                          <p className="text-sm text-muted-foreground">
                            {language.mastered} of {language.total} mastered
                          </p>
                        </div>
                        {language.due > 0 && (
                          <Badge variant="outline">
                            {language.due} due
                          </Badge>
                        )}
                      </div>
                      {language.total > 0 && (
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                            style={{ 
                              width: `${(language.mastered / language.total) * 100}%` 
                            }}
                          />
                        </div>
                      )}
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