'use client';
import * as React from 'react';
import { cn } from '../../utils/cn';

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'info' | 'success' | 'warning' | 'error' | 'destructive';
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  dismissible?: boolean;
  onDismiss?: () => void;
  action?: React.ReactNode;
}

export const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  ({ className, variant = 'default', title, description, icon, dismissible, onDismiss, action, children, ...props }, ref) => (
    <div
      ref={ref}
      role="alert"
      className={cn('mt-alert', `mt-alert-${variant}`, className)}
      {...props}
    >
      {(icon || title || description) ? (
        <div className="flex gap-3">
          {icon && <div className="mt-alert-icon flex-shrink-0">{icon}</div>}
          <div className="flex-1 min-w-0">
            {title && <h5 className="mt-alert-title">{title}</h5>}
            {description && <p className="mt-alert-description">{description}</p>}
          </div>
          <div className="flex items-start gap-2 flex-shrink-0">
            {action}
            {dismissible && onDismiss && (
              <button onClick={onDismiss} className="mt-alert-dismiss">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M11 3L3 11M3 3L11 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </div>
        </div>
      ) : children}
    </div>
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
