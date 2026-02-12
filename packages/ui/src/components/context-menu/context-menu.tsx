'use client';
import * as React from 'react';
import { Menu as BaseMenu } from '@base-ui-components/react/menu';
import { cn } from '../../utils/cn';

// Context menu is built on top of Menu with a right-click trigger
export const ContextMenu = BaseMenu.Root;
export const ContextMenuTrigger = BaseMenu.Trigger;
export const ContextMenuPortal = BaseMenu.Portal;

export const ContextMenuPositioner = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof BaseMenu.Positioner>>(
  ({ className, ...props }, ref) => (
    <BaseMenu.Positioner ref={ref} className={cn('mt-context-menu-positioner', className)} {...props} />
  )
);
ContextMenuPositioner.displayName = 'ContextMenuPositioner';

export const ContextMenuPopup = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof BaseMenu.Popup>>(
  ({ className, ...props }, ref) => (
    <BaseMenu.Popup ref={ref} className={cn('mt-context-menu-popup', className)} {...props} />
  )
);
ContextMenuPopup.displayName = 'ContextMenuPopup';

export const ContextMenuItem = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof BaseMenu.Item>>(
  ({ className, ...props }, ref) => (
    <BaseMenu.Item ref={ref} className={cn('mt-context-menu-item', className)} {...props} />
  )
);
ContextMenuItem.displayName = 'ContextMenuItem';

export const ContextMenuSeparator = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof BaseMenu.Separator>>(
  ({ className, ...props }, ref) => (
    <BaseMenu.Separator ref={ref} className={cn('mt-context-menu-separator', className)} {...props} />
  )
);
ContextMenuSeparator.displayName = 'ContextMenuSeparator';
