'use client';

import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useParams } from 'next/navigation';
import SharedLayout from '../../components/SharedLayout';
import { PageHeader, Section, Card, CardContent, CardHeader, CardTitle, Badge, Button } from '@/app/components/ui/table';
import { StatsCard } from '@/components/stats/StatsCard';
import { DashboardSkeleton } from '@/components/loading/Skeleton';
import { useLeaderboardData } from '@/hooks/useApi';
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
  Brain,
  BookOpen
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
  
  const [period, setPeriod] = useState('week');
  const { data: leaderboardData, error, isLoading } = useLeaderboardData(language, period);

  React.useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

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
      <div className="min-h-screen">
        <div className="max-w-[1920px] 2xl:max-w-[2200px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 2xl:px-16">
          <div className="mb-6 flex items-center justify-between animate-slide-in">
            <Link href="/leaderboard" className="inline-flex items-center text-gray-600 hover:text-gray-900 hover-grow">
              <ChevronLeft className="h-4 w-4 mr-1" />
              All Leaderboards
            </Link>
            <Link href={`/dashboard/${language}`} className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 hover-grow">
              Dashboard
              <ChevronRight className="h-3 w-3 ml-1" />
            </Link>
          </div>

          <PageHeader
            title={`${leaderboardData?.languageInfo.name || language} Leaderboard`}
            description="Compete with other learners and track your progress"
            badge={
              leaderboardData?.totalParticipants ? (
                <Badge variant="default" className="ml-2 animate-scale-in">
                  <Users className="h-3 w-3 mr-1" />
                  {leaderboardData.totalParticipants} learners
                </Badge>
              ) : null
            }
          />

          {/* Period Selector */}
          <div className="mt-6 flex flex-wrap gap-2 animate-slide-in">
            {PERIOD_OPTIONS.map((option, index) => (
              <Button
                key={option.value}
                variant={period === option.value ? 'default' : 'outline'}
                size="sm"
                onClick={() => setPeriod(option.value)}
                className="flex items-center hover-grow animate-slide-in"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <option.icon className="h-4 w-4 mr-1" />
                {option.label}
              </Button>
            ))}
          </div>

          {isLoading ? (
            <DashboardSkeleton />
          ) : error ? (
            <div className="mt-8 text-center">
              <p className="text-red-600">Failed to load leaderboard data</p>
              <Button onClick={() => window.location.reload()} className="mt-4">
                Retry
              </Button>
            </div>
          ) : leaderboardData ? (
            <>
              {/* Top 3 Podium */}
              {leaderboardData.leaderboard.length >= 3 && (
                <Section className="mt-8">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto animate-slide-in" style={{ animationDelay: '150ms' }}>
                    {/* 2nd Place */}
                    <div className="md:order-1 flex flex-col items-center animate-scale-in" style={{ animationDelay: '250ms' }}>
                      <div className="bg-gradient-to-t from-gray-300 to-gray-400 rounded-lg p-6 w-full text-center text-white relative hover-lift">
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
                    <div className="md:order-2 flex flex-col items-center animate-scale-in" style={{ animationDelay: '200ms' }}>
                      <div className="bg-gradient-to-t from-yellow-400 to-yellow-500 rounded-lg p-8 w-full text-center text-white relative transform scale-105 hover-lift">
                        <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                          <Crown className="h-10 w-10 text-yellow-300 animate-wave" />
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
                    <div className="md:order-3 flex flex-col items-center animate-scale-in" style={{ animationDelay: '300ms' }}>
                      <div className="bg-gradient-to-t from-amber-500 to-amber-600 rounded-lg p-6 w-full text-center text-white relative hover-lift">
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
                <Card className="animate-slide-in" style={{ animationDelay: '350ms' }}>
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
                              className={`hover:bg-gray-50 transition-all animate-slide-in ${
                                entry.isCurrentUser ? 'bg-blue-50 ring-2 ring-blue-200' : ''
                              }`}
                              style={{ animationDelay: `${(index + 4) * 30}ms` }}
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

              {/* Community Statistics */}
              <Section className="mt-8">
                <Card className="animate-slide-in" style={{ animationDelay: '400ms' }}>
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <TrendingUp className="h-5 w-5 mr-2 text-green-500" />
                      Community Statistics for {PERIOD_OPTIONS.find(o => o.value === period)?.label || 'This Period'}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="text-center p-4 rounded-lg bg-blue-50">
                        <Brain className="h-8 w-8 text-blue-500 mx-auto mb-2" />
                        <div className="text-2xl font-bold text-blue-900">{leaderboardData.periodStats.totalQuestions.toLocaleString()}</div>
                        <div className="text-sm text-blue-700 font-medium">Total Questions Answered</div>
                        <div className="text-xs text-blue-600 mt-1">All participants combined</div>
                      </div>
                      
                      <div className="text-center p-4 rounded-lg bg-green-50">
                        <Zap className="h-8 w-8 text-green-500 mx-auto mb-2" />
                        <div className="text-2xl font-bold text-green-900">{leaderboardData.periodStats.totalSessions.toLocaleString()}</div>
                        <div className="text-sm text-green-700 font-medium">Total Study Sessions</div>
                        <div className="text-xs text-green-600 mt-1">Completed by all learners</div>
                      </div>
                      
                      <div className="text-center p-4 rounded-lg bg-orange-50">
                        <Target className="h-8 w-8 text-orange-500 mx-auto mb-2" />
                        <div className="text-2xl font-bold text-orange-900">{leaderboardData.periodStats.averageAccuracy.toFixed(1)}%</div>
                        <div className="text-sm text-orange-700 font-medium">Community Average Accuracy</div>
                        <div className="text-xs text-orange-600 mt-1">Overall performance level</div>
                        <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div 
                            className={`h-full transition-all duration-500 ${
                              leaderboardData.periodStats.averageAccuracy >= 80 ? 'bg-green-500' : 
                              leaderboardData.periodStats.averageAccuracy >= 60 ? 'bg-yellow-500' : 'bg-red-500'
                            }`}
                            style={{ width: `${leaderboardData.periodStats.averageAccuracy}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Section>

              {/* Current User Summary */}
              {leaderboardData.currentUserRank && (
                <Section className="mt-8 mb-8">
                  <Card className="bg-gradient-to-r from-blue-500 to-purple-600 text-white animate-slide-in hover-lift" style={{ animationDelay: '400ms' }}>
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-lg font-semibold flex items-center">
                            <Trophy className="h-5 w-5 mr-2" />
                            Your Performance
                          </h3>
                          <p className="text-blue-100">
                            You're ranked #{leaderboardData.currentUserRank} out of {leaderboardData.totalParticipants} learners
                          </p>
                        </div>
                        <div className="text-right">
                          {getRankBadge(leaderboardData.currentUserRank)}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Section>
              )}
            </>
          ) : (
            <Section className="mt-8">
              <div className="text-center bg-white rounded-xl border p-12">
                <Trophy className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-600 mb-4">No leaderboard data available for this language</p>
                <Link href={`/learn/${language}`}>
                  <Button className="hover-grow">
                    <BookOpen className="h-4 w-4 mr-2" />
                    Start Learning
                  </Button>
                </Link>
              </div>
            </Section>
          )}
        </div>
      </div>
    </SharedLayout>
  );
}