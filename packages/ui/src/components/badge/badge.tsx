'use client';
import * as React from 'react';
import { cn } from '../../utils/cn';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'primary' | 'secondary' | 'destructive' | 'error' | 'outline' | 'success' | 'warning';
  shape?: 'rounded' | 'pill';
}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = 'default', shape, ...props }, ref) => (
    <span
      ref={ref}
      className={cn('mt-badge', `mt-badge-${variant}`, shape === 'pill' && 'rounded-full', className)}
      {...props}
    />
  )
);
Badge.displayName = 'Badge';
