'use client';
import * as React from 'react';
import { Progress as BaseProgress } from '@base-ui-components/react/progress';
import { cn } from '../../utils/cn';

export interface ProgressProps extends React.ComponentPropsWithoutRef<typeof BaseProgress.Root> {}

export const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, ...props }, ref) => (
    <BaseProgress.Root ref={ref} className={cn('mt-progress', className)} {...props}>
      <BaseProgress.Track className="mt-progress-track">
        <BaseProgress.Indicator className="mt-progress-indicator" />
      </BaseProgress.Track>
    </BaseProgress.Root>
  )
);
Progress.displayName = 'Progress';
