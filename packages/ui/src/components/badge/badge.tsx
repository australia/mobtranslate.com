'use client';
import * as React from 'react';
import { cn } from '../../utils/cn';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'primary' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning';
}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = 'default', ...props }, ref) => (
    <span
      ref={ref}
      className={cn('mt-badge', `mt-badge-${variant}`, className)}
      {...props}
    />
  )
);
Badge.displayName = 'Badge';
