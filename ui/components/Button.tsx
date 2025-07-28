'use client';

import React from 'react';
import { cn } from '../lib/utils';

export interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'destructive' | 'outline' | 'ghost' | 'link' | 'success' | 'warning';
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  fullWidth?: boolean;
  loading?: boolean;
  loadingText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  asChild?: boolean;
  children: React.ReactNode;
  className?: string;
}

// For when asChild is true, we accept any props
type ButtonAsChildProps = ButtonProps & { asChild: true } & Record<string, any>;
// For when asChild is false or undefined, we extend button props
type ButtonElementProps = ButtonProps & { asChild?: false } & React.ButtonHTMLAttributes<HTMLButtonElement>;

type ButtonAllProps = ButtonAsChildProps | ButtonElementProps;

const Button = React.forwardRef<HTMLButtonElement | HTMLElement, ButtonAllProps>(
  ({ 
    className, 
    variant = 'primary', 
    size = 'md', 
    fullWidth = false,
    loading = false,
    loadingText,
    leftIcon,
    rightIcon,
    asChild = false, 
    children, 
    disabled,
    ...props 
  }, ref) => {
    const isDisabled = disabled || loading;
    
    const baseClasses = cn(
      'inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-all duration-200',
      'focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-900',
      'disabled:cursor-not-allowed disabled:opacity-50',
      fullWidth && 'w-full'
    );
    
    const variants = {
      primary: cn(
        'bg-blue-600 text-white shadow-sm',
        'hover:bg-blue-700 hover:shadow-md',
        'active:bg-blue-800 active:shadow-sm',
        'focus:ring-blue-500',
        'disabled:hover:bg-blue-600 disabled:hover:shadow-sm'
      ),
      secondary: cn(
        'bg-gray-100 text-gray-900 shadow-sm dark:bg-gray-800 dark:text-gray-100',
        'hover:bg-gray-200 hover:shadow-md dark:hover:bg-gray-700',
        'active:bg-gray-300 active:shadow-sm dark:active:bg-gray-600',
        'focus:ring-gray-500',
        'disabled:hover:bg-gray-100 disabled:hover:shadow-sm dark:disabled:hover:bg-gray-800'
      ),
      destructive: cn(
        'bg-red-600 text-white shadow-sm',
        'hover:bg-red-700 hover:shadow-md',
        'active:bg-red-800 active:shadow-sm',
        'focus:ring-red-500',
        'disabled:hover:bg-red-600 disabled:hover:shadow-sm'
      ),
      outline: cn(
        'border-2 border-gray-300 bg-transparent text-gray-700 dark:border-gray-600 dark:text-gray-300',
        'hover:bg-gray-50 hover:border-gray-400 dark:hover:bg-gray-800 dark:hover:border-gray-500',
        'active:bg-gray-100 dark:active:bg-gray-700',
        'focus:ring-gray-500',
        'disabled:hover:bg-transparent disabled:hover:border-gray-300 dark:disabled:hover:border-gray-600'
      ),
      ghost: cn(
        'bg-transparent text-gray-700 dark:text-gray-300',
        'hover:bg-gray-100 dark:hover:bg-gray-800',
        'active:bg-gray-200 dark:active:bg-gray-700',
        'focus:ring-gray-500'
      ),
      link: cn(
        'bg-transparent text-blue-600 underline-offset-4 dark:text-blue-400',
        'hover:underline hover:text-blue-700 dark:hover:text-blue-300',
        'active:text-blue-800 dark:active:text-blue-200',
        'focus:ring-blue-500'
      ),
      success: cn(
        'bg-green-600 text-white shadow-sm',
        'hover:bg-green-700 hover:shadow-md',
        'active:bg-green-800 active:shadow-sm',
        'focus:ring-green-500',
        'disabled:hover:bg-green-600 disabled:hover:shadow-sm'
      ),
      warning: cn(
        'bg-yellow-500 text-white shadow-sm',
        'hover:bg-yellow-600 hover:shadow-md',
        'active:bg-yellow-700 active:shadow-sm',
        'focus:ring-yellow-500',
        'disabled:hover:bg-yellow-500 disabled:hover:shadow-sm'
      )
    };

    const sizes = {
      xs: 'h-7 px-2.5 text-xs',
      sm: 'h-9 px-3 text-sm',
      md: 'h-11 px-4 text-base',
      lg: 'h-12 px-6 text-lg',
      xl: 'h-14 px-8 text-xl'
    };

    const classes = cn(
      baseClasses, 
      variants[variant as keyof typeof variants], 
      sizes[size as keyof typeof sizes], 
      className
    );

    const content = (
      <>
        {loading && (
          <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path 
              className="opacity-75" 
              fill="currentColor" 
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" 
            />
          </svg>
        )}
        {!loading && leftIcon}
        <span>{loading && loadingText ? loadingText : children}</span>
        {!loading && rightIcon}
      </>
    );

    if (asChild) {
      // If asChild is true, clone the child and apply our classes
      return React.cloneElement(
        React.Children.only(children) as React.ReactElement,
        {
          className: cn(classes, (children as any)?.props?.className),
          ref,
          disabled: isDisabled,
          ...props
        }
      );
    }

    return (
      <button
        className={classes}
        ref={ref as React.Ref<HTMLButtonElement>}
        disabled={isDisabled}
        {...(props as React.ButtonHTMLAttributes<HTMLButtonElement>)}
      >
        {content}
      </button>
    );
  }
);

Button.displayName = 'Button';

export { Button };