'use client';
import * as React from 'react';
import { cn } from '../../utils/cn';

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  size?: 'sm' | 'md' | 'lg';
  variant?: 'outline' | 'filled';
  state?: 'default' | 'error' | 'success';
  htmlSize?: number;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = 'text', size = 'md', variant = 'outline', state = 'default', htmlSize, ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      size={htmlSize}
      className={cn(
        'mt-input',
        `mt-input-${size}`,
        variant === 'filled' && 'mt-input-filled',
        state === 'error' && 'mt-input-error',
        state === 'success' && 'mt-input-success',
        className
      )}
      aria-invalid={state === 'error' ? true : undefined}
      {...props}
    />
  )
);
Input.displayName = 'Input';
