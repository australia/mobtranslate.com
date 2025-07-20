'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useParams } from 'next/navigation';
import SharedLayout from '../../components/SharedLayout';
import { PageHeader, Section, Card, CardContent, CardHeader, CardTitle, Badge, Button, LoadingState } from '@ui/components';
import { 
  Trophy, 
  Medal, 
  Crown, 
  Target, 
  Clock,
  Zap,
  TrendingUp,
  Users,
  Calendar,
  Star,
  Award,
  ChevronLeft,
  ChevronRight,
  Timer,
  Brain
} from 'lucide-react';
import Link from 'next/link';

interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  avatar?: string;
  totalSessions: number;
  totalQuestions: number;
  correctAnswers: number;
  accuracy: number;
  totalStudyTime: number;
  wordsLearned: number;
  wordsMastered: number;
  currentStreak: number;
  longestStreak: number;
  avgResponseTime: number;
  points: number;
  isCurrentUser: boolean;
}

interface LeaderboardData {
  leaderboard: LeaderboardEntry[];
  currentUserRank?: number;
  totalParticipants: number;
  languageInfo: {
    name: string;
    code: string;
  };
  periodStats: {
    totalQuestions: number;
    totalSessions: number;
    averageAccuracy: number;
  };
}

const PERIOD_OPTIONS = [
  { value: 'day', label: 'Today', icon: Calendar },
  { value: 'week', label: 'This Week', icon: Calendar },
  { value: 'month', label: 'This Month', icon: Calendar },
  { value: 'year', label: 'This Year', icon: Calendar },
  { value: 'all', label: 'All Time', icon: Star }
];

const getRankIcon = (rank: number) => {
  switch (rank) {
    case 1:
      return <Crown className="h-6 w-6 text-yellow-500" />;
    case 2:
      return <Trophy className="h-6 w-6 text-gray-400" />;
    case 3:
      return <Medal className="h-6 w-6 text-amber-600" />;
    default:
      return <span className="flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 text-gray-600 text-sm font-bold">{rank}</span>;
  }
};

const getRankBadge = (rank: number) => {
  if (rank === 1) return <Badge className="bg-yellow-500 text-white">Champion</Badge>;
  if (rank === 2) return <Badge className="bg-gray-400 text-white">Runner-up</Badge>;
  if (rank === 3) return <Badge className="bg-amber-600 text-white">3rd Place</Badge>;
  if (rank <= 10) return <Badge variant="secondary">Top 10</Badge>;
  if (rank <= 50) return <Badge variant="outline">Top 50</Badge>;
  return null;
};

export default function LeaderboardPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const language = params.language as string;
  
  const [loading, setLoading] = useState(true);
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardData | null>(null);
  const [period, setPeriod] = useState('week');

  useEffect(() => {
    if (authLoading) {
      console.log('[Leaderboard] Auth still loading...');
      return; // Wait for auth to load
    }
    
    if (!user) {
      console.log('[Leaderboard] No user found, redirecting to login');
      router.push('/login');
      return;
    }
    
    console.log('[Leaderboard] User authenticated, fetching data');
    fetchLeaderboardData();
  }, [user, authLoading, router, language, period]);

  const fetchLeaderboardData = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/v2/leaderboard/${language}?period=${period}`);
      if (!response.ok) throw new Error('Failed to fetch leaderboard data');
      
      const data = await response.json();
      setLeaderboardData(data);
    } catch (error) {
      console.error('Error fetching leaderboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatStudyTime = (minutes: number) => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  const formatPoints = (points: number) => {
    if (points >= 1000000) return `${(points / 1000000).toFixed(1)}M`;
    if (points >= 1000) return `${(points / 1000).toFixed(1)}K`;
    return points.toString();
  };

  if (authLoading || !user) return null;

  return (
    <SharedLayout>
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-6 flex items-center justify-between">
            <Link href="/leaderboard" className="inline-flex items-center text-gray-600 hover:text-gray-900">
              <ChevronLeft className="h-4 w-4 mr-1" />
              All Leaderboards
            </Link>
            <Link href={`/dashboard/${language}`} className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700">
              Dashboard
              <ChevronRight className="h-3 w-3 ml-1" />
            </Link>
          </div>

          <PageHeader
            title={`${leaderboardData?.languageInfo.name || language} Leaderboard`}
            description="Compete with other learners and track your progress"
            badge={
              <Badge variant="default" className="ml-2">
                <Users className="h-3 w-3 mr-1" />
                {leaderboardData?.totalParticipants || 0} learners
              </Badge>
            }
          />

          {/* Period Selector */}
          <div className="mt-6 flex flex-wrap gap-2">
            {PERIOD_OPTIONS.map((option) => (
              <Button
                key={option.value}
                variant={period === option.value ? 'default' : 'outline'}
                size="sm"
                onClick={() => setPeriod(option.value)}
                className="flex items-center"
              >
                <option.icon className="h-4 w-4 mr-1" />
                {option.label}
              </Button>
            ))}
          </div>

          {loading ? (
            <LoadingState />
          ) : leaderboardData ? (
            <>
              {/* Period Statistics */}
              <Section className="mt-8">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <Card className="bg-gradient-to-r from-blue-500 to-purple-600 text-white">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-blue-100 text-sm">Total Questions</p>
                          <p className="text-2xl font-bold">{leaderboardData.periodStats.totalQuestions.toLocaleString()}</p>
                        </div>
                        <Brain className="h-8 w-8 text-blue-200" />
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-gradient-to-r from-green-500 to-teal-600 text-white">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-green-100 text-sm">Total Sessions</p>
                          <p className="text-2xl font-bold">{leaderboardData.periodStats.totalSessions.toLocaleString()}</p>
                        </div>
                        <Zap className="h-8 w-8 text-green-200" />
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-gradient-to-r from-yellow-500 to-orange-600 text-white">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-yellow-100 text-sm">Avg Accuracy</p>
                          <p className="text-2xl font-bold">{leaderboardData.periodStats.averageAccuracy.toFixed(1)}%</p>
                        </div>
                        <Target className="h-8 w-8 text-yellow-200" />
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </Section>

              {/* Top 3 Podium */}
              {leaderboardData.leaderboard.length >= 3 && (
                <Section className="mt-8">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto">
                    {/* 2nd Place */}
                    <div className="md:order-1 flex flex-col items-center">
                      <div className="bg-gradient-to-t from-gray-300 to-gray-400 rounded-lg p-6 w-full text-center text-white relative">
                        <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                          <Trophy className="h-8 w-8 text-gray-400" />
                        </div>
                        <div className="mt-4">
                          <h3 className="font-bold text-lg">{leaderboardData.leaderboard[1].username}</h3>
                          <p className="text-sm opacity-90">{formatPoints(leaderboardData.leaderboard[1].points)} pts</p>
                          <p className="text-xs opacity-75">{leaderboardData.leaderboard[1].accuracy.toFixed(1)}% accuracy</p>
                        </div>
                      </div>
                    </div>

                    {/* 1st Place */}
                    <div className="md:order-2 flex flex-col items-center">
                      <div className="bg-gradient-to-t from-yellow-400 to-yellow-500 rounded-lg p-8 w-full text-center text-white relative transform scale-105">
                        <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                          <Crown className="h-10 w-10 text-yellow-300" />
                        </div>
                        <div className="mt-6">
                          <h2 className="font-bold text-xl">{leaderboardData.leaderboard[0].username}</h2>
                          <p className="text-lg font-semibold">{formatPoints(leaderboardData.leaderboard[0].points)} pts</p>
                          <p className="text-sm opacity-90">{leaderboardData.leaderboard[0].accuracy.toFixed(1)}% accuracy</p>
                          <Badge className="mt-2 bg-yellow-600 text-white">Champion</Badge>
                        </div>
                      </div>
                    </div>

                    {/* 3rd Place */}
                    <div className="md:order-3 flex flex-col items-center">
                      <div className="bg-gradient-to-t from-amber-500 to-amber-600 rounded-lg p-6 w-full text-center text-white relative">
                        <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                          <Medal className="h-8 w-8 text-amber-400" />
                        </div>
                        <div className="mt-4">
                          <h3 className="font-bold text-lg">{leaderboardData.leaderboard[2].username}</h3>
                          <p className="text-sm opacity-90">{formatPoints(leaderboardData.leaderboard[2].points)} pts</p>
                          <p className="text-xs opacity-75">{leaderboardData.leaderboard[2].accuracy.toFixed(1)}% accuracy</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </Section>
              )}

              {/* Full Leaderboard */}
              <Section className="mt-8">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <Award className="h-5 w-5 mr-2 text-purple-500" />
                      Full Rankings
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-gray-50 border-b">
                          <tr>
                            <th className="text-left py-3 px-4 font-medium text-gray-700">Rank</th>
                            <th className="text-left py-3 px-4 font-medium text-gray-700">Player</th>
                            <th className="text-center py-3 px-2 font-medium text-gray-700 hidden sm:table-cell">Points</th>
                            <th className="text-center py-3 px-2 font-medium text-gray-700">Accuracy</th>
                            <th className="text-center py-3 px-2 font-medium text-gray-700 hidden md:table-cell">Questions</th>
                            <th className="text-center py-3 px-2 font-medium text-gray-700 hidden lg:table-cell">Study Time</th>
                            <th className="text-center py-3 px-2 font-medium text-gray-700 hidden lg:table-cell">Streak</th>
                            <th className="text-center py-3 px-2 font-medium text-gray-700 hidden xl:table-cell">Words Mastered</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {leaderboardData.leaderboard.map((entry, index) => (
                            <tr 
                              key={entry.userId} 
                              className={`hover:bg-gray-50 transition-colors ${
                                entry.isCurrentUser ? 'bg-blue-50 ring-2 ring-blue-200' : ''
                              }`}
                            >
                              <td className="py-4 px-4">
                                <div className="flex items-center space-x-3">
                                  {getRankIcon(entry.rank)}
                                  {getRankBadge(entry.rank)}
                                </div>
                              </td>
                              <td className="py-4 px-4">
                                <div className="flex items-center space-x-3">
                                  <div className="flex-shrink-0 h-10 w-10">
                                    <div className="h-10 w-10 rounded-full bg-gradient-to-r from-purple-400 to-pink-400 flex items-center justify-center text-white font-bold">
                                      {entry.username.charAt(0).toUpperCase()}
                                    </div>
                                  </div>
                                  <div>
                                    <div className="text-sm font-medium text-gray-900 flex items-center">
                                      {entry.username}
                                      {entry.isCurrentUser && (
                                        <Badge variant="outline" className="ml-2 text-xs">You</Badge>
                                      )}
                                    </div>
                                    <div className="text-xs text-gray-500 sm:hidden">
                                      {formatPoints(entry.points)} pts
                                    </div>
                                  </div>
                                </div>
                              </td>
                              <td className="text-center py-4 px-2 hidden sm:table-cell">
                                <span className="font-bold text-purple-600">{formatPoints(entry.points)}</span>
                              </td>
                              <td className="text-center py-4 px-2">
                                <span className={`font-bold ${
                                  entry.accuracy >= 90 ? 'text-green-600' :
                                  entry.accuracy >= 80 ? 'text-blue-600' :
                                  entry.accuracy >= 70 ? 'text-yellow-600' :
                                  'text-red-600'
                                }`}>
                                  {entry.accuracy.toFixed(1)}%
                                </span>
                              </td>
                              <td className="text-center py-4 px-2 text-gray-600 hidden md:table-cell">
                                {entry.totalQuestions.toLocaleString()}
                              </td>
                              <td className="text-center py-4 px-2 text-gray-600 hidden lg:table-cell">
                                {formatStudyTime(entry.totalStudyTime)}
                              </td>
                              <td className="text-center py-4 px-2 hidden lg:table-cell">
                                <div className="flex items-center justify-center space-x-1">
                                  <Zap className="h-4 w-4 text-orange-500" />
                                  <span className="font-medium">{entry.currentStreak}</span>
                                </div>
                              </td>
                              <td className="text-center py-4 px-2 text-gray-600 hidden xl:table-cell">
                                {entry.wordsMastered}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </Section>

              {/* Current User Summary */}
              {leaderboardData.currentUserRank && (
                <Section className="mt-8">
                  <Card className="bg-gradient-to-r from-blue-500 to-purple-600 text-white">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-lg font-semibold">Your Performance</h3>
                          <p className="text-blue-100">
                            You're ranked #{leaderboardData.currentUserRank} out of {leaderboardData.totalParticipants} learners
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold">{getRankBadge(leaderboardData.currentUserRank)}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Section>
              )}
            </>
          ) : (
            <div className="mt-8 text-center">
              <Trophy className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-600">No leaderboard data available for this language</p>
              <Link href={`/learn/${language}`}>
                <Button className="mt-4">Start Learning</Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </SharedLayout>
  );
}