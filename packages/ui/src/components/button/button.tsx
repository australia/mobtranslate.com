'use client';
import * as React from 'react';
import { cn } from '../../utils/cn';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'destructive' | 'error' | 'success' | 'warning' | 'outline' | 'ghost' | 'link';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  loading?: boolean;
  loadingText?: string;
  fullWidth?: boolean;
  leftIcon?: React.ReactNode;
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, loadingText, fullWidth, leftIcon, disabled, asChild, children, ...props }, ref) => {
    const classes = cn('mt-btn', `mt-btn-${variant}`, `mt-btn-${size}`, loading && 'mt-btn-loading', fullWidth && 'w-full', className);

    if (asChild && React.isValidElement(children)) {
      return React.cloneElement(children as React.ReactElement<any>, {
        className: cn(classes, (children as React.ReactElement<any>).props.className),
        ref,
      });
    }

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={classes}
        {...props}
      >
        {loading && (
          <svg className="mt-btn-spinner" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        )}
        {!loading && leftIcon}
        {loading && loadingText ? loadingText : children}
      </button>
    );
  }
);
Button.displayName = 'Button';
