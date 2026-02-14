'use client';

import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useParams } from 'next/navigation';
import SharedLayout from '../../components/SharedLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { Section } from '@/components/layout/Section';
import { Card, CardContent, CardHeader, CardTitle, Badge, Button, Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@mobtranslate/ui';
import { DashboardSkeleton } from '@/components/loading/Skeleton';
import { useLeaderboardData } from '@/hooks/useApi';
import { 
  Trophy,
  Medal,
  Crown,
  Target,
  Zap,
  TrendingUp,
  Users,
  Calendar,
  Star,
  Award,
  ChevronLeft,
  ChevronRight,
  Brain,
  BookOpen
} from 'lucide-react';
import Link from 'next/link';



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
      return <span className="flex items-center justify-center w-6 h-6 rounded-full bg-muted text-muted-foreground text-sm font-bold">{rank}</span>;
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
            <Link href="/leaderboard" className="inline-flex items-center text-muted-foreground hover:text-foreground hover-grow">
              <ChevronLeft className="h-4 w-4 mr-1" />
              All Leaderboards
            </Link>
            <Link href={`/dashboard/${language}`} className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground hover-grow">
              Dashboard
              <ChevronRight className="h-3 w-3 ml-1" />
            </Link>
          </div>

          <PageHeader
            title={`${leaderboardData?.languageInfo.name || language} Leaderboard`}
            description="Compete with other learners and track your progress"
            badge={
              leaderboardData?.totalParticipants ? (
                <Badge variant="primary" className="ml-2 animate-scale-in">
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
                variant={period === option.value ? 'primary' : 'outline'}
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
              <p className="text-error">Failed to load leaderboard data</p>
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
                      <Award className="h-5 w-5 mr-2 text-muted-foreground" />
                      Full Rankings
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <Table className="w-full">
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-left py-3 px-4">Rank</TableHead>
                            <TableHead className="text-left py-3 px-4">Player</TableHead>
                            <TableHead className="text-center py-3 px-2 hidden sm:table-cell">Points</TableHead>
                            <TableHead className="text-center py-3 px-2">Accuracy</TableHead>
                            <TableHead className="text-center py-3 px-2 hidden md:table-cell">Questions</TableHead>
                            <TableHead className="text-center py-3 px-2 hidden lg:table-cell">Study Time</TableHead>
                            <TableHead className="text-center py-3 px-2 hidden lg:table-cell">Streak</TableHead>
                            <TableHead className="text-center py-3 px-2 hidden xl:table-cell">Words Mastered</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {leaderboardData.leaderboard.map((entry: any, index: number) => (
                            <TableRow
                              key={entry.userId}
                              className={`transition-all animate-slide-in ${
                                entry.isCurrentUser ? 'bg-primary/10 ring-2 ring-primary/20' : ''
                              }`}
                              style={{ animationDelay: `${(index + 4) * 30}ms` }}
                            >
                              <TableCell className="py-4 px-4">
                                <div className="flex items-center space-x-3">
                                  {getRankIcon(entry.rank)}
                                  {getRankBadge(entry.rank)}
                                </div>
                              </TableCell>
                              <TableCell className="py-4 px-4">
                                <div className="flex items-center space-x-3">
                                  <div className="flex-shrink-0 h-10 w-10">
                                    <div className="h-10 w-10 rounded-full bg-gradient-to-r from-primary to-primary/70 flex items-center justify-center text-white font-bold">
                                      {entry.username.charAt(0).toUpperCase()}
                                    </div>
                                  </div>
                                  <div>
                                    <div className="text-sm font-medium text-foreground flex items-center">
                                      {entry.username}
                                      {entry.isCurrentUser && (
                                        <Badge variant="outline" className="ml-2 text-xs">You</Badge>
                                      )}
                                    </div>
                                    <div className="text-xs text-muted-foreground sm:hidden">
                                      {formatPoints(entry.points)} pts
                                    </div>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="text-center py-4 px-2 hidden sm:table-cell">
                                <span className="font-bold text-foreground">{formatPoints(entry.points)}</span>
                              </TableCell>
                              <TableCell className="text-center py-4 px-2">
                                <span className={`font-bold ${
                                  entry.accuracy >= 90 ? 'text-success' :
                                  entry.accuracy >= 80 ? 'text-primary' :
                                  entry.accuracy >= 70 ? 'text-warning' :
                                  'text-error'
                                }`}>
                                  {entry.accuracy.toFixed(1)}%
                                </span>
                              </TableCell>
                              <TableCell className="text-center py-4 px-2 text-muted-foreground hidden md:table-cell">
                                {entry.totalQuestions.toLocaleString()}
                              </TableCell>
                              <TableCell className="text-center py-4 px-2 text-muted-foreground hidden lg:table-cell">
                                {formatStudyTime(entry.totalStudyTime)}
                              </TableCell>
                              <TableCell className="text-center py-4 px-2 hidden lg:table-cell">
                                <div className="flex items-center justify-center space-x-1">
                                  <Zap className="h-4 w-4 text-warning" />
                                  <span className="font-medium">{entry.currentStreak}</span>
                                </div>
                              </TableCell>
                              <TableCell className="text-center py-4 px-2 text-muted-foreground hidden xl:table-cell">
                                {entry.wordsMastered}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </Section>

              {/* Community Statistics */}
              <Section className="mt-8">
                <Card className="animate-slide-in" style={{ animationDelay: '400ms' }}>
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <TrendingUp className="h-5 w-5 mr-2 text-success" />
                      Community Statistics for {PERIOD_OPTIONS.find(o => o.value === period)?.label || 'This Period'}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="text-center p-4 rounded-lg bg-primary/10">
                        <Brain className="h-8 w-8 text-primary mx-auto mb-2" />
                        <div className="text-2xl font-bold text-primary">{leaderboardData.periodStats.totalQuestions.toLocaleString()}</div>
                        <div className="text-sm text-primary font-medium">Total Questions Answered</div>
                        <div className="text-xs text-primary mt-1">All participants combined</div>
                      </div>
                      
                      <div className="text-center p-4 rounded-lg bg-success/10">
                        <Zap className="h-8 w-8 text-success mx-auto mb-2" />
                        <div className="text-2xl font-bold text-success">{leaderboardData.periodStats.totalSessions.toLocaleString()}</div>
                        <div className="text-sm text-success font-medium">Total Study Sessions</div>
                        <div className="text-xs text-success mt-1">Completed by all learners</div>
                      </div>
                      
                      <div className="text-center p-4 rounded-lg bg-warning/10">
                        <Target className="h-8 w-8 text-warning mx-auto mb-2" />
                        <div className="text-2xl font-bold text-warning">{leaderboardData.periodStats.averageAccuracy.toFixed(1)}%</div>
                        <div className="text-sm text-warning font-medium">Community Average Accuracy</div>
                        <div className="text-xs text-warning mt-1">Overall performance level</div>
                        <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
                          <div 
                            className={`h-full transition-all duration-500 ${
                              leaderboardData.periodStats.averageAccuracy >= 80 ? 'bg-success' :
                              leaderboardData.periodStats.averageAccuracy >= 60 ? 'bg-warning' : 'bg-error'
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
                  <Card className="bg-primary text-primary-foreground animate-slide-in hover-lift" style={{ animationDelay: '400ms' }}>
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-lg font-semibold flex items-center">
                            <Trophy className="h-5 w-5 mr-2" />
                            Your Performance
                          </h3>
                          <p className="text-primary-foreground/70">
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
              <div className="text-center bg-card rounded-xl border p-12">
                <Trophy className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground mb-4">No leaderboard data available for this language</p>
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