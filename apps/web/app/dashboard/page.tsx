'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import SharedLayout from '../components/SharedLayout';
import { PageHeader, Section, Card, CardContent, CardHeader, CardTitle, Badge, Button, LoadingState } from '@ui/components';
import { 
  Globe, 
  BookOpen, 
  Target, 
  Clock,
  Trophy,
  Activity,
  ChevronRight,
  Calendar,
  TrendingUp
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

interface OverviewStats {
  totalLanguages: number;
  totalSessions: number;
  totalWords: number;
  overallAccuracy: number;
  currentStreak: number;
  totalStudyTime: number;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [languageStats, setLanguageStats] = useState<LanguageStats[]>([]);
  const [overviewStats, setOverviewStats] = useState<OverviewStats>({
    totalLanguages: 0,
    totalSessions: 0,
    totalWords: 0,
    overallAccuracy: 0,
    currentStreak: 0,
    totalStudyTime: 0
  });

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }
    fetchDashboardData();
  }, [user, router]);

  const fetchDashboardData = async () => {
    try {
      const response = await fetch('/api/v2/dashboard/overview');
      if (!response.ok) throw new Error('Failed to fetch dashboard data');
      
      const data = await response.json();
      setLanguageStats(data.languages || []);
      setOverviewStats(data.overview || {
        totalLanguages: 0,
        totalSessions: 0,
        totalWords: 0,
        overallAccuracy: 0,
        currentStreak: 0,
        totalStudyTime: 0
      });
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

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

  if (!user) return null;

  return (
    <SharedLayout>
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <PageHeader
            title="Learning Dashboard"
            description="Track your progress across all languages"
            badge={
              overviewStats.currentStreak > 0 ? (
                <Badge variant="default" className="ml-2">
                  <Trophy className="h-3 w-3 mr-1" />
                  {overviewStats.currentStreak} day streak
                </Badge>
              ) : null
            }
          />

          {loading ? (
            <LoadingState />
          ) : (
            <>
              {/* Overview Stats */}
              <Section className="mt-8">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                  <Card className="h-full">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-gray-600 truncate">Languages</p>
                          <p className="text-2xl font-bold">{overviewStats.totalLanguages}</p>
                        </div>
                        <Globe className="h-8 w-8 text-blue-500 flex-shrink-0 ml-4" />
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="h-full">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-gray-600 truncate">Total Sessions</p>
                          <p className="text-2xl font-bold">{overviewStats.totalSessions}</p>
                        </div>
                        <BookOpen className="h-8 w-8 text-green-500 flex-shrink-0 ml-4" />
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="h-full">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-gray-600 truncate">Words Learned</p>
                          <p className="text-2xl font-bold">{overviewStats.totalWords}</p>
                        </div>
                        <Target className="h-8 w-8 text-purple-500 flex-shrink-0 ml-4" />
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="h-full">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-gray-600 truncate">Accuracy</p>
                          <p className="text-2xl font-bold">{overviewStats.overallAccuracy.toFixed(0)}%</p>
                        </div>
                        <Activity className="h-8 w-8 text-orange-500 flex-shrink-0 ml-4" />
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="h-full">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-gray-600 truncate">Current Streak</p>
                          <p className="text-2xl font-bold">{overviewStats.currentStreak} days</p>
                        </div>
                        <Trophy className="h-8 w-8 text-yellow-500 flex-shrink-0 ml-4" />
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="h-full">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-gray-600 truncate">Study Time</p>
                          <p className="text-2xl font-bold">{formatStudyTime(overviewStats.totalStudyTime)}</p>
                        </div>
                        <Clock className="h-8 w-8 text-indigo-500 flex-shrink-0 ml-4" />
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </Section>

              {/* Language Cards */}
              <Section className="mt-8">
                <h2 className="text-xl font-semibold mb-6">Your Languages</h2>
                {languageStats.length === 0 ? (
                  <Card>
                    <CardContent className="p-12 text-center">
                      <Globe className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                      <h3 className="text-lg font-medium mb-2">No languages yet</h3>
                      <p className="text-gray-600 mb-6">Start learning your first language to see your progress here</p>
                      <Link href="/learn">
                        <Button>
                          Start Learning
                          <ChevronRight className="ml-2 h-4 w-4" />
                        </Button>
                      </Link>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
                    {languageStats.map((lang) => (
                      <Link key={lang.code} href={`/dashboard/${lang.code}`} className="block">
                        <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
                          <CardHeader>
                            <div className="flex items-center justify-between">
                              <CardTitle className="text-lg truncate">{lang.language}</CardTitle>
                              <Badge variant="outline" className="flex-shrink-0 ml-2">{lang.code.toUpperCase()}</Badge>
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-4">
                            <div className="grid grid-cols-2 gap-3">
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
                                <p className="text-xl font-semibold">{lang.accuracy.toFixed(0)}%</p>
                              </div>
                              <div>
                                <p className="text-sm text-gray-600">Streak</p>
                                <p className="text-xl font-semibold">{lang.streak} days</p>
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

                            <div className="pt-3">
                              <div className="flex items-center justify-between">
                                <span className="text-sm text-blue-600">View details</span>
                                <ChevronRight className="h-4 w-4 text-blue-600" />
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </Link>
                    ))}
                  </div>
                )}
              </Section>

              {/* Quick Actions */}
              {languageStats.length > 0 && (
                <Section className="mt-8">
                  <h2 className="text-xl font-semibold mb-6">Quick Actions</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <Link href="/learn" className="block">
                      <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                        <CardContent className="p-6">
                          <div className="flex items-center justify-between">
                            <div className="min-w-0 flex-1">
                              <h3 className="font-medium">Continue Learning</h3>
                              <p className="text-sm text-gray-600 mt-1">Pick up where you left off</p>
                            </div>
                            <BookOpen className="h-8 w-8 text-green-500 flex-shrink-0 ml-4" />
                          </div>
                        </CardContent>
                      </Card>
                    </Link>

                    <Link href="/stats" className="block">
                      <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                        <CardContent className="p-6">
                          <div className="flex items-center justify-between">
                            <div className="min-w-0 flex-1">
                              <h3 className="font-medium">View Stats</h3>
                              <p className="text-sm text-gray-600 mt-1">See detailed statistics</p>
                            </div>
                            <TrendingUp className="h-8 w-8 text-purple-500 flex-shrink-0 ml-4" />
                          </div>
                        </CardContent>
                      </Card>
                    </Link>

                    <Link href="/leaderboard" className="block">
                      <Card className="hover:shadow-md transition-shadow cursor-pointer h-full bg-gradient-to-br from-yellow-50 to-orange-50 border-yellow-200">
                        <CardContent className="p-6">
                          <div className="flex items-center justify-between">
                            <div className="min-w-0 flex-1">
                              <h3 className="font-medium">Global Leaderboards</h3>
                              <p className="text-sm text-gray-600 mt-1">Compete with other learners</p>
                            </div>
                            <Trophy className="h-8 w-8 text-yellow-500 flex-shrink-0 ml-4" />
                          </div>
                        </CardContent>
                      </Card>
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