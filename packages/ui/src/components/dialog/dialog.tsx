'use client';
import * as React from 'react';
import { Dialog as BaseDialog } from '@base-ui-components/react/dialog';
import { cn } from '../../utils/cn';

export const Dialog = BaseDialog.Root;
export const DialogTrigger = BaseDialog.Trigger;
export const DialogClose = BaseDialog.Close;
export const DialogPortal = BaseDialog.Portal;

export const DialogBackdrop = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof BaseDialog.Backdrop>>(
  ({ className, ...props }, ref) => (
    <BaseDialog.Backdrop ref={ref} className={cn('mt-dialog-backdrop', className)} {...props} />
  )
);
DialogBackdrop.displayName = 'DialogBackdrop';

export const DialogPopup = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof BaseDialog.Popup> & { size?: 'sm' | 'md' | 'lg' | 'xl' }>(
  ({ className, size = 'md', ...props }, ref) => (
    <BaseDialog.Popup ref={ref} className={cn('mt-dialog-popup', `mt-dialog-${size}`, className)} {...props} />
  )
);
DialogPopup.displayName = 'DialogPopup';

export const DialogTitle = React.forwardRef<HTMLHeadingElement, React.ComponentPropsWithoutRef<typeof BaseDialog.Title>>(
  ({ className, ...props }, ref) => (
    <BaseDialog.Title ref={ref} className={cn('mt-dialog-title', className)} {...props} />
  )
);
DialogTitle.displayName = 'DialogTitle';

export const DialogDescription = React.forwardRef<HTMLParagraphElement, React.ComponentPropsWithoutRef<typeof BaseDialog.Description>>(
  ({ className, ...props }, ref) => (
    <BaseDialog.Description ref={ref} className={cn('mt-dialog-description', className)} {...props} />
  )
);
DialogDescription.displayName = 'DialogDescription';
