'use client';
import * as React from 'react';
import { cn } from '../../utils/cn';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  resize?: 'none' | 'vertical' | 'horizontal' | 'both';
  size?: 'sm' | 'md' | 'lg';
  state?: 'default' | 'error';
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, resize = 'vertical', size = 'md', state = 'default', ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'mt-textarea',
        `mt-textarea-resize-${resize}`,
        `mt-textarea-${size}`,
        state === 'error' && 'mt-textarea-error',
        className
      )}
      aria-invalid={state === 'error' ? true : undefined}
      {...props}
    />
  )
);
Textarea.displayName = 'Textarea';
