'use client';
import * as React from 'react';
import { Toast as BaseToast } from '@base-ui-components/react/toast';
import { cn } from '../../utils/cn';

export const ToastProvider = BaseToast.Provider;
export const useToastManager = BaseToast.useToastManager;
export const createToastManager = BaseToast.createToastManager;
export const ToastPortal = BaseToast.Portal;
export const ToastContent = BaseToast.Content;
export const ToastAction = React.forwardRef<HTMLButtonElement, React.ComponentPropsWithoutRef<typeof BaseToast.Action>>(
  ({ className, ...props }, ref) => <BaseToast.Action ref={ref} className={state => cn('mt-btn mt-btn-secondary mt-btn-md', typeof className === 'function' ? className(state) : className)} {...props} />
);
ToastAction.displayName = 'ToastAction';
export const ToastViewport = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof BaseToast.Viewport>>(
  ({ className, ...props }, ref) => (
    <BaseToast.Viewport ref={ref} className={state => cn('mt-toast-viewport', typeof className === 'function' ? className(state) : className)} {...props} />
  )
);
ToastViewport.displayName = 'ToastViewport';

export const Toast = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof BaseToast.Root> & { variant?: 'default' | 'success' | 'error' | 'warning' }>(
  ({ className, variant = 'default', ...props }, ref) => (
    <BaseToast.Root ref={ref} className={state => cn('mt-toast', `mt-toast-${variant}`, typeof className === 'function' ? className(state) : className)} {...props} />
  )
);
Toast.displayName = 'Toast';

export const ToastTitle = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof BaseToast.Title>>(
  ({ className, ...props }, ref) => (
    <BaseToast.Title ref={ref} className={state => cn('mt-toast-title', typeof className === 'function' ? className(state) : className)} {...props} />
  )
);
ToastTitle.displayName = 'ToastTitle';

export const ToastDescription = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof BaseToast.Description>>(
  ({ className, ...props }, ref) => (
    <BaseToast.Description ref={ref} className={state => cn('mt-toast-description', typeof className === 'function' ? className(state) : className)} {...props} />
  )
);
ToastDescription.displayName = 'ToastDescription';

export const ToastClose = React.forwardRef<HTMLButtonElement, React.ComponentPropsWithoutRef<typeof BaseToast.Close>>(
  ({ className, children, ...props }, ref) => (
    <BaseToast.Close ref={ref} aria-label="Dismiss notification" className={state => cn('mt-toast-close', typeof className === 'function' ? className(state) : className)} {...props}>
      {children ?? <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" focusable="false"><path d="M11 3L3 11M3 3L11 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>}
    </BaseToast.Close>
  )
);
ToastClose.displayName = 'ToastClose';
