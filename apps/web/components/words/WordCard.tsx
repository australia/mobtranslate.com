'use client';

import React, { useState, useEffect } from 'react';
import { Heart, Volume2, Clock, TrendingUp, Zap, Target, BookOpen, Sparkles } from 'lucide-react';
import { cn } from '@/app/lib/utils';
import Link from 'next/link';
import { Card } from '@ui/components';
import { WordLikeButton } from '../WordLikeButton';

interface WordCardProps {
  wordId: string;
  word: string;
  translation?: string;
  languageCode?: string;
  languageName?: string;
  stats?: {
    attempts?: number;
    accuracy?: number;
    avgResponseTime?: number;
    lastSeen?: string;
    bucket?: number;
  };
  onLike?: (wordId: string, liked: boolean) => Promise<void>;
  initialLiked?: boolean;
  showStats?: boolean;
  compact?: boolean;
  className?: string;
  clickable?: boolean;
}

const bucketLabels = ['New', 'Learning', 'Learning+', 'Review', 'Review+', 'Mastered'];
const bucketColors = {
  0: { bg: 'from-gray-50 to-gray-100/50 dark:from-gray-950/20 dark:to-gray-900/10', badge: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700' },
  1: { bg: 'from-red-50 to-red-100/50 dark:from-red-950/20 dark:to-red-900/10', badge: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800' },
  2: { bg: 'from-orange-50 to-orange-100/50 dark:from-orange-950/20 dark:to-orange-900/10', badge: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-800' },
  3: { bg: 'from-yellow-50 to-yellow-100/50 dark:from-yellow-950/20 dark:to-yellow-900/10', badge: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800' },
  4: { bg: 'from-blue-50 to-blue-100/50 dark:from-blue-950/20 dark:to-blue-900/10', badge: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800' },
  5: { bg: 'from-green-50 to-green-100/50 dark:from-green-950/20 dark:to-green-900/10', badge: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800' }
};

export function WordCard({
  wordId,
  word,
  translation,
  languageCode,
  languageName,
  stats,
  onLike,
  initialLiked = false,
  showStats = false,
  compact = false,
  className = '',
  clickable = true
}: WordCardProps) {
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);

  const playAudio = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (languageCode && word && !isPlayingAudio) {
      setIsPlayingAudio(true);
      const utterance = new SpeechSynthesisUtterance(word);
      utterance.lang = languageCode;
      utterance.rate = 0.8;
      utterance.onend = () => setIsPlayingAudio(false);
      speechSynthesis.speak(utterance);
    }
  };

  const formatResponseTime = (ms?: number) => {
    if (!ms) return 'N/A';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const formatLastSeen = (date?: string) => {
    if (!date) return 'Never';
    const daysAgo = Math.floor((Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24));
    if (daysAgo === 0) return 'Today';
    if (daysAgo === 1) return 'Yesterday';
    if (daysAgo < 7) return `${daysAgo} days ago`;
    if (daysAgo < 30) return `${Math.floor(daysAgo / 7)} weeks ago`;
    return `${Math.floor(daysAgo / 30)} months ago`;
  };

  const bucket = stats?.bucket ?? 0;
  const bucketConfig = bucketColors[bucket] || bucketColors[0];

  const cardContent = (
    <Card
      className={cn(
        "group relative overflow-hidden transition-all duration-300 border-0 shadow-sm",
        clickable && "hover:shadow-lg hover:-translate-y-1 cursor-pointer",
        compact ? "p-0" : "p-0",
        className
      )}
    >
      {/* Background gradient based on bucket */}
      <div className={cn(
        "absolute inset-0 bg-gradient-to-br opacity-30",
        bucketConfig.bg
      )} />
      
      <div className={cn("relative", compact ? "p-3" : "p-4 sm:p-6")}>
        {/* Header with language badge and bucket status */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            {/* Bucket Status Badge */}
            <span className={cn(
              "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border",
              bucketConfig.badge
            )}>
              {bucket === 5 && <Sparkles className="h-3 w-3" />}
              {bucketLabels[bucket]}
            </span>
            
            {/* Language Badge */}
            {languageName && !compact && (
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700">
                <BookOpen className="h-3 w-3 mr-1" />
                {languageName}
              </span>
            )}
          </div>
        </div>

        {/* Main Content */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h3 className={cn(
              "font-bold text-gray-900 dark:text-gray-100 mb-2 leading-tight",
              compact ? "text-lg" : "text-xl sm:text-2xl"
            )}>
              {word}
            </h3>
            {translation && (
              <p className={cn(
                "text-gray-600 dark:text-gray-400 leading-relaxed",
                compact ? "text-sm" : "text-base sm:text-lg"
              )}>
                {translation}
              </p>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            {languageCode && (
              <button
                onClick={playAudio}
                disabled={isPlayingAudio}
                className={cn(
                  "relative p-2.5 rounded-full transition-all duration-200",
                  "bg-white dark:bg-gray-800 shadow-sm hover:shadow-md",
                  "border border-gray-200 dark:border-gray-700",
                  "hover:bg-gray-50 dark:hover:bg-gray-750",
                  "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2",
                  isPlayingAudio && "bg-blue-50 dark:bg-blue-950/30 border-blue-300 dark:border-blue-700"
                )}
                title="Play pronunciation"
              >
                <Volume2 className={cn(
                  "h-4 w-4 transition-colors",
                  isPlayingAudio ? "text-blue-600 dark:text-blue-400" : "text-gray-600 dark:text-gray-400"
                )} />
                {isPlayingAudio && (
                  <div className="absolute inset-0 rounded-full">
                    <div className="absolute inset-0 rounded-full bg-blue-400 animate-ping opacity-20" />
                  </div>
                )}
              </button>
            )}
            
            {onLike && (
              <WordLikeButton
                wordId={wordId}
                size={compact ? 'sm' : 'default'}
                variant="default"
              />
            )}
          </div>
        </div>

        {/* Stats Section */}
        {showStats && stats && (
          <div className={cn(
            "mt-4 pt-4 border-t border-gray-200 dark:border-gray-700",
            compact ? "grid grid-cols-2 gap-3" : "grid grid-cols-2 sm:grid-cols-4 gap-4"
          )}>
            {/* Accuracy */}
            {stats.accuracy !== undefined && (
              <div className="relative group/stat">
                <div className={cn(
                  "flex items-center gap-2.5 p-3 rounded-lg transition-all duration-200",
                  "bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800"
                )}>
                  <div className={cn(
                    "p-2 rounded-lg",
                    stats.accuracy >= 80 ? "bg-green-100 dark:bg-green-900/30" : 
                    stats.accuracy >= 60 ? "bg-yellow-100 dark:bg-yellow-900/30" : 
                    "bg-red-100 dark:bg-red-900/30"
                  )}>
                    <Target className={cn("flex-shrink-0", compact ? "h-3.5 w-3.5" : "h-4 w-4", 
                      stats.accuracy >= 80 ? "text-green-600 dark:text-green-400" : 
                      stats.accuracy >= 60 ? "text-yellow-600 dark:text-yellow-400" : 
                      "text-red-600 dark:text-red-400"
                    )} />
                  </div>
                  <div>
                    <p className={cn(
                      "font-bold", 
                      compact ? "text-sm" : "text-base",
                      "text-gray-900 dark:text-gray-100"
                    )}>
                      {stats.accuracy.toFixed(0)}%
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Accuracy</p>
                  </div>
                </div>
              </div>
            )}

            {/* Response Time */}
            {stats.avgResponseTime !== undefined && (
              <div className="relative group/stat">
                <div className={cn(
                  "flex items-center gap-2.5 p-3 rounded-lg transition-all duration-200",
                  "bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800"
                )}>
                  <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                    <Clock className={cn("text-blue-600 dark:text-blue-400 flex-shrink-0", compact ? "h-3.5 w-3.5" : "h-4 w-4")} />
                  </div>
                  <div>
                    <p className={cn("font-bold text-gray-900 dark:text-gray-100", compact ? "text-sm" : "text-base")}>
                      {formatResponseTime(stats.avgResponseTime)}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Avg Time</p>
                  </div>
                </div>
              </div>
            )}

            {/* Attempts */}
            {stats.attempts !== undefined && (
              <div className="relative group/stat">
                <div className={cn(
                  "flex items-center gap-2.5 p-3 rounded-lg transition-all duration-200",
                  "bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800"
                )}>
                  <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                    <TrendingUp className={cn("text-purple-600 dark:text-purple-400 flex-shrink-0", compact ? "h-3.5 w-3.5" : "h-4 w-4")} />
                  </div>
                  <div>
                    <p className={cn("font-bold text-gray-900 dark:text-gray-100", compact ? "text-sm" : "text-base")}>
                      {stats.attempts}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Attempts</p>
                  </div>
                </div>
              </div>
            )}

            {/* Last Seen */}
            {stats.lastSeen && (
              <div className="relative group/stat">
                <div className={cn(
                  "flex items-center gap-2.5 p-3 rounded-lg transition-all duration-200",
                  "bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800"
                )}>
                  <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-900/30">
                    <Zap className={cn("text-orange-600 dark:text-orange-400 flex-shrink-0", compact ? "h-3.5 w-3.5" : "h-4 w-4")} />
                  </div>
                  <div>
                    <p className={cn("font-bold text-gray-900 dark:text-gray-100 truncate", compact ? "text-sm" : "text-base")}>
                      {formatLastSeen(stats.lastSeen)}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Last Seen</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );

  if (clickable && wordId) {
    return (
      <Link href={`/word/${wordId}`} className="block">
        {cardContent}
      </Link>
    );
  }

  return cardContent;
}