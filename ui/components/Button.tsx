'use client';

import React from 'react';
import { cn } from '../lib/utils';

export interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'outline';
  size?: 'sm' | 'md' | 'lg';
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
  ({ className, variant = 'primary', size = 'md', asChild = false, children, ...props }, ref) => {
    const baseClasses = 'inline-flex items-center justify-center font-medium rounded-md transition-all focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed';
    
    const variants: Record<'primary' | 'secondary' | 'outline', string> = {
      primary: 'bg-primary text-primary-foreground hover:bg-primary/90 active:translate-y-0.5 shadow-sm',
      secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/90 active:translate-y-0.5 shadow-sm',
      outline: 'border border-primary text-primary hover:bg-primary hover:text-primary-foreground'
    };

    const sizes: Record<'sm' | 'md' | 'lg', string> = {
      sm: 'px-3 py-1.5 text-sm',
      md: 'px-4 py-2',
      lg: 'px-6 py-3 text-lg'
    };

    const classes = cn(baseClasses, variants[variant as keyof typeof variants], sizes[size as keyof typeof sizes], className);

    if (asChild) {
      // If asChild is true, clone the child and apply our classes
      return React.cloneElement(
        React.Children.only(children) as React.ReactElement,
        {
          className: cn(classes, (children as any)?.props?.className),
          ref,
          ...props
        }
      );
    }

    return (
      <button
        className={classes}
        ref={ref as React.Ref<HTMLButtonElement>}
        {...(props as React.ButtonHTMLAttributes<HTMLButtonElement>)}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';

export { Button };