'use client';

import React, { useState } from 'react';
import { Heart } from 'lucide-react';
import { cn } from '../app/lib/utils';
import { useWordLike } from '@/lib/hooks/useWordLike';

interface WordLikeButtonProps {
  wordId: string;
  size?: 'sm' | 'default' | 'lg';
  showLabel?: boolean;
  className?: string;
  variant?: 'default' | 'minimal' | 'floating';
}

export function WordLikeButton({ 
  wordId, 
  size = 'default', 
  showLabel = false,
  className,
  variant = 'default'
}: WordLikeButtonProps) {
  const { isLiked, isLoading, toggleLike } = useWordLike(wordId);
  const [isAnimating, setIsAnimating] = useState(false);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isLoading) {
      setIsAnimating(true);
      toggleLike();
      setTimeout(() => setIsAnimating(false), 400);
    }
  };

  const sizeClasses = {
    sm: {
      button: 'h-8 w-8',
      icon: 'h-4 w-4',
      text: 'text-sm'
    },
    default: {
      button: 'h-10 w-10',
      icon: 'h-5 w-5',
      text: 'text-base'
    },
    lg: {
      button: 'h-12 w-12',
      icon: 'h-6 w-6',
      text: 'text-lg'
    }
  };

  const variantClasses = {
    default: cn(
      "relative bg-white dark:bg-gray-800 shadow-sm hover:shadow-md",
      "border border-gray-200 dark:border-gray-700",
      "transition-all duration-200",
      isLiked 
        ? "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800" 
        : "hover:bg-gray-50 dark:hover:bg-gray-750"
    ),
    minimal: cn(
      "relative",
      "transition-all duration-200",
      isLiked
        ? "bg-red-100 dark:bg-red-900/30"
        : "bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
    ),
    floating: cn(
      "relative bg-white dark:bg-gray-800",
      "shadow-lg hover:shadow-xl",
      "border-0",
      "transition-all duration-200 hover:-translate-y-0.5",
      isLiked && "bg-gradient-to-br from-red-50 to-pink-50 dark:from-red-950/30 dark:to-pink-950/30"
    )
  };

  const currentSize = sizeClasses[size];

  return (
    <button
      onClick={handleClick}
      disabled={isLoading}
      className={cn(
        "group rounded-full flex items-center justify-center",
        "focus:outline-none focus:ring-2 focus:ring-offset-2",
        isLiked ? "focus:ring-red-500" : "focus:ring-gray-400",
        variantClasses[variant],
        showLabel ? "px-4 py-2 w-auto" : currentSize.button,
        isLoading && "opacity-50 cursor-not-allowed",
        className
      )}
      title={isLiked ? "Remove from favorites" : "Add to favorites"}
    >
      <div className="relative">
        <Heart
          className={cn(
            "transition-all duration-300",
            currentSize.icon,
            isLiked 
              ? "text-red-500 fill-current" 
              : "text-gray-400 group-hover:text-gray-600 dark:text-gray-500 dark:group-hover:text-gray-300",
            isAnimating && "scale-125"
          )}
        />
        
        {/* Pulse animation on like */}
        {isAnimating && isLiked && (
          <Heart
            className={cn(
              "absolute inset-0 text-red-500 fill-current animate-ping",
              currentSize.icon
            )}
          />
        )}
      </div>
      
      {showLabel && (
        <span className={cn(
          "ml-2 font-medium transition-colors duration-200",
          currentSize.text,
          isLiked 
            ? "text-red-600 dark:text-red-400" 
            : "text-gray-600 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-gray-200"
        )}>
          {isLiked ? 'Liked' : 'Like'}
        </span>
      )}
      
      {/* Loading spinner overlay */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center rounded-full bg-white/50 dark:bg-gray-800/50">
          <div className="h-4 w-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
        </div>
      )}
    </button>
  );
}