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
      data-invalid-ratio={!(Number.isFinite(ratio)&&ratio>0)||undefined}
      style={{ ...style, '--mt-aspect-ratio': String(Number.isFinite(ratio)&&ratio>0?ratio:16/9) } as React.CSSProperties}
      {...props}
    >
      {children}
    </div>
  )
);
AspectRatio.displayName = 'AspectRatio';
