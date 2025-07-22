'use client';

import React from 'react';
import { cn } from '../lib/utils';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'primary' | 'secondary' | 'success' | 'error' | 'outline';
  shape?: 'rounded' | 'pill';
  children: React.ReactNode;
}

export function Badge({ className, variant = 'primary', shape = 'rounded', children, ...props }: BadgeProps) {
  const baseClasses = 'inline-flex items-center px-2 py-1 text-xs font-medium';
  
  const variants = {
    primary: 'bg-primary text-primary-foreground',
    secondary: 'bg-secondary text-secondary-foreground',
    success: 'bg-green-100 text-green-800',
    error: 'bg-red-100 text-red-800',
    outline: 'border border-primary text-primary bg-transparent'
  };

  const shapes = {
    rounded: 'rounded-md',
    pill: 'rounded-full'
  };

  return (
    <span
      className={cn(baseClasses, variants[variant], shapes[shape], className)}
      {...props}
    >
      {children}
    </span>
  );
}