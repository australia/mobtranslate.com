'use client';

import React from 'react';
import Link from 'next/link';
import { Card, CardContent, Badge } from '@ui/components';
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
  languageId,
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
        <CardContent className="p-6">
          {/* Header */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <h3 className="text-lg font-bold text-gray-900 mb-1 flex items-center">
                {languageName}
                <ChevronRight className="h-4 w-4 ml-2 text-gray-400 group-hover:text-gray-600 transition-colors" />
              </h3>
              <div className="flex items-center gap-3 text-sm text-gray-600">
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
                <Badge variant="default" className="bg-yellow-500 text-white text-xs">
                  Champion
                </Badge>
              </div>
            )}
          </div>

          {/* Champion Info */}
          {champion ? (
            <div className="bg-gradient-to-r from-yellow-50 to-orange-50 rounded-lg p-4 mb-4 border border-yellow-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="h-10 w-10 rounded-full bg-gradient-to-r from-yellow-400 to-orange-400 flex items-center justify-center text-white font-bold">
                    {champion.username.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900">{champion.username}</h4>
                    <p className="text-sm text-gray-600">{formatPoints(champion.points)} points</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-gray-900">{champion.accuracy.toFixed(1)}% accuracy</p>
                  <p className="text-xs text-gray-600">{champion.currentStreak} day streak</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-gray-50 rounded-lg p-4 mb-4 text-center">
              <Trophy className="h-8 w-8 text-gray-300 mx-auto mb-2" />
              <p className="text-gray-500 text-sm">No champion yet</p>
              <p className="text-gray-400 text-xs">Be the first to compete!</p>
            </div>
          )}

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="flex items-center justify-center mb-1">
                <Brain className="h-4 w-4 text-blue-500" />
              </div>
              <p className="text-lg font-bold text-gray-900">{totalQuestions.toLocaleString()}</p>
              <p className="text-xs text-gray-600">Questions</p>
            </div>
            
            <div className="text-center">
              <div className="flex items-center justify-center mb-1">
                <Target className="h-4 w-4 text-green-500" />
              </div>
              <p className="text-lg font-bold text-gray-900">{averageAccuracy.toFixed(1)}%</p>
              <p className="text-xs text-gray-600">Avg Accuracy</p>
            </div>
            
            <div className="text-center">
              <div className="flex items-center justify-center mb-1">
                <TrendingUp className="h-4 w-4 text-purple-500" />
              </div>
              <p className="text-lg font-bold text-gray-900">{totalParticipants}</p>
              <p className="text-xs text-gray-600">Competitors</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}