'use client';

import React from 'react';
import Link from 'next/link';
import { Card, CardContent, Badge } from '@mobtranslate/ui';
import { 
  Crown, 
  Trophy, 
  Users, 
  Target, 
  Brain, 
  Calendar,
  TrendingUp,
  ChevronRight
} from 'lucide-react';

interface Champion {
  userId: string;
  username: string;
  points: number;
  accuracy: number;
  totalQuestions: number;
  currentStreak: number;
}

interface LeaderboardCardProps {
  languageId: string;
  languageName: string;
  languageCode: string;
  champion: Champion | null;
  totalParticipants: number;
  totalQuestions: number;
  averageAccuracy: number;
  lastActivity: string | null;
  className?: string;
}

const formatPoints = (points: number) => {
  if (points >= 1000000) return `${(points / 1000000).toFixed(1)}M`;
  if (points >= 1000) return `${(points / 1000).toFixed(1)}K`;
  return points.toString();
};

const formatLastActivity = (lastActivity: string | null) => {
  if (!lastActivity) return 'No activity';
  
  const now = new Date();
  const activity = new Date(lastActivity);
  const diffMs = now.getTime() - activity.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffHours < 1) return 'Active now';
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return activity.toLocaleDateString('en', { month: 'short', day: 'numeric' });
};

export default function LeaderboardCard({
  languageId: _languageId,
  languageName,
  languageCode,
  champion,
  totalParticipants,
  totalQuestions,
  averageAccuracy,
  lastActivity,
  className = ''
}: LeaderboardCardProps) {
  return (
    <Link href={`/leaderboard/${languageCode}`} className="block group">
      <Card className={`hover:shadow-lg transition-all duration-200 group-hover:scale-[1.02] ${className}`}>
        <CardContent className="p-6 lg:p-8 space-y-6">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h3 className="text-xl lg:text-2xl font-bold text-foreground mb-2 flex items-center">
                {languageName}
                <ChevronRight className="h-4 w-4 ml-2 text-muted-foreground group-hover:text-foreground transition-colors" />
              </h3>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <div className="flex items-center">
                  <Users className="h-4 w-4 mr-1" />
                  {totalParticipants} learners
                </div>
                <div className="flex items-center">
                  <Calendar className="h-4 w-4 mr-1" />
                  {formatLastActivity(lastActivity)}
                </div>
              </div>
            </div>
            
            {champion && (
              <div className="text-right">
                <Crown className="h-6 w-6 text-yellow-500 mx-auto mb-1" />
                <Badge variant="primary" className="bg-yellow-500 text-white text-xs">
                  Champion
                </Badge>
              </div>
            )}
          </div>

          {/* Champion Info */}
          {champion ? (
            <div className="bg-gradient-to-r from-yellow-50 to-orange-50 rounded-lg p-5 border border-yellow-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="h-10 w-10 rounded-full bg-gradient-to-r from-yellow-400 to-orange-400 flex items-center justify-center text-white font-bold">
                    {champion.username.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h4 className="font-semibold text-foreground">{champion.username}</h4>
                    <p className="text-sm text-muted-foreground">{formatPoints(champion.points)} points</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-foreground">{champion.accuracy.toFixed(1)}% accuracy</p>
                  <p className="text-sm text-muted-foreground">{champion.currentStreak} day streak</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-muted rounded-lg p-6 text-center">
              <Trophy className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-muted-foreground text-sm">No champion yet</p>
              <p className="text-muted-foreground text-xs">Be the first to compete!</p>
            </div>
          )}

          {/* Stats */}
          <div className="grid grid-cols-3 gap-6">
            <div className="text-center">
              <div className="flex items-center justify-center mb-1">
                <Brain className="h-4 w-4 text-primary" />
              </div>
              <p className="text-xl font-bold text-foreground">{totalQuestions.toLocaleString()}</p>
              <p className="text-sm text-muted-foreground">Questions</p>
            </div>
            
            <div className="text-center">
              <div className="flex items-center justify-center mb-1">
                <Target className="h-4 w-4 text-success" />
              </div>
              <p className="text-xl font-bold text-foreground">{averageAccuracy.toFixed(1)}%</p>
              <p className="text-sm text-muted-foreground">Avg Accuracy</p>
            </div>
            
            <div className="text-center">
              <div className="flex items-center justify-center mb-1">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="text-xl font-bold text-foreground">{totalParticipants}</p>
              <p className="text-sm text-muted-foreground">Competitors</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}