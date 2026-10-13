'use client';
import * as React from 'react';
import { NavigationMenu as BaseNavigationMenu } from '@base-ui-components/react/navigation-menu';
import { cn } from '../../utils/cn';

export const NavigationMenu = React.forwardRef<
  HTMLElement,
  React.ComponentPropsWithoutRef<typeof BaseNavigationMenu.Root>
>(({ className, orientation = 'horizontal', ...props }, ref) => (
  <BaseNavigationMenu.Root
    ref={ref}
    orientation={orientation}
    data-orientation={orientation}
    className={state => cn('mt-navigation-menu', typeof className === 'function' ? className(state) : className)}
    {...props}
  />
));
NavigationMenu.displayName = 'NavigationMenu';

export const NavigationMenuList = React.forwardRef<
  HTMLUListElement,
  React.ComponentPropsWithoutRef<typeof BaseNavigationMenu.List>
>(({ className, ...props }, ref) => (
  <BaseNavigationMenu.List
    ref={ref as React.Ref<HTMLDivElement>}
    className={state => cn('mt-navigation-menu-list', typeof className === 'function' ? className(state) : className)}
    {...props}
  />
));
NavigationMenuList.displayName = 'NavigationMenuList';

// The pinned primitive annotates ul/li/span refs as div; expose their actual DOM types.
export const NavigationMenuItem = React.forwardRef<HTMLLIElement, React.ComponentPropsWithoutRef<typeof BaseNavigationMenu.Item>>(
  ({ className, ...props }, ref) => <BaseNavigationMenu.Item ref={ref as React.Ref<HTMLDivElement>} className={state => cn('mt-navigation-menu-item', typeof className === 'function' ? className(state) : className)} {...props} />
);
NavigationMenuItem.displayName = 'NavigationMenuItem';

export const NavigationMenuTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<typeof BaseNavigationMenu.Trigger>
>(({ className, ...props }, ref) => (
  <BaseNavigationMenu.Trigger
    ref={ref}
    className={state => cn('mt-navigation-menu-trigger', typeof className === 'function' ? className(state) : className)}
    {...props}
  />
));
NavigationMenuTrigger.displayName = 'NavigationMenuTrigger';

export const NavigationMenuContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseNavigationMenu.Content>
>(({ className, ...props }, ref) => (
  <BaseNavigationMenu.Content
    ref={ref}
    className={state => cn('mt-navigation-menu-content', typeof className === 'function' ? className(state) : className)}
    {...props}
  />
));
NavigationMenuContent.displayName = 'NavigationMenuContent';

export const NavigationMenuLink = React.forwardRef<
  HTMLAnchorElement,
  React.ComponentPropsWithoutRef<typeof BaseNavigationMenu.Link>
>(({ className, ...props }, ref) => (
  <BaseNavigationMenu.Link
    ref={ref}
    className={state => cn('mt-navigation-menu-link', typeof className === 'function' ? className(state) : className)}
    {...props}
  />
));
NavigationMenuLink.displayName = 'NavigationMenuLink';

export const NavigationMenuPortal = BaseNavigationMenu.Portal;

export const NavigationMenuViewport = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseNavigationMenu.Viewport>
>(({ className, ...props }, ref) => (
  <BaseNavigationMenu.Viewport
    ref={ref}
    className={state => cn('mt-navigation-menu-viewport', typeof className === 'function' ? className(state) : className)}
    {...props}
  />
));
NavigationMenuViewport.displayName = 'NavigationMenuViewport';

export const NavigationMenuPositioner = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof BaseNavigationMenu.Positioner>>(
  ({ className, ...props }, ref) => <BaseNavigationMenu.Positioner ref={ref} className={state => cn('mt-navigation-menu-positioner', typeof className === 'function' ? className(state) : className)} {...props} />
);
NavigationMenuPositioner.displayName = 'NavigationMenuPositioner';
export const NavigationMenuPopup = React.forwardRef<HTMLElement, React.ComponentPropsWithoutRef<typeof BaseNavigationMenu.Popup>>(
  ({ className, ...props }, ref) => <BaseNavigationMenu.Popup ref={ref} className={state => cn('mt-navigation-menu-popup', typeof className === 'function' ? className(state) : className)} {...props} />
);
NavigationMenuPopup.displayName = 'NavigationMenuPopup';
export const NavigationMenuBackdrop = BaseNavigationMenu.Backdrop;
export const NavigationMenuArrow = BaseNavigationMenu.Arrow;
export const NavigationMenuIcon = React.forwardRef<HTMLSpanElement, React.ComponentPropsWithoutRef<typeof BaseNavigationMenu.Icon>>(
  ({ className, ...props }, ref) => <BaseNavigationMenu.Icon ref={ref as React.Ref<HTMLDivElement>} className={state => cn('mt-navigation-menu-icon', typeof className === 'function' ? className(state) : className)} {...props} />
);
NavigationMenuIcon.displayName = 'NavigationMenuIcon';
