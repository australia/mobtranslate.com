'use client';
import * as React from 'react';
import { Menu as BaseMenu } from '@base-ui-components/react/menu';
import { cn } from '../../utils/cn';

export const Menu = BaseMenu.Root;
export const MenuTrigger = BaseMenu.Trigger;
export const MenuPortal = BaseMenu.Portal;

export const MenuPositioner = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof BaseMenu.Positioner>>(
  ({ className, ...props }, ref) => (
    <BaseMenu.Positioner ref={ref} className={cn('mt-menu-positioner', className)} {...props} />
  )
);
MenuPositioner.displayName = 'MenuPositioner';

export const MenuPopup = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof BaseMenu.Popup>>(
  ({ className, ...props }, ref) => (
    <BaseMenu.Popup ref={ref} className={cn('mt-menu-popup', className)} {...props} />
  )
);
MenuPopup.displayName = 'MenuPopup';

export const MenuItem = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof BaseMenu.Item>>(
  ({ className, ...props }, ref) => (
    <BaseMenu.Item ref={ref} className={cn('mt-menu-item', className)} {...props} />
  )
);
MenuItem.displayName = 'MenuItem';

export const MenuGroup = BaseMenu.Group;

export const MenuGroupLabel = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof BaseMenu.GroupLabel>>(
  ({ className, ...props }, ref) => (
    <BaseMenu.GroupLabel ref={ref} className={cn('mt-menu-group-label', className)} {...props} />
  )
);
MenuGroupLabel.displayName = 'MenuGroupLabel';

export const MenuSeparator = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof BaseMenu.Separator>>(
  ({ className, ...props }, ref) => (
    <BaseMenu.Separator ref={ref} className={cn('mt-menu-separator', className)} {...props} />
  )
);
MenuSeparator.displayName = 'MenuSeparator';

export const MenuArrow = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof BaseMenu.Arrow>>(
  ({ className, ...props }, ref) => (
    <BaseMenu.Arrow ref={ref} className={cn('mt-menu-arrow', className)} {...props} />
  )
);
MenuArrow.displayName = 'MenuArrow';

export const MenuSubmenuTrigger = BaseMenu.SubmenuTrigger;
