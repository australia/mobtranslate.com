'use client';
import * as React from 'react';
import { cn } from '../../utils/cn';

export interface MenubarProps extends React.HTMLAttributes<HTMLDivElement> {}

export const Menubar = React.forwardRef<HTMLDivElement, MenubarProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      role="menubar"
      className={cn('mt-menubar', className)}
      {...props}
    />
  )
);
Menubar.displayName = 'Menubar';
