'use client';
import * as React from 'react';
import { Toolbar as BaseToolbar } from '@base-ui-components/react/toolbar';
import { cn } from '../../utils/cn';

export const Toolbar = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseToolbar.Root>
>(({ className, ...props }, ref) => (
  <BaseToolbar.Root
    ref={ref}
    className={state => cn('mt-toolbar', typeof className === 'function' ? className(state) : className)}
    {...props}
  />
));
Toolbar.displayName = 'Toolbar';

export const ToolbarButton = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<typeof BaseToolbar.Button>
>(({ className, ...props }, ref) => (
  <BaseToolbar.Button
    ref={ref}
    className={state => cn('mt-toolbar-button', typeof className === 'function' ? className(state) : className)}
    {...props}
  />
));
ToolbarButton.displayName = 'ToolbarButton';

export const ToolbarSeparator = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseToolbar.Separator>
>(({ className, ...props }, ref) => (
  <BaseToolbar.Separator
    ref={ref}
    className={state => cn('mt-toolbar-separator', typeof className === 'function' ? className(state) : className)}
    {...props}
  />
));
ToolbarSeparator.displayName = 'ToolbarSeparator';

export const ToolbarGroup = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseToolbar.Group>
>(({ className, ...props }, ref) => (
  <BaseToolbar.Group
    ref={ref}
    className={state => cn('mt-toolbar-group', typeof className === 'function' ? className(state) : className)}
    {...props}
  />
));
ToolbarGroup.displayName = 'ToolbarGroup';

export const ToolbarLink = React.forwardRef<
  HTMLAnchorElement,
  React.ComponentPropsWithoutRef<typeof BaseToolbar.Link>
>(({ className, ...props }, ref) => (
  <BaseToolbar.Link
    ref={ref}
    className={state => cn('mt-toolbar-link', typeof className === 'function' ? className(state) : className)}
    {...props}
  />
));
ToolbarLink.displayName = 'ToolbarLink';
