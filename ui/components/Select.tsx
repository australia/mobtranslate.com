'use client';

import React from 'react';
import { cn } from '../lib/utils';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean;
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, error = false, children, ...props }, ref) => {
    const baseClasses = 'w-full px-3 py-2 border rounded-md transition-all shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed bg-background';
    
    const stateClasses = error 
      ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20'
      : 'border-input focus:border-primary focus:ring-primary/20';

    return (
      <select
        className={cn(baseClasses, stateClasses, className)}
        ref={ref}
        {...props}
      >
        {children}
      </select>
    );
  }
);

Select.displayName = 'Select';

export { Select };