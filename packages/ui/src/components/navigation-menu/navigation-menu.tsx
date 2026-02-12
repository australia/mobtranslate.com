'use client';
import * as React from 'react';
import { NavigationMenu as BaseNavigationMenu } from '@base-ui-components/react/navigation-menu';
import { cn } from '../../utils/cn';

export const NavigationMenu = React.forwardRef<
  HTMLElement,
  React.ComponentPropsWithoutRef<typeof BaseNavigationMenu.Root>
>(({ className, ...props }, ref) => (
  <BaseNavigationMenu.Root
    ref={ref}
    className={cn('mt-navigation-menu', className)}
    {...props}
  />
));
NavigationMenu.displayName = 'NavigationMenu';

export const NavigationMenuList = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseNavigationMenu.List>
>(({ className, ...props }, ref) => (
  <BaseNavigationMenu.List
    ref={ref}
    className={cn('mt-navigation-menu-list', className)}
    {...props}
  />
));
NavigationMenuList.displayName = 'NavigationMenuList';

export const NavigationMenuItem = BaseNavigationMenu.Item;

export const NavigationMenuTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<typeof BaseNavigationMenu.Trigger>
>(({ className, ...props }, ref) => (
  <BaseNavigationMenu.Trigger
    ref={ref}
    className={cn('mt-navigation-menu-trigger', className)}
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
    className={cn('mt-navigation-menu-content', className)}
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
    className={cn('mt-navigation-menu-link', className)}
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
    className={cn('mt-navigation-menu-viewport', className)}
    {...props}
  />
));
NavigationMenuViewport.displayName = 'NavigationMenuViewport';
