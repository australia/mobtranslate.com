'use client';

import React from 'react';
import { cn } from '../lib/utils';

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'success' | 'info' | 'warning' | 'error' | 'destructive';
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  dismissible?: boolean;
  onDismiss?: () => void;
  children?: React.ReactNode;
}

const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  ({ 
    className, 
    variant = 'default', 
    title,
    description,
    icon,
    action,
    dismissible = false,
    onDismiss,
    children, 
    ...props 
  }, ref) => {
    const baseClasses = cn(
      'relative w-full rounded-lg border p-4',
      'transition-all duration-200',
      'shadow-sm'
    );
    
    const variants = {
      default: cn(
        'bg-gray-50 border-gray-200 text-gray-900',
        'dark:bg-gray-900/50 dark:border-gray-800 dark:text-gray-100'
      ),
      success: cn(
        'bg-green-50 border-green-200 text-green-900',
        'dark:bg-green-950/50 dark:border-green-900 dark:text-green-100'
      ),
      info: cn(
        'bg-blue-50 border-blue-200 text-blue-900',
        'dark:bg-blue-950/50 dark:border-blue-900 dark:text-blue-100'
      ),
      warning: cn(
        'bg-yellow-50 border-yellow-200 text-yellow-900',
        'dark:bg-yellow-950/50 dark:border-yellow-900 dark:text-yellow-100'
      ),
      error: cn(
        'bg-red-50 border-red-200 text-red-900',
        'dark:bg-red-950/50 dark:border-red-900 dark:text-red-100'
      ),
      destructive: cn(
        'bg-red-100 border-red-300 text-red-900',
        'dark:bg-red-950/70 dark:border-red-800 dark:text-red-100'
      )
    };

    const iconColors = {
      default: 'text-gray-600 dark:text-gray-400',
      success: 'text-green-600 dark:text-green-400',
      info: 'text-blue-600 dark:text-blue-400',
      warning: 'text-yellow-600 dark:text-yellow-400',
      error: 'text-red-600 dark:text-red-400',
      destructive: 'text-red-700 dark:text-red-300'
    };

    // If children are provided, use legacy layout
    if (children && !title && !description) {
      return (
        <div
          className={cn(baseClasses, variants[variant], className)}
          ref={ref}
          role="alert"
          {...props}
        >
          <div className="flex items-start gap-3">
            {children}
            {dismissible && (
              <button
                onClick={onDismiss}
                className="ml-auto -mr-1.5 -mt-1.5 inline-flex h-8 w-8 items-center justify-center rounded-lg opacity-70 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-opacity"
                aria-label="Dismiss"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>
      );
    }

    // Modern layout with title, description, icon, and action
    return (
      <div
        className={cn(baseClasses, variants[variant], className)}
        ref={ref}
        role="alert"
        {...props}
      >
        <div className="flex gap-3">
          {icon && (
            <div className={cn('flex-shrink-0 mt-0.5', iconColors[variant])}>
              {icon}
            </div>
          )}
          
          <div className="flex-1 space-y-1">
            {title && (
              <h3 className="text-sm font-semibold leading-none tracking-tight">
                {title}
              </h3>
            )}
            {description && (
              <div className="text-sm opacity-90">
                {description}
              </div>
            )}
            {children && (
              <div className="text-sm opacity-90">
                {children}
              </div>
            )}
            {action && (
              <div className="mt-3">
                {action}
              </div>
            )}
          </div>

          {dismissible && (
            <button
              onClick={onDismiss}
              className="flex-shrink-0 -mr-1.5 -mt-1.5 inline-flex h-8 w-8 items-center justify-center rounded-lg opacity-70 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-opacity"
              aria-label="Dismiss"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>
    );
  }
);

Alert.displayName = 'Alert';

export { Alert };