'use client';
import * as React from 'react';
import { Tabs as BaseTabs } from '@base-ui-components/react/tabs';
import { cn } from '../../utils/cn';

export const Tabs = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof BaseTabs.Root>>(
  ({ className, ...props }, ref) => (
    <BaseTabs.Root ref={ref} className={cn('mt-tabs', className)} {...props} />
  )
);
Tabs.displayName = 'Tabs';

export const TabsList = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof BaseTabs.List>>(
  ({ className, ...props }, ref) => (
    <BaseTabs.List ref={ref} className={cn('mt-tabs-list', className)} {...props}>
      {props.children}
      <BaseTabs.Indicator className="mt-tabs-indicator" />
    </BaseTabs.List>
  )
);
TabsList.displayName = 'TabsList';

export const TabsTrigger = React.forwardRef<HTMLButtonElement, React.ComponentPropsWithoutRef<typeof BaseTabs.Tab>>(
  ({ className, ...props }, ref) => (
    <BaseTabs.Tab ref={ref} className={cn('mt-tabs-trigger', className)} {...props} />
  )
);
TabsTrigger.displayName = 'TabsTrigger';

export const TabsContent = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof BaseTabs.Panel>>(
  ({ className, ...props }, ref) => (
    <BaseTabs.Panel ref={ref} className={cn('mt-tabs-content', className)} {...props} />
  )
);
TabsContent.displayName = 'TabsContent';
