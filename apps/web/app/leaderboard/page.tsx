'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import SharedLayout from '../components/SharedLayout';
import { PageHeader, Section, LoadingState } from '@/app/components/ui/table';
import { Trophy, Globe, Zap, Users } from 'lucide-react';
import LeaderboardCard from '../../components/leaderboard/LeaderboardCard';
import PeriodSelector from '../../components/leaderboard/PeriodSelector';
import LeaderboardStats from '../../components/leaderboard/LeaderboardStats';

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
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  
  const [loading, setLoading] = useState(true);
  const [overviewData, setOverviewData] = useState<LeaderboardOverviewData | null>(null);
  const [period, setPeriod] = useState('all');

  useEffect(() => {
    if (authLoading) {
      console.log('[Leaderboard Overview] Auth still loading...');
      return;
    }
    
    if (!user) {
      console.log('[Leaderboard Overview] No user found, redirecting to login');
      router.push('/login');
      return;
    }
    
    console.log('[Leaderboard Overview] User authenticated, fetching data');
    fetchOverviewData();
  }, [user, authLoading, router, period]);

  const fetchOverviewData = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/v2/leaderboard/overview?period=${period}`);
      if (!response.ok) throw new Error('Failed to fetch leaderboard overview');
      
      const data = await response.json();
      setOverviewData(data);
    } catch (error) {
      console.error('Error fetching leaderboard overview:', error);
    } finally {
      setLoading(false);
    }
  };

  if (authLoading || !user) return null;

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
          <PageHeader
            title="Global Leaderboards"
            description="Compete across languages and track your progress worldwide"
            badge={
              overviewData ? (
                <div className="flex items-center ml-2 space-x-2">
                  <div className="flex items-center bg-white bg-opacity-20 rounded-full px-3 py-1">
                    <Globe className="h-3 w-3 mr-1" />
                    <span className="text-sm font-medium">{overviewData.totalLanguages} languages</span>
                  </div>
                  <div className="flex items-center bg-white bg-opacity-20 rounded-full px-3 py-1">
                    <Users className="h-3 w-3 mr-1" />
                    <span className="text-sm font-medium">{totalParticipants} learners</span>
                  </div>
                </div>
              ) : null
            }
          />

          {/* Period Selector */}
          <PeriodSelector
            selectedPeriod={period}
            onPeriodChange={setPeriod}
            className="mt-6"
          />

          {loading ? (
            <LoadingState />
          ) : overviewData ? (
            <>
              {/* Global Statistics */}
              <Section className="mt-12">
                <h2 className="text-2xl font-semibold mb-8 flex items-center">
                  <Zap className="h-5 w-5 mr-2 text-yellow-500" />
                  Global Statistics
                </h2>
                <LeaderboardStats
                  totalLanguages={overviewData.totalLanguages}
                  totalParticipants={totalParticipants}
                  totalQuestions={totalQuestions}
                  averageAccuracy={averageAccuracy}
                />
              </Section>

              {/* Active Languages */}
              {overviewData.leaderboards.length > 0 ? (
                <Section className="mt-12">
                  <h2 className="text-2xl font-semibold mb-8 flex items-center">
                    <Trophy className="h-5 w-5 mr-2 text-purple-500" />
                    Language Leaderboards
                  </h2>
                  <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-8 lg:gap-10">
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
                </Section>
              ) : (
                <Section className="mt-12">
                  <div className="text-center py-12">
                    <Trophy className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No Active Leaderboards</h3>
                    <p className="text-gray-600 mb-6">
                      No one has started learning yet for the selected time period.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-3 justify-center">
                      <a
                        href="/dashboard"
                        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
                      >
                        View Dashboard
                      </a>
                      <a
                        href="/learn"
                        className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                      >
                        Start Learning
                      </a>
                    </div>
                  </div>
                </Section>
              )}

              {/* All Languages (including inactive) */}
              {overviewData.allLanguages.filter(l => l.totalParticipants === 0).length > 0 && (
                <Section className="mt-12">
                  <h2 className="text-2xl font-semibold mb-8 flex items-center">
                    <Globe className="h-5 w-5 mr-2 text-gray-500" />
                    Available Languages
                    <span className="ml-2 text-sm font-normal text-gray-600">
                      (No activity yet)
                    </span>
                  </h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4">
                    {overviewData.allLanguages
                      .filter(l => l.totalParticipants === 0)
                      .map((language) => (
                        <a
                          key={language.languageId}
                          href={`/learn/${language.languageCode}`}
                          className="block p-4 bg-white rounded-lg border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all text-center group"
                        >
                          <h3 className="font-medium text-gray-900 group-hover:text-blue-600 transition-colors">
                            {language.languageName}
                          </h3>
                          <p className="text-sm text-gray-500 mt-1">Start learning</p>
                        </a>
                      ))}
                  </div>
                </Section>
              )}

              {/* Footer Note */}
              <div className="mt-12 text-center text-sm text-gray-500">
                <p>
                  Data updated: {new Date(overviewData.generatedAt).toLocaleString()}
                </p>
                <p className="mt-1">
                  Showing results for: <span className="font-medium capitalize">{period === 'all' ? 'all time' : period}</span>
                </p>
              </div>
            </>
          ) : (
            <div className="mt-8 text-center">
              <Trophy className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-600">Unable to load leaderboard data</p>
            </div>
          )}
        </div>
      </div>
    </SharedLayout>
  );
}