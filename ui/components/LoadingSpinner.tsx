'use client';

import React from 'react';
import { cn } from '../lib/utils';

export interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const LoadingSpinner = React.forwardRef<HTMLDivElement, LoadingSpinnerProps>(
  ({ size = 'md', className }, ref) => {
    const sizes = {
      sm: 'h-4 w-4',
      md: 'h-6 w-6',
      lg: 'h-8 w-8'
    };

    return (
      <div
        ref={ref}
        className={cn('animate-spin rounded-full border-b-2 border-primary', sizes[size], className)}
      />
    );
  }
);

LoadingSpinner.displayName = 'LoadingSpinner';

const LoadingState = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('flex items-center space-x-3', className)}
      {...props}
    >
      <LoadingSpinner />
      <span>{children || 'Loading...'}</span>
    </div>
  )
);

LoadingState.displayName = 'LoadingState';

const LoadingSkeleton = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('bg-muted rounded-md animate-pulse', className)}
      {...props}
    />
  )
);

LoadingSkeleton.displayName = 'LoadingSkeleton';

export { LoadingSpinner, LoadingState, LoadingSkeleton };