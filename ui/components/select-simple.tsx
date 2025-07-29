'use client';

import React from 'react';
import { cn } from '../lib/utils';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean;
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, error = false, children, ...props }, ref) => {
    const baseClasses = cn(
      'w-full h-11 px-4 py-3 pr-10 rounded-lg border bg-white dark:bg-gray-900',
      'text-base shadow-sm transition-all duration-200 appearance-none cursor-pointer',
      'hover:border-gray-300 dark:hover:border-gray-600',
      'focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-900 focus:border-transparent',
      'disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-50 dark:disabled:bg-gray-800',
      'bg-[url("data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%236b7280%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E")] bg-[length:20px] bg-[position:right_12px_center] bg-no-repeat'
    );
    
    const stateClasses = error 
      ? 'border-red-300 dark:border-red-700 focus:ring-red-500 hover:border-red-400 dark:hover:border-red-600'
      : 'border-gray-200 dark:border-gray-700 focus:ring-blue-500';

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