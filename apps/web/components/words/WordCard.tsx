'use client';

import React, { useState, useEffect } from 'react';
import { Heart, Volume2, Clock, TrendingUp, Zap, Target } from 'lucide-react';
import { cn } from '@/app/lib/utils';
import Link from 'next/link';

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
  0: 'bg-gray-100 text-gray-700',
  1: 'bg-red-100 text-red-700',
  2: 'bg-orange-100 text-orange-700',
  3: 'bg-yellow-100 text-yellow-700',
  4: 'bg-blue-100 text-blue-700',
  5: 'bg-green-100 text-green-700'
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
  const [liked, setLiked] = useState(initialLiked);
  const [likeLoading, setLikeLoading] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    setLiked(initialLiked);
  }, [initialLiked]);

  const handleLike = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (likeLoading || !onLike) return;
    
    setLikeLoading(true);
    setIsAnimating(true);
    
    try {
      const newLikedState = !liked;
      setLiked(newLikedState); // Optimistic update
      await onLike(wordId, newLikedState);
    } catch (error) {
      console.error('Failed to update like:', error);
      setLiked(!liked); // Revert on error
    } finally {
      setLikeLoading(false);
      setTimeout(() => setIsAnimating(false), 300);
    }
  };

  const playAudio = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (languageCode && word) {
      const utterance = new SpeechSynthesisUtterance(word);
      utterance.lang = languageCode;
      utterance.rate = 0.8;
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

  const cardContent = (
    <div
      className={cn(
        "group relative bg-white rounded-lg border transition-all duration-200",
        clickable && "hover:shadow-lg hover:scale-[1.02] cursor-pointer",
        "hover:border-blue-300",
        compact ? "p-3" : "p-4 sm:p-6",
        className
      )}
    >
      {/* Language Badge */}
      {languageName && !compact && (
        <div className="absolute top-2 right-2">
          <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
            {languageName}
          </span>
        </div>
      )}

      {/* Main Content */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h3 className={cn(
            "font-bold text-gray-900 mb-1",
            compact ? "text-base sm:text-lg" : "text-lg sm:text-xl"
          )}>
            {word}
          </h3>
          {translation && (
            <p className={cn(
              "text-gray-600",
              compact ? "text-sm" : "text-base"
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
              className="p-2 rounded-full hover:bg-gray-100 transition-colors"
              title="Play pronunciation"
            >
              <Volume2 className="h-4 w-4 text-gray-600" />
            </button>
          )}
          
          {onLike && (
            <button
              onClick={handleLike}
              disabled={likeLoading}
              className={cn(
                "p-2 rounded-full transition-all duration-200",
                liked 
                  ? "text-red-500 hover:bg-red-50" 
                  : "text-gray-400 hover:text-red-500 hover:bg-red-50",
                isAnimating && "scale-125"
              )}
              title={liked ? "Unlike" : "Like"}
            >
              <Heart 
                className={cn(
                  "h-4 w-4 transition-all duration-200",
                  liked && "fill-current"
                )} 
              />
            </button>
          )}
        </div>
      </div>

      {/* Stats Section */}
      {showStats && stats && (
        <div className={cn(
          "border-t mt-4 pt-4",
          compact ? "grid grid-cols-2 gap-2" : "grid grid-cols-2 sm:grid-cols-4 gap-3"
        )}>
          {/* Accuracy */}
          {stats.accuracy !== undefined && (
            <div className="flex items-center gap-2">
              <Target className={cn("flex-shrink-0", compact ? "h-3 w-3" : "h-4 w-4", 
                stats.accuracy >= 80 ? "text-green-500" : 
                stats.accuracy >= 60 ? "text-yellow-500" : 
                "text-red-500"
              )} />
              <div>
                <p className={cn("font-semibold", compact ? "text-sm" : "text-base", 
                  stats.accuracy >= 80 ? "text-green-600" : 
                  stats.accuracy >= 60 ? "text-yellow-600" : 
                  "text-red-600"
                )}>
                  {stats.accuracy.toFixed(0)}%
                </p>
                <p className="text-xs text-gray-500">Accuracy</p>
              </div>
            </div>
          )}

          {/* Response Time */}
          {stats.avgResponseTime !== undefined && (
            <div className="flex items-center gap-2">
              <Clock className={cn("text-blue-500 flex-shrink-0", compact ? "h-3 w-3" : "h-4 w-4")} />
              <div>
                <p className={cn("font-semibold", compact ? "text-sm" : "text-base")}>
                  {formatResponseTime(stats.avgResponseTime)}
                </p>
                <p className="text-xs text-gray-500">Avg Time</p>
              </div>
            </div>
          )}

          {/* Attempts */}
          {stats.attempts !== undefined && (
            <div className="flex items-center gap-2">
              <TrendingUp className={cn("text-purple-500 flex-shrink-0", compact ? "h-3 w-3" : "h-4 w-4")} />
              <div>
                <p className={cn("font-semibold", compact ? "text-sm" : "text-base")}>
                  {stats.attempts}
                </p>
                <p className="text-xs text-gray-500">Attempts</p>
              </div>
            </div>
          )}

          {/* Last Seen */}
          {stats.lastSeen && (
            <div className="flex items-center gap-2">
              <Zap className={cn("text-orange-500 flex-shrink-0", compact ? "h-3 w-3" : "h-4 w-4")} />
              <div>
                <p className={cn("font-semibold truncate", compact ? "text-sm" : "text-base")}>
                  {formatLastSeen(stats.lastSeen)}
                </p>
                <p className="text-xs text-gray-500">Last Seen</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Learning Stage Badge */}
      {stats?.bucket !== undefined && (
        <div className="mt-3">
          <span className={cn(
            "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
            bucketColors[stats.bucket] || bucketColors[0]
          )}>
            {bucketLabels[stats.bucket] || 'New'}
          </span>
        </div>
      )}
    </div>
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