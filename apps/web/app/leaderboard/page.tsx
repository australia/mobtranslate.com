'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import SharedLayout from '../components/SharedLayout';
import { LoadingState } from '@/components/layout/LoadingState';
import { Badge, Button } from '@mobtranslate/ui';
import { Trophy, Globe, Users, LogIn } from 'lucide-react';
import LeaderboardCard from '../../components/leaderboard/LeaderboardCard';
import PeriodSelector from '../../components/leaderboard/PeriodSelector';
import LeaderboardStats from '../../components/leaderboard/LeaderboardStats';
import Link from 'next/link';

interface Champion {
  userId: string;
  username: string;
  points: number;
  accuracy: number;
  totalQuestions: number;
  currentStreak: number;
}

interface LanguageLeaderboard {
  languageId: string;
  languageName: string;
  languageCode: string;
  champion: Champion | null;
  totalParticipants: number;
  totalQuestions: number;
  averageAccuracy: number;
  lastActivity: string | null;
}

interface LeaderboardOverviewData {
  leaderboards: LanguageLeaderboard[];
  allLanguages: LanguageLeaderboard[];
  period: string;
  totalLanguages: number;
  totalParticipants: number;
  generatedAt: string;
}

export default function LeaderboardOverviewPage() {
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [overviewData, setOverviewData] = useState<LeaderboardOverviewData | null>(null);
  const [period, setPeriod] = useState('all');

  useEffect(() => {
    fetchOverviewData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  const fetchOverviewData = async () => {
    setLoading(true);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(`/api/v2/leaderboard/overview?period=${period}`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) throw new Error('Failed to fetch leaderboard overview');

      const data = await response.json();
      setOverviewData(data);
    } catch (error) {
      console.error('Error fetching leaderboard overview:', error);
    } finally {
      setLoading(false);
    }
  };

  // Calculate aggregate stats
  const totalQuestions = overviewData?.leaderboards.reduce((sum, l) => sum + l.totalQuestions, 0) || 0;
  const totalParticipants = overviewData?.leaderboards.reduce((sum, l) => sum + l.totalParticipants, 0) || 0;
  const averageAccuracy = overviewData?.leaderboards.length
    ? overviewData.leaderboards.reduce((sum, l) => sum + l.averageAccuracy, 0) / overviewData.leaderboards.length
    : 0;

  return (
    <SharedLayout>
      <div className="min-h-screen">
        <div className="max-w-[1920px] 2xl:max-w-[2200px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 2xl:px-16">
          {/* Page Header */}
          <div className="py-8 md:py-12">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-100/80 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-sm font-medium mb-4">
              <Trophy className="w-3.5 h-3.5" />
              Competition
            </div>
            <div className="flex items-center gap-4 flex-wrap">
              <h1 className="text-3xl md:text-4xl lg:text-5xl font-display font-bold tracking-tight text-foreground">
                Leaderboard
              </h1>
              {overviewData && (
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="gap-1.5 border-border/60 text-muted-foreground">
                    <Globe className="h-3 w-3" />
                    {overviewData.totalLanguages} languages
                  </Badge>
                  <Badge variant="outline" className="gap-1.5 border-border/60 text-muted-foreground">
                    <Users className="h-3 w-3" />
                    {totalParticipants} learners
                  </Badge>
                </div>
              )}
            </div>
            <p className="text-muted-foreground mt-2 text-base lg:text-lg max-w-2xl">
              Compete across languages and track your progress worldwide
            </p>
          </div>

          {/* Sign in prompt for unauthenticated users */}
          {!user && (
            <div className="mb-6 p-4 rounded-xl bg-amber-50/80 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-800/40 flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/40">
                  <LogIn className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                </div>
                <p className="text-sm text-amber-800 dark:text-amber-300">
                  <span className="font-medium">Sign in to track your progress</span> and compete on the leaderboard
                </p>
              </div>
              <Link href="/auth/signin?redirect=/leaderboard">
                <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white">
                  Sign In
                </Button>
              </Link>
            </div>
          )}

          {/* Period Selector */}
          <PeriodSelector
            selectedPeriod={period}
            onPeriodChange={setPeriod}
          />

          {loading ? (
            <div className="mt-12">
              <LoadingState />
            </div>
          ) : overviewData ? (
            <>
              {/* Global Statistics Summary Bar */}
              <div className="mt-10">
                <LeaderboardStats
                  totalLanguages={overviewData.totalLanguages}
                  totalParticipants={totalParticipants}
                  totalQuestions={totalQuestions}
                  averageAccuracy={averageAccuracy}
                />
              </div>

              {/* Active Language Leaderboards */}
              {overviewData.leaderboards.length > 0 ? (
                <div className="mt-14">
                  <h2 className="text-2xl lg:text-3xl font-display font-bold mb-8 flex items-center gap-2.5">
                    <div className="p-2 rounded-lg bg-amber-100/80 dark:bg-amber-900/30">
                      <Trophy className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                    </div>
                    Language Champions
                  </h2>
                  <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 lg:gap-8">
                    {overviewData.leaderboards.map((leaderboard) => (
                      <LeaderboardCard
                        key={leaderboard.languageId}
                        languageId={leaderboard.languageId}
                        languageName={leaderboard.languageName}
                        languageCode={leaderboard.languageCode}
                        champion={leaderboard.champion}
                        totalParticipants={leaderboard.totalParticipants}
                        totalQuestions={leaderboard.totalQuestions}
                        averageAccuracy={leaderboard.averageAccuracy}
                        lastActivity={leaderboard.lastActivity}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                <div className="mt-14">
                  <div className="text-center py-16 bg-card rounded-2xl border border-border/60">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-5">
                      <Trophy className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <h3 className="text-xl font-semibold text-foreground mb-2">No Active Leaderboards</h3>
                    <p className="text-muted-foreground mb-8 max-w-sm mx-auto">
                      No one has started learning yet for the selected time period. Be the first!
                    </p>
                    <div className="flex flex-col sm:flex-row gap-3 justify-center">
                      <Button asChild className="bg-amber-600 hover:bg-amber-700 text-white">
                        <a href="/dashboard">
                          View Dashboard
                        </a>
                      </Button>
                      <Button asChild variant="outline">
                        <a href="/learn">
                          Start Learning
                        </a>
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Available Languages (inactive) */}
              {overviewData.allLanguages.filter(l => l.totalParticipants === 0).length > 0 && (
                <div className="mt-14">
                  <h2 className="text-2xl lg:text-3xl font-display font-bold mb-2 flex items-center gap-2.5">
                    <div className="p-2 rounded-lg bg-muted">
                      <Globe className="h-5 w-5 text-muted-foreground" />
                    </div>
                    Available Languages
                  </h2>
                  <p className="text-sm text-muted-foreground mb-6 ml-12">No activity yet -- start learning to claim the top spot</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
                    {overviewData.allLanguages
                      .filter(l => l.totalParticipants === 0)
                      .map((language) => (
                        <a
                          key={language.languageId}
                          href={`/learn/${language.languageCode}`}
                          className="block p-4 bg-card rounded-xl border border-border/60 hover:border-amber-400/40 hover:shadow-md transition-all duration-200 text-center group"
                        >
                          <h3 className="font-medium text-foreground group-hover:text-amber-700 dark:group-hover:text-amber-400 transition-colors text-sm">
                            {language.languageName}
                          </h3>
                          <p className="text-xs text-muted-foreground mt-1">Start learning</p>
                        </a>
                      ))}
                  </div>
                </div>
              )}

              {/* Footer */}
              <div className="mt-14 mb-8 text-center text-sm text-muted-foreground border-t border-border/40 pt-6">
                <p>
                  Data updated: {new Date(overviewData.generatedAt).toLocaleString()}
                </p>
                <p className="mt-1">
                  Showing results for: <span className="font-medium capitalize text-foreground">{period === 'all' ? 'all time' : period}</span>
                </p>
              </div>
            </>
          ) : (
            <div className="mt-12 text-center py-16">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
                <Trophy className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground">Unable to load leaderboard data</p>
            </div>
          )}
        </div>
      </div>
    </SharedLayout>
  );
}
