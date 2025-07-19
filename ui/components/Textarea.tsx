'use client';

import React from 'react';
import { cn } from '../lib/utils';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, error = false, ...props }, ref) => {
    const baseClasses = 'w-full px-3 py-2 border rounded-md transition-all shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed resize-y';
    
    const stateClasses = error 
      ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20'
      : 'border-input focus:border-primary focus:ring-primary/20';

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