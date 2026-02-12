'use client';
import * as React from 'react';
import { Toast as BaseToast } from '@base-ui-components/react/toast';
import { cn } from '../../utils/cn';

export const ToastProvider = BaseToast.Provider;
export const ToastViewport = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof BaseToast.Viewport>>(
  ({ className, ...props }, ref) => (
    <BaseToast.Viewport ref={ref} className={cn('mt-toast-viewport', className)} {...props} />
  )
);
ToastViewport.displayName = 'ToastViewport';

export const Toast = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof BaseToast.Root> & { variant?: 'default' | 'success' | 'error' | 'warning' }>(
  ({ className, variant = 'default', ...props }, ref) => (
    <BaseToast.Root ref={ref} className={cn('mt-toast', `mt-toast-${variant}`, className)} {...props} />
  )
);
Toast.displayName = 'Toast';

export const ToastTitle = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof BaseToast.Title>>(
  ({ className, ...props }, ref) => (
    <BaseToast.Title ref={ref} className={cn('mt-toast-title', className)} {...props} />
  )
);
ToastTitle.displayName = 'ToastTitle';

export const ToastDescription = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof BaseToast.Description>>(
  ({ className, ...props }, ref) => (
    <BaseToast.Description ref={ref} className={cn('mt-toast-description', className)} {...props} />
  )
);
ToastDescription.displayName = 'ToastDescription';

export const ToastClose = React.forwardRef<HTMLButtonElement, React.ComponentPropsWithoutRef<typeof BaseToast.Close>>(
  ({ className, ...props }, ref) => (
    <BaseToast.Close ref={ref} className={cn('mt-toast-close', className)} {...props}>
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M11 3L3 11M3 3L11 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
    </BaseToast.Close>
  )
);
ToastClose.displayName = 'ToastClose';
