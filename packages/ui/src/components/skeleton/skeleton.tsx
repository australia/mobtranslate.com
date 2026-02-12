'use client';
import * as React from 'react';
import { cn } from '../../utils/cn';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'text' | 'circular' | 'rectangular' | 'rounded';
  width?: string | number;
  height?: string | number;
}

export const Skeleton = React.forwardRef<HTMLDivElement, SkeletonProps>(
  ({ className, variant = 'text', width, height, style, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('mt-skeleton', `mt-skeleton-${variant}`, className)}
      style={{ width, height, ...style }}
      {...props}
    />
  )
);
Skeleton.displayName = 'Skeleton';
