'use client';
import * as React from 'react';
import { Collapsible as BaseCollapsible } from '@base-ui-components/react/collapsible';
import { cn } from '../../utils/cn';

export const Collapsible = BaseCollapsible.Root;

export const CollapsibleTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<typeof BaseCollapsible.Trigger>
>(({ className, ...props }, ref) => (
  <BaseCollapsible.Trigger
    ref={ref}
    className={state => cn('mt-collapsible-trigger', typeof className === 'function' ? className(state) : className)}
    {...props}
  />
));
CollapsibleTrigger.displayName = 'CollapsibleTrigger';

export const CollapsiblePanel = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseCollapsible.Panel>
>(({ className, ...props }, ref) => (
  <BaseCollapsible.Panel
    ref={ref}
    className={state => cn('mt-collapsible-panel', typeof className === 'function' ? className(state) : className)}
    {...props}
  />
));
CollapsiblePanel.displayName = 'CollapsiblePanel';
