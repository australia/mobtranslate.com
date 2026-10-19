'use client';
import * as React from 'react';
import { Dialog as BaseDialog } from '@base-ui-components/react/dialog';
import { cn } from '../../utils/cn';
import { DialogModalityContext } from './dialog-modality';

export function Dialog<Payload>(props: BaseDialog.Root.Props<Payload>) {
  return <DialogModalityContext.Provider value={props.modal === undefined || props.modal === true}><BaseDialog.Root {...props} /></DialogModalityContext.Provider>;
}
export const DialogTrigger = BaseDialog.Trigger;
export const DialogClose = BaseDialog.Close;
export const DialogPortal = BaseDialog.Portal;

export const DialogBackdrop = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof BaseDialog.Backdrop>>(
  ({ className, ...props }, ref) => (
    <BaseDialog.Backdrop ref={ref} className={state => cn('mt-dialog-backdrop', typeof className === 'function' ? className(state) : className)} {...props} />
  )
);
DialogBackdrop.displayName = 'DialogBackdrop';

export const DialogPopup = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof BaseDialog.Popup> & { size?: 'sm' | 'md' | 'lg' | 'xl' }>(
  ({ className, size = 'md', ...props }, ref) => {
    const modal = React.useContext(DialogModalityContext);
    return <BaseDialog.Popup ref={ref} aria-modal={modal || undefined} className={state => cn('mt-dialog-popup', `mt-dialog-${size}`, typeof className === 'function' ? className(state) : className)} {...props} />;
  }
);
DialogPopup.displayName = 'DialogPopup';

export const DialogTitle = React.forwardRef<HTMLHeadingElement, React.ComponentPropsWithoutRef<typeof BaseDialog.Title>>(
  ({ className, ...props }, ref) => (
    <BaseDialog.Title ref={ref} className={state => cn('mt-dialog-title', typeof className === 'function' ? className(state) : className)} {...props} />
  )
);
DialogTitle.displayName = 'DialogTitle';

export const DialogDescription = React.forwardRef<HTMLParagraphElement, React.ComponentPropsWithoutRef<typeof BaseDialog.Description>>(
  ({ className, ...props }, ref) => (
    <BaseDialog.Description ref={ref} className={state => cn('mt-dialog-description', typeof className === 'function' ? className(state) : className)} {...props} />
  )
);
DialogDescription.displayName = 'DialogDescription';
