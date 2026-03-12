'use client';

import React from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@mobtranslate/ui';
import {
  Crown,
  Trophy,
  Users,
  Target,
  Brain,
  Calendar,
  Flame,
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
      <Card className={`relative overflow-hidden border-border/60 hover:shadow-xl transition-all duration-300 group-hover:-translate-y-1 ${className}`}>
        {/* Warm accent top border */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-400 via-orange-400 to-amber-300" />

        <CardContent className="p-6 lg:p-7 space-y-5">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <h3 className="text-xl lg:text-2xl font-bold text-foreground truncate flex items-center gap-2">
                {languageName}
                <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-amber-600 dark:group-hover:text-amber-400 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
              </h3>
              <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1.5">
                <span className="flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" />
                  {totalParticipants} learners
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  {formatLastActivity(lastActivity)}
                </span>
              </div>
            </div>
          </div>

          {/* Champion Section */}
          {champion ? (
            <div className="bg-gradient-to-br from-amber-50 to-orange-50/70 dark:from-amber-950/20 dark:to-orange-950/10 rounded-xl p-4 border border-amber-200/60 dark:border-amber-800/30">
              <div className="flex items-center gap-3">
                {/* Avatar with crown */}
                <div className="relative flex-shrink-0">
                  <div className="h-12 w-12 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white font-bold text-lg shadow-md">
                    {champion.username.charAt(0).toUpperCase()}
                  </div>
                  <Crown className="h-4 w-4 text-amber-500 absolute -top-2 -right-1 drop-shadow-sm" />
                </div>

                {/* Champion info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold text-foreground truncate">{champion.username}</h4>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 text-xs font-semibold flex-shrink-0">
                      <Trophy className="h-3 w-3" />
                      Champion
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    <span className="font-semibold text-foreground">{formatPoints(champion.points)}</span> points
                  </p>
                </div>
              </div>

              {/* Champion stats row */}
              <div className="flex items-center gap-4 mt-3 pt-3 border-t border-amber-200/50 dark:border-amber-800/20">
                <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Target className="h-3.5 w-3.5 text-emerald-500" />
                  <span className="font-medium text-foreground">{champion.accuracy.toFixed(1)}%</span> accuracy
                </span>
                <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Brain className="h-3.5 w-3.5 text-blue-500" />
                  <span className="font-medium text-foreground">{champion.totalQuestions}</span> answered
                </span>
                {champion.currentStreak > 0 && (
                  <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Flame className="h-3.5 w-3.5 text-orange-500" />
                    <span className="font-medium text-foreground">{champion.currentStreak}</span> streak
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-muted/50 rounded-xl p-6 text-center border border-border/40">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-muted mb-3">
                <Trophy className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground text-sm font-medium">No champion yet</p>
              <p className="text-muted-foreground/70 text-xs mt-0.5">Be the first to compete!</p>
            </div>
          )}

          {/* Bottom Stats Row */}
          <div className="grid grid-cols-3 gap-3 pt-1">
            <div className="text-center p-2 rounded-lg bg-muted/40">
              <p className="text-xl lg:text-2xl font-bold text-foreground">{totalQuestions.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground font-medium mt-0.5">Questions</p>
            </div>
            <div className="text-center p-2 rounded-lg bg-muted/40">
              <p className="text-xl lg:text-2xl font-bold text-foreground">{averageAccuracy.toFixed(1)}%</p>
              <p className="text-xs text-muted-foreground font-medium mt-0.5">Avg Accuracy</p>
            </div>
            <div className="text-center p-2 rounded-lg bg-muted/40">
              <p className="text-xl lg:text-2xl font-bold text-foreground">{totalParticipants}</p>
              <p className="text-xs text-muted-foreground font-medium mt-0.5">Competitors</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
