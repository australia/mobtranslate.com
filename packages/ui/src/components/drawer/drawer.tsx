'use client';
import * as React from 'react';
import { Dialog as BaseDialog } from '@base-ui-components/react/dialog';
import { cn } from '../../utils/cn';
import { Dialog } from '../dialog/dialog';
import { DialogModalityContext } from '../dialog/dialog-modality';

export type DrawerSide = 'left' | 'right' | 'top' | 'bottom';

export const Drawer = Dialog;
export const DrawerTrigger = BaseDialog.Trigger;
export const DrawerClose = BaseDialog.Close;
export const DrawerPortal = BaseDialog.Portal;

export const DrawerBackdrop = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof BaseDialog.Backdrop>>(
  ({ className, ...props }, ref) => (
    <BaseDialog.Backdrop ref={ref} className={state => cn('mt-drawer-backdrop', typeof className === 'function' ? className(state) : className)} {...props} />
  )
);
DrawerBackdrop.displayName = 'DrawerBackdrop';

export interface DrawerPopupProps extends React.ComponentPropsWithoutRef<typeof BaseDialog.Popup> {
  side?: DrawerSide;
}

export const DrawerPopup = React.forwardRef<HTMLDivElement, DrawerPopupProps>(
  ({ className, side = 'right', ...props }, ref) => {
    const modal = React.useContext(DialogModalityContext);
    return <BaseDialog.Popup ref={ref} aria-modal={modal || undefined} className={state => cn('mt-drawer-popup', `mt-drawer-${side}`, typeof className === 'function' ? className(state) : className)} {...props} />;
  }
);
DrawerPopup.displayName = 'DrawerPopup';

export const DrawerTitle = React.forwardRef<HTMLHeadingElement, React.ComponentPropsWithoutRef<typeof BaseDialog.Title>>(
  ({ className, ...props }, ref) => (
    <BaseDialog.Title ref={ref} className={state => cn('mt-drawer-title', typeof className === 'function' ? className(state) : className)} {...props} />
  )
);
DrawerTitle.displayName = 'DrawerTitle';

export const DrawerDescription = React.forwardRef<HTMLParagraphElement, React.ComponentPropsWithoutRef<typeof BaseDialog.Description>>(
  ({ className, ...props }, ref) => (
    <BaseDialog.Description ref={ref} className={state => cn('mt-drawer-description', typeof className === 'function' ? className(state) : className)} {...props} />
  )
);
DrawerDescription.displayName = 'DrawerDescription';
