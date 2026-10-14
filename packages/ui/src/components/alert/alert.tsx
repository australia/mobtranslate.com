'use client';
import * as React from 'react';
import { cn } from '../../utils/cn';

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'info' | 'success' | 'warning' | 'error' | 'destructive';
  title?: string;
  headingLevel?: 1 | 2 | 3 | 4 | 5 | 6;
  description?: string;
  icon?: React.ReactNode;
  dismissible?: boolean;
  dismissLabel?: string;
  onDismiss?: () => void;
  action?: React.ReactNode;
}

export const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  ({ className, variant = 'default', title, headingLevel, description, icon, dismissible, dismissLabel = 'Dismiss alert', onDismiss, action, children, ...props }, ref) => (
    <div
      ref={ref}
      role="alert"
      className={cn('mt-alert', `mt-alert-${variant}`, className)}
      {...props}
    >
        <div className="mt-alert-layout">
          {icon && <div className="mt-alert-icon flex-shrink-0">{icon}</div>}
          <div className="flex-1 min-w-0">
            {title && <AlertTitle headingLevel={headingLevel}>{title}</AlertTitle>}
            {description && <p className="mt-alert-description">{description}</p>}
            {children}
          </div>
          <div className="mt-alert-actions">
            {action}
            {dismissible && onDismiss && (
              <button type="button" aria-label={dismissLabel} onClick={onDismiss} className="mt-alert-dismiss">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" focusable="false">
                  <path d="M11 3L3 11M3 3L11 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </div>
        </div>
    </div>
  )
);
Alert.displayName = 'Alert';

export interface AlertTitleProps extends React.HTMLAttributes<HTMLElement> {
  headingLevel?: 1 | 2 | 3 | 4 | 5 | 6;
}
export const AlertTitle = React.forwardRef<HTMLElement, AlertTitleProps>(
  ({ className, headingLevel, ...props }, ref) => {
    const Tag = headingLevel ? `h${headingLevel}` as const : 'p';
    return <Tag ref={ref as React.Ref<HTMLHeadingElement>} className={cn('mt-alert-title', className)} {...props} />;
  }
);
AlertTitle.displayName = 'AlertTitle';

export const AlertDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn('mt-alert-description', className)} {...props} />
  )
);
AlertDescription.displayName = 'AlertDescription';
