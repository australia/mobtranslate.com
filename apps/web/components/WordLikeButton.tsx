'use client';

import React from 'react';
import { Heart } from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { cn } from '../app/lib/utils';
import { useWordLike } from '@/lib/hooks/useWordLike';

interface WordLikeButtonProps {
  wordId: string;
  size?: 'sm' | 'default' | 'lg';
  showLabel?: boolean;
  className?: string;
}

export function WordLikeButton({ 
  wordId, 
  size = 'sm', 
  showLabel = false,
  className 
}: WordLikeButtonProps) {
  const { isLiked, isLoading, toggleLike } = useWordLike(wordId);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    toggleLike();
  };

  return (
    <Button
      variant="ghost"
      size={size}
      onClick={handleClick}
      disabled={isLoading}
      className={cn(
        "group relative",
        isLiked && "text-red-500 hover:text-red-600",
        className
      )}
      title={isLiked ? "Click to unlike" : "Click to like"}
    >
      <Heart
        className={cn(
          "h-4 w-4 transition-all",
          size === 'lg' && "h-6 w-6",
          isLiked && "fill-current"
        )}
      />
      {showLabel && (
        <span className="ml-2">
          {isLiked ? 'Liked' : 'Like'}
        </span>
      )}
    </Button>
  );
}