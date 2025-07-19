'use client';

import React from 'react';
import { cn } from '../lib/utils';

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode;
  title?: string;
  description?: string;
  action?: React.ReactNode;
}

const EmptyState = React.forwardRef<HTMLDivElement, EmptyStateProps>(
  ({ className, icon, title, description, action, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn('text-center py-8 text-muted-foreground', className)}
        {...props}
      >
        {icon && (
          <div className="text-4xl mb-2">
            {icon}
          </div>
        )}
        {title && (
          <h3 className="text-lg font-medium text-foreground mb-2">
            {title}
          </h3>
        )}
        {description && (
          <p className="text-sm mb-4">
            {description}
          </p>
        )}
        {action && (
          <div>
            {action}
          </div>
        )}
      </div>
    );
  }
);

EmptyState.displayName = 'EmptyState';

export { EmptyState };