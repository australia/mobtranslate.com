'use client';
import * as React from 'react';
import { cn } from '../../utils/cn';

export interface AspectRatioProps extends React.HTMLAttributes<HTMLDivElement> {
  ratio?: number;
}

export const AspectRatio = React.forwardRef<HTMLDivElement, AspectRatioProps>(
  ({ className, ratio = 16 / 9, style, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('mt-aspect-ratio', className)}
      style={{ ...style, '--mt-aspect-ratio': String(ratio) } as React.CSSProperties}
      {...props}
    >
      {children}
    </div>
  )
);
AspectRatio.displayName = 'AspectRatio';
