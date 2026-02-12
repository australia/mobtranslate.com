'use client';
import * as React from 'react';
import { ScrollArea as BaseScrollArea } from '@base-ui-components/react/scroll-area';
import { cn } from '../../utils/cn';

export const ScrollArea = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseScrollArea.Root>
>(({ className, children, ...props }, ref) => (
  <BaseScrollArea.Root
    ref={ref}
    className={cn('mt-scroll-area', className)}
    {...props}
  >
    <BaseScrollArea.Viewport className="mt-scroll-area-viewport">
      {children}
    </BaseScrollArea.Viewport>
    <BaseScrollArea.Scrollbar
      className="mt-scroll-area-scrollbar"
      orientation="vertical"
    >
      <BaseScrollArea.Thumb className="mt-scroll-area-thumb" />
    </BaseScrollArea.Scrollbar>
    <BaseScrollArea.Scrollbar
      className="mt-scroll-area-scrollbar mt-scroll-area-scrollbar-horizontal"
      orientation="horizontal"
    >
      <BaseScrollArea.Thumb className="mt-scroll-area-thumb" />
    </BaseScrollArea.Scrollbar>
  </BaseScrollArea.Root>
));
ScrollArea.displayName = 'ScrollArea';
