'use client';
import * as React from 'react';
import { Menu as BaseMenu } from '@base-ui-components/react/menu';
import { cn } from '../../utils/cn';

export const Menu = BaseMenu.Root;
export const MenuTrigger = BaseMenu.Trigger;
export const MenuPortal = BaseMenu.Portal;

export const MenuPositioner = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof BaseMenu.Positioner>>(
  ({ className, ...props }, ref) => (
    <BaseMenu.Positioner ref={ref} className={state => cn('mt-menu-positioner', typeof className === 'function' ? className(state) : className)} {...props} />
  )
);
MenuPositioner.displayName = 'MenuPositioner';

export const MenuPopup = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof BaseMenu.Popup>>(
  ({ className, ...props }, ref) => (
    <BaseMenu.Popup ref={ref} className={state => cn('mt-menu-popup', typeof className === 'function' ? className(state) : className)} {...props} />
  )
);
MenuPopup.displayName = 'MenuPopup';

export const MenuItem = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof BaseMenu.Item>>(
  ({ className, ...props }, ref) => (
    <BaseMenu.Item ref={ref} className={state => cn('mt-menu-item', typeof className === 'function' ? className(state) : className)} {...props} />
  )
);
MenuItem.displayName = 'MenuItem';

export const MenuGroup = BaseMenu.Group;

export const MenuGroupLabel = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof BaseMenu.GroupLabel>>(
  ({ className, ...props }, ref) => (
    <BaseMenu.GroupLabel ref={ref} className={state => cn('mt-menu-group-label', typeof className === 'function' ? className(state) : className)} {...props} />
  )
);
MenuGroupLabel.displayName = 'MenuGroupLabel';

export const MenuSeparator = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof BaseMenu.Separator>>(
  ({ className, ...props }, ref) => (
    <BaseMenu.Separator ref={ref} className={state => cn('mt-menu-separator', typeof className === 'function' ? className(state) : className)} {...props} />
  )
);
MenuSeparator.displayName = 'MenuSeparator';

export const MenuArrow = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof BaseMenu.Arrow>>(
  ({ className, ...props }, ref) => (
    <BaseMenu.Arrow ref={ref} className={state => cn('mt-menu-arrow', typeof className === 'function' ? className(state) : className)} {...props} />
  )
);
MenuArrow.displayName = 'MenuArrow';

export const MenuSubmenuRoot = BaseMenu.SubmenuRoot;
export const MenuBackdrop = BaseMenu.Backdrop;
export const MenuRadioGroup = BaseMenu.RadioGroup;

export const MenuSubmenuTrigger = React.forwardRef<HTMLElement, React.ComponentPropsWithoutRef<typeof BaseMenu.SubmenuTrigger>>(
  ({ className, ...props }, ref) => <BaseMenu.SubmenuTrigger ref={ref} className={state => cn('mt-menu-item mt-menu-submenu-trigger', typeof className === 'function' ? className(state) : className)} {...props} />
);
MenuSubmenuTrigger.displayName = 'MenuSubmenuTrigger';

export const MenuCheckboxItem = React.forwardRef<HTMLElement, React.ComponentPropsWithoutRef<typeof BaseMenu.CheckboxItem>>(
  ({ className, ...props }, ref) => <BaseMenu.CheckboxItem ref={ref} className={state => cn('mt-menu-item mt-menu-choice-item', typeof className === 'function' ? className(state) : className)} {...props} />
);
MenuCheckboxItem.displayName = 'MenuCheckboxItem';
export const MenuRadioItem = React.forwardRef<HTMLElement, React.ComponentPropsWithoutRef<typeof BaseMenu.RadioItem>>(
  ({ className, ...props }, ref) => <BaseMenu.RadioItem ref={ref} className={state => cn('mt-menu-item mt-menu-choice-item', typeof className === 'function' ? className(state) : className)} {...props} />
);
MenuRadioItem.displayName = 'MenuRadioItem';

export const MenuCheckboxItemIndicator = React.forwardRef<HTMLSpanElement, React.ComponentPropsWithoutRef<typeof BaseMenu.CheckboxItemIndicator>>(
  ({ className, ...props }, ref) => <BaseMenu.CheckboxItemIndicator ref={ref} className={state => cn('mt-menu-choice-indicator', typeof className === 'function' ? className(state) : className)} {...props} />
);
MenuCheckboxItemIndicator.displayName = 'MenuCheckboxItemIndicator';
export const MenuRadioItemIndicator = React.forwardRef<HTMLSpanElement, React.ComponentPropsWithoutRef<typeof BaseMenu.RadioItemIndicator>>(
  ({ className, ...props }, ref) => <BaseMenu.RadioItemIndicator ref={ref} className={state => cn('mt-menu-choice-indicator', typeof className === 'function' ? className(state) : className)} {...props} />
);
MenuRadioItemIndicator.displayName = 'MenuRadioItemIndicator';
