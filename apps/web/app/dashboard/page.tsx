'use client';

import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import SharedLayout from '../components/SharedLayout';
import { PageHeader } from '@/app/components/ui/page-header';
import { Section } from '@/app/components/ui/section';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
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
  Zap
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
  const router = useRouter();
  const { data, error, isLoading } = useDashboardData();

  React.useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

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

  if (!user || authLoading) return null;

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
          <PageHeader
            title="Learning Dashboard"
            description="Track your progress across all languages"
            badge={
              overviewStats.currentStreak > 0 ? (
                <Badge variant="default" className="ml-2 animate-scale-in">
                  <Trophy className="h-3 w-3 mr-1" />
                  {overviewStats.currentStreak} day streak
                </Badge>
              ) : null
            }
          />

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
              <Section className="mt-12">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6 lg:gap-8">
                  <StatsCard
                    title="Languages"
                    value={overviewStats.totalLanguages}
                    icon={Globe}
                    iconColor="text-blue-500"
                    className="animate-slide-in"
                    style={{ animationDelay: '0ms' }}
                  />
                  <StatsCard
                    title="Total Sessions"
                    value={overviewStats.totalSessions}
                    icon={BookOpen}
                    iconColor="text-green-500"
                    className="animate-slide-in"
                    style={{ animationDelay: '50ms' }}
                  />
                  <StatsCard
                    title="Words Learned"
                    value={overviewStats.totalWords}
                    icon={Target}
                    iconColor="text-gray-700"
                    className="animate-slide-in"
                    style={{ animationDelay: '100ms' }}
                  />
                  <StatsCard
                    title="Accuracy"
                    value={`${overviewStats.overallAccuracy.toFixed(0)}%`}
                    icon={Activity}
                    iconColor="text-orange-500"
                    progress={{
                      value: overviewStats.overallAccuracy,
                      max: 100,
                      color: overviewStats.overallAccuracy >= 80 ? 'bg-green-500' : 
                             overviewStats.overallAccuracy >= 60 ? 'bg-yellow-500' : 'bg-red-500'
                    }}
                    className="animate-slide-in"
                    style={{ animationDelay: '150ms' }}
                  />
                  <StatsCard
                    title="Current Streak"
                    value={overviewStats.currentStreak}
                    subtitle="days"
                    icon={Trophy}
                    iconColor="text-yellow-500"
                    className="animate-slide-in"
                    style={{ animationDelay: '200ms' }}
                  />
                  <StatsCard
                    title="Study Time"
                    value={formatStudyTime(overviewStats.totalStudyTime)}
                    icon={Clock}
                    iconColor="text-indigo-500"
                    className="animate-slide-in"
                    style={{ animationDelay: '250ms' }}
                  />
                </div>
              </Section>

              {/* Language Cards */}
              <Section className="mt-12">
                <h2 className="text-2xl font-semibold mb-8 flex items-center">
                  <Zap className="h-5 w-5 mr-2 text-yellow-500" />
                  Your Languages
                </h2>
                {languageStats.length === 0 ? (
                  <div className="bg-white rounded-xl border p-16 text-center animate-scale-in">
                    <Globe className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium mb-2">No languages yet</h3>
                    <p className="text-gray-600 mb-6">Start learning your first language to see your progress here</p>
                    <Link href="/learn">
                      <Button className="hover-grow">
                        Start Learning
                        <ChevronRight className="ml-2 h-4 w-4" />
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                    {languageStats.map((lang: LanguageStats, index: number) => (
                      <Link 
                        key={lang.code} 
                        href={`/dashboard/${lang.code}`} 
                        className="block animate-slide-in hover-lift"
                        style={{ animationDelay: `${index * 50}ms` }}
                      >
                        <div className="bg-white rounded-xl border hover:border-blue-300 p-8 h-full transition-all duration-200">
                          <div className="flex items-center justify-between mb-4">
                            <h3 className="text-xl font-semibold truncate">{lang.language}</h3>
                            <Badge variant="outline" className="flex-shrink-0 ml-2">
                              {lang.code.toUpperCase()}
                            </Badge>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-4 mb-6">
                            <div>
                              <p className="text-sm text-gray-600">Sessions</p>
                              <p className="text-xl font-semibold">{lang.totalSessions}</p>
                            </div>
                            <div>
                              <p className="text-sm text-gray-600">Words</p>
                              <p className="text-xl font-semibold">{lang.totalWords}</p>
                            </div>
                            <div>
                              <p className="text-sm text-gray-600">Accuracy</p>
                              <p className={`text-xl font-semibold ${
                                lang.accuracy >= 80 ? 'text-green-600' :
                                lang.accuracy >= 60 ? 'text-yellow-600' :
                                'text-red-600'
                              }`}>
                                {lang.accuracy.toFixed(0)}%
                              </p>
                            </div>
                            <div>
                              <p className="text-sm text-gray-600">Streak</p>
                              <p className="text-xl font-semibold flex items-center">
                                {lang.streak}
                                {lang.streak > 0 && <Zap className="h-4 w-4 ml-1 text-orange-500" />}
                              </p>
                            </div>
                          </div>
                          
                          <div className="pt-3 border-t">
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-gray-600">Last practiced</span>
                              <span className="font-medium text-right">{formatDate(lang.lastPracticed)}</span>
                            </div>
                            <div className="flex items-center justify-between text-sm mt-1">
                              <span className="text-gray-600">Study time</span>
                              <span className="font-medium">{formatStudyTime(lang.studyTime)}</span>
                            </div>
                          </div>

                          <div className="pt-3 mt-3 border-t">
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-blue-600">View details</span>
                              <ChevronRight className="h-4 w-4 text-blue-600" />
                            </div>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </Section>

              {/* Quick Actions */}
              {languageStats.length > 0 && (
                <Section className="mt-12">
                  <h2 className="text-2xl font-semibold mb-8">Quick Actions</h2>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
                    <Link href="/learn" className="block animate-slide-in hover-lift">
                      <div className="bg-white rounded-xl border hover:border-green-300 p-8 h-full transition-all duration-200">
                        <div className="flex items-center justify-between">
                          <div className="min-w-0 flex-1">
                            <h3 className="font-medium">Continue Learning</h3>
                            <p className="text-sm text-gray-600 mt-1">Pick up where you left off</p>
                          </div>
                          <BookOpen className="h-8 w-8 text-green-500 flex-shrink-0 ml-4" />
                        </div>
                      </div>
                    </Link>

                    <Link href="/stats" className="block animate-slide-in hover-lift" style={{ animationDelay: '50ms' }}>
                      <div className="bg-white rounded-xl border hover:border-gray-300 p-8 h-full transition-all duration-200">
                        <div className="flex items-center justify-between">
                          <div className="min-w-0 flex-1">
                            <h3 className="font-medium">View Stats</h3>
                            <p className="text-sm text-gray-600 mt-1">See detailed statistics</p>
                          </div>
                          <TrendingUp className="h-8 w-8 text-gray-700 flex-shrink-0 ml-4" />
                        </div>
                      </div>
                    </Link>

                    <Link href="/leaderboard" className="block animate-slide-in hover-lift" style={{ animationDelay: '100ms' }}>
                      <div className="bg-white rounded-xl border hover:border-yellow-300 p-8 h-full transition-all duration-200">
                        <div className="flex items-center justify-between">
                          <div className="min-w-0 flex-1">
                            <h3 className="font-medium">Global Leaderboards</h3>
                            <p className="text-sm text-gray-600 mt-1">Compete with other learners</p>
                          </div>
                          <Trophy className="h-8 w-8 text-yellow-500 flex-shrink-0 ml-4" />
                        </div>
                      </div>
                    </Link>
                  </div>
                </Section>
              )}
            </>
          )}
        </div>
      </div>
    </SharedLayout>
  );
}