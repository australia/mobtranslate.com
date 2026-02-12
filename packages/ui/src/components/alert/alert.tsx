'use client';
import * as React from 'react';
import { cn } from '../../utils/cn';

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'info' | 'success' | 'warning' | 'error';
}

export const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  ({ className, variant = 'default', ...props }, ref) => (
    <div
      ref={ref}
      role="alert"
      className={cn('mt-alert', `mt-alert-${variant}`, className)}
      {...props}
    />
  )
);
Alert.displayName = 'Alert';

export const AlertTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h5 ref={ref} className={cn('mt-alert-title', className)} {...props} />
  )
);
AlertTitle.displayName = 'AlertTitle';

export const AlertDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn('mt-alert-description', className)} {...props} />
  )
);
AlertDescription.displayName = 'AlertDescription';
