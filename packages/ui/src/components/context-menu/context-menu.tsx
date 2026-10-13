'use client';
import * as React from 'react';
import { ContextMenu as BaseMenu } from '@base-ui-components/react/context-menu';
import { cn } from '../../utils/cn';

// Use the installed context-menu primitive for its virtual pointer anchor and touch behavior.
export const ContextMenu = BaseMenu.Root;
export const ContextMenuTrigger = BaseMenu.Trigger;
export const ContextMenuPortal = BaseMenu.Portal;

export const ContextMenuPositioner = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof BaseMenu.Positioner>>(
  ({ className, ...props }, ref) => (
    <BaseMenu.Positioner ref={ref} className={state => cn('mt-context-menu-positioner', typeof className === 'function' ? className(state) : className)} {...props} />
  )
);
ContextMenuPositioner.displayName = 'ContextMenuPositioner';

export const ContextMenuPopup = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof BaseMenu.Popup>>(
  ({ className, ...props }, ref) => (
    <BaseMenu.Popup ref={ref} className={state => cn('mt-context-menu-popup', typeof className === 'function' ? className(state) : className)} {...props} />
  )
);
ContextMenuPopup.displayName = 'ContextMenuPopup';

export const ContextMenuItem = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof BaseMenu.Item>>(
  ({ className, ...props }, ref) => (
    <BaseMenu.Item ref={ref} className={state => cn('mt-context-menu-item', typeof className === 'function' ? className(state) : className)} {...props} />
  )
);
ContextMenuItem.displayName = 'ContextMenuItem';

export const ContextMenuSeparator = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof BaseMenu.Separator>>(
  ({ className, ...props }, ref) => (
    <BaseMenu.Separator ref={ref} className={state => cn('mt-context-menu-separator', typeof className === 'function' ? className(state) : className)} {...props} />
  )
);
ContextMenuSeparator.displayName = 'ContextMenuSeparator';
