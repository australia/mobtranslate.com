'use client';
import * as React from 'react';
import { useRender } from '@base-ui-components/react/use-render';
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

export const Button = React.forwardRef<HTMLElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, loadingText, fullWidth, leftIcon, disabled, asChild, children, ...props }, ref) => {
    const classes = cn('mt-btn', `mt-btn-${variant}`, `mt-btn-${size}`, loading && 'mt-btn-loading', fullWidth && 'w-full', className);

    const child = asChild && React.isValidElement<React.HTMLAttributes<HTMLElement> & { disabled?: boolean } & Record<string, unknown>>(children) && children.type !== React.Fragment ? children : undefined;
    const blocked = Boolean(disabled || loading || child?.props.disabled);
    const content = <>
        {loading && (
          <svg className="mt-btn-spinner" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        )}
        {!loading && leftIcon}
        {loading && loadingText ? loadingText : child ? child.props.children : children}
    </>;
    const render = child && React.cloneElement(child, {
      children: content,
      disabled: blocked || undefined,
      'aria-disabled': blocked || child.props['aria-disabled'],
      'aria-busy': loading || child.props['aria-busy'],
      onClickCapture: event => {
        if (blocked) { event.preventDefault(); event.stopPropagation(); return; }
        child.props.onClickCapture?.(event);
      },
      onKeyDownCapture: event => {
        if (blocked && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); event.stopPropagation(); return; }
        child.props.onKeyDownCapture?.(event);
      },
    });
    const element = useRender({
      defaultTagName: 'button', render, ref, state: { disabled: blocked, loading: Boolean(loading) },
      props: {
        ...props, type: props.type, disabled: blocked || undefined, 'aria-busy': loading || props['aria-busy'], className: classes, children: content,
        onClickCapture: (event: React.MouseEvent<HTMLButtonElement>) => {
          if (blocked) { event.preventDefault(); event.stopPropagation(); return; }
          props.onClickCapture?.(event);
        },
        onKeyDownCapture: (event: React.KeyboardEvent<HTMLButtonElement>) => {
          if (blocked && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); event.stopPropagation(); return; }
          props.onKeyDownCapture?.(event);
        },
      },
    });
    if (asChild && !child) throw new Error('Button asChild requires one React element that forwards its DOM props and ref.');
    return element;
  }
);
Button.displayName = 'Button';

export interface IconButtonProps extends Omit<ButtonProps, 'size' | 'asChild' | 'fullWidth'> {
  'aria-label': string;
}
export const IconButton = React.forwardRef<HTMLElement, IconButtonProps>(
  ({ variant = 'ghost', type = 'button', ...props }, ref) => <Button ref={ref} variant={variant} type={type} size="icon" {...props} />
);
IconButton.displayName = 'IconButton';

export type FloatingActionButtonProps = Omit<ButtonProps, 'size' | 'asChild' | 'fullWidth'> & {
  size?: 'sm' | 'md' | 'lg';
} & ({ extended: true } | { extended?: false; 'aria-label': string });
export const FloatingActionButton = React.forwardRef<HTMLElement, FloatingActionButtonProps>(
  ({ size = 'md', extended = false, className, type = 'button', ...props }, ref) => <Button ref={ref} type={type} className={cn('mt-fab', `mt-fab-${size}`, extended && 'mt-fab-extended', className)} {...props} />
);
FloatingActionButton.displayName = 'FloatingActionButton';
