'use client';
import * as React from 'react';
import { Progress as BaseProgress } from '@base-ui-components/react/progress';
import { cn } from '../../utils/cn';

export interface ProgressProps extends React.ComponentPropsWithoutRef<typeof BaseProgress.Root> {}

export const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, ...props }, ref) => (
    <BaseProgress.Root ref={ref} className={state => cn('mt-progress', typeof className === 'function' ? className(state) : className)} {...props}>
      <BaseProgress.Track className="mt-progress-track">
        <BaseProgress.Indicator className="mt-progress-indicator" />
      </BaseProgress.Track>
    </BaseProgress.Root>
  )
);
Progress.displayName = 'Progress';

export interface CircularProgressProps extends ProgressProps { size?: 'sm' | 'md' | 'lg' }
export const CircularProgress = React.forwardRef<HTMLDivElement, CircularProgressProps>(
  ({ className, size = 'md', value, min = 0, max = 100, ...props }, ref) => {
    const percentage = value === null ? 25 : Math.min(100, Math.max(0, (value - min) / (max - min) * 100));
    return <BaseProgress.Root ref={ref} value={value} min={min} max={max} className={state => cn('mt-circular-progress', `mt-circular-progress-${size}`, typeof className === 'function' ? className(state) : className)} {...props}>
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
        <circle className="mt-circular-progress-track" cx="12" cy="12" r="10" strokeWidth="3" />
        <circle className="mt-circular-progress-indicator" cx="12" cy="12" r="10" strokeWidth="3" pathLength="100" strokeDasharray={`${percentage} 100`} />
      </svg>
    </BaseProgress.Root>;
  }
);
CircularProgress.displayName = 'CircularProgress';
