'use client';
import * as React from 'react';
import { cn } from '../../utils/cn';

export interface StackProps extends React.HTMLAttributes<HTMLDivElement> {
  direction?: 'row' | 'column';
  gap?: number | string;
  align?: 'start' | 'center' | 'end' | 'stretch' | 'baseline';
  justify?: 'start' | 'center' | 'end' | 'between' | 'around' | 'evenly';
  wrap?: boolean;
}

export const Stack = React.forwardRef<HTMLDivElement, StackProps>(
  ({ className, direction = 'column', gap = 3, align, justify, wrap, style, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'mt-stack',
        direction === 'row' ? 'mt-stack-row' : 'mt-stack-column',
        wrap && 'mt-stack-wrap',
        className
      )}
      style={{
        ...style,
        gap: typeof gap === 'number' ? `${gap * 0.25}rem` : gap,
        alignItems: align === 'start' ? 'flex-start' : align === 'end' ? 'flex-end' : align,
        justifyContent:
          justify === 'start' ? 'flex-start' :
          justify === 'end' ? 'flex-end' :
          justify === 'between' ? 'space-between' :
          justify === 'around' ? 'space-around' :
          justify === 'evenly' ? 'space-evenly' :
          justify,
      } as React.CSSProperties}
      {...props}
    />
  )
);
Stack.displayName = 'Stack';

export const HStack = React.forwardRef<HTMLDivElement, Omit<StackProps, 'direction'>>(
  (props, ref) => <Stack ref={ref} direction="row" {...props} />
);
HStack.displayName = 'HStack';

export const VStack = React.forwardRef<HTMLDivElement, Omit<StackProps, 'direction'>>(
  (props, ref) => <Stack ref={ref} direction="column" {...props} />
);
VStack.displayName = 'VStack';
