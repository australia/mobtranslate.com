'use client';

import React from 'react';
import { cn } from '../lib/utils';

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'success' | 'info' | 'warning' | 'error';
  children: React.ReactNode;
}

const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  ({ className, variant = 'info', children, ...props }, ref) => {
    const baseClasses = 'px-4 py-3 rounded-md border font-medium';
    
    const variants = {
      success: 'bg-green-50 border-green-200 text-green-800',
      info: 'bg-blue-50 border-blue-200 text-blue-800',
      warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
      error: 'bg-red-50 border-red-200 text-red-800'
    };

    return (
      <div
        className={cn(baseClasses, variants[variant], className)}
        ref={ref}
        role="alert"
        {...props}
      >
        {children}
      </div>
    );
  }
);

Alert.displayName = 'Alert';

export { Alert };