'use client';

import React from 'react';
import { cn } from '../lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, error = false, type, ...props }, ref) => {
    const baseClasses = cn(
      'flex h-11 w-full rounded-lg border bg-white dark:bg-gray-900',
      'px-4 py-3 text-base shadow-sm transition-all duration-200',
      'placeholder:text-gray-400 dark:placeholder:text-gray-500',
      'hover:border-gray-300 dark:hover:border-gray-600',
      'focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-900 focus:border-transparent',
      'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-gray-50 dark:disabled:bg-gray-800',
      'file:border-0 file:bg-transparent file:text-sm file:font-medium'
    );
    
    const stateClasses = error 
      ? 'border-red-300 dark:border-red-700 focus:ring-red-500 hover:border-red-400 dark:hover:border-red-600'
      : 'border-gray-200 dark:border-gray-700 focus:ring-blue-500';

    return (
      <input
        type={type}
        className={cn(baseClasses, stateClasses, className)}
        ref={ref}
        {...props}
      />
    );
  }
);

Input.displayName = 'Input';

export { Input };