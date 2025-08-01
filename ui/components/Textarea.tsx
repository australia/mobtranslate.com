'use client';

import React from 'react';
import { cn } from '../lib/utils';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, error = false, ...props }, ref) => {
    const baseClasses = cn(
      'w-full px-4 py-3 min-h-[120px] rounded-lg border bg-white dark:bg-gray-900',
      'text-base leading-relaxed shadow-sm transition-all duration-200 resize-y',
      'placeholder:text-gray-400 dark:placeholder:text-gray-500',
      'hover:border-gray-300 dark:hover:border-gray-600',
      'focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-900 focus:border-transparent',
      'disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-50 dark:disabled:bg-gray-800'
    );
    
    const stateClasses = error 
      ? 'border-red-300 dark:border-red-700 focus:ring-red-500 hover:border-red-400 dark:hover:border-red-600'
      : 'border-gray-200 dark:border-gray-700 focus:ring-blue-500';

    return (
      <textarea
        className={cn(baseClasses, stateClasses, className)}
        ref={ref}
        {...props}
      />
    );
  }
);

Textarea.displayName = 'Textarea';

export { Textarea };