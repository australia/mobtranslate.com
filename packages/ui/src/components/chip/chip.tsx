'use client';
import * as React from 'react';
import { cn } from '../../utils/cn';

export interface ChipProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'filled' | 'outlined' | 'soft';
  color?: 'default' | 'primary' | 'success' | 'warning' | 'error';
  size?: 'sm' | 'md' | 'lg';
  onDelete?: () => void;
}

export const Chip = React.forwardRef<HTMLDivElement, ChipProps>(
  ({ className, variant = 'filled', color = 'default', size = 'md', onDelete, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('mt-chip', `mt-chip-${variant}`, `mt-chip-${color}`, `mt-chip-${size}`, className)}
      {...props}
    >
      <span className="mt-chip-label">{children}</span>
      {onDelete && (
        <button
          type="button"
          className="mt-chip-delete"
          onClick={onDelete}
          aria-label="Remove"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M4 4l6 6M10 4l-6 6" />
          </svg>
        </button>
      )}
    </div>
  )
);
Chip.displayName = 'Chip';
