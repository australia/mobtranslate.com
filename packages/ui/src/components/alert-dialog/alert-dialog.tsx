'use client';
import * as React from 'react';
import { AlertDialog as BaseAlertDialog } from '@base-ui-components/react/alert-dialog';
import { cn } from '../../utils/cn';

export const AlertDialog = BaseAlertDialog.Root;
export const AlertDialogTrigger = BaseAlertDialog.Trigger;
export const AlertDialogClose = BaseAlertDialog.Close;
export const AlertDialogPortal = BaseAlertDialog.Portal;

export const AlertDialogBackdrop = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof BaseAlertDialog.Backdrop>>(
  ({ className, ...props }, ref) => (
    <BaseAlertDialog.Backdrop ref={ref} className={cn('mt-alert-dialog-backdrop', className)} {...props} />
  )
);
AlertDialogBackdrop.displayName = 'AlertDialogBackdrop';

export interface AlertDialogPopupProps extends React.ComponentPropsWithoutRef<typeof BaseAlertDialog.Popup> {
  size?: 'sm' | 'md' | 'lg';
}

export const AlertDialogPopup = React.forwardRef<HTMLDivElement, AlertDialogPopupProps>(
  ({ className, size = 'md', ...props }, ref) => (
    <BaseAlertDialog.Popup ref={ref} className={cn('mt-alert-dialog-popup', `mt-alert-dialog-${size}`, className)} {...props} />
  )
);
AlertDialogPopup.displayName = 'AlertDialogPopup';

export const AlertDialogTitle = React.forwardRef<HTMLHeadingElement, React.ComponentPropsWithoutRef<typeof BaseAlertDialog.Title>>(
  ({ className, ...props }, ref) => (
    <BaseAlertDialog.Title ref={ref} className={cn('mt-alert-dialog-title', className)} {...props} />
  )
);
AlertDialogTitle.displayName = 'AlertDialogTitle';

export const AlertDialogDescription = React.forwardRef<HTMLParagraphElement, React.ComponentPropsWithoutRef<typeof BaseAlertDialog.Description>>(
  ({ className, ...props }, ref) => (
    <BaseAlertDialog.Description ref={ref} className={cn('mt-alert-dialog-description', className)} {...props} />
  )
);
AlertDialogDescription.displayName = 'AlertDialogDescription';
