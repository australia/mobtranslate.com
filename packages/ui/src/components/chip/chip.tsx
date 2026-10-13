'use client';
import * as React from 'react';
import { cn } from '../../utils/cn';
import { Toggle as BaseToggle } from '@base-ui-components/react/toggle';

export interface ChipProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'filled' | 'outlined' | 'soft';
  color?: 'default' | 'primary' | 'success' | 'warning' | 'error';
  size?: 'sm' | 'md' | 'lg';
  onDelete?: () => void;
  deleteLabel?: string;
}

export const Chip = React.forwardRef<HTMLDivElement, ChipProps>(
  ({ className, variant = 'filled', color = 'default', size = 'md', onDelete, deleteLabel = 'Remove chip', children, ...props }, ref) => (
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
          aria-label={deleteLabel}
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

type ChipAppearance = Pick<ChipProps, 'variant' | 'color' | 'size'>;
export interface ChipActionProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'color'>, ChipAppearance {}
export const ChipAction = React.forwardRef<HTMLButtonElement, ChipActionProps>(
  ({ className, variant = 'filled', color = 'default', size = 'md', type = 'button', ...props }, ref) => <button ref={ref} type={type} className={cn('mt-chip mt-chip-action', `mt-chip-${variant}`, `mt-chip-${color}`, `mt-chip-${size}`, className)} {...props} />
);
ChipAction.displayName = 'ChipAction';

export interface ChipToggleProps extends Omit<React.ComponentPropsWithoutRef<typeof BaseToggle>, 'color'>, ChipAppearance {}
export const ChipToggle = React.forwardRef<HTMLButtonElement, ChipToggleProps>(
  ({ className, variant = 'outlined', color = 'default', size = 'md', ...props }, ref) => <BaseToggle ref={ref} className={state => cn('mt-chip mt-chip-action', `mt-chip-${variant}`, `mt-chip-${color}`, `mt-chip-${size}`, typeof className === 'function' ? className(state) : className)} {...props} />
);
ChipToggle.displayName = 'ChipToggle';
