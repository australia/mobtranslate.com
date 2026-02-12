'use client';
import * as React from 'react';
import { ToggleGroup as BaseToggleGroup } from '@base-ui-components/react/toggle-group';
import { Toggle as BaseToggle } from '@base-ui-components/react/toggle';
import { cn } from '../../utils/cn';

export interface ToggleGroupProps extends React.ComponentPropsWithoutRef<typeof BaseToggleGroup> {}

export const ToggleGroup = React.forwardRef<HTMLDivElement, ToggleGroupProps>(
  ({ className, ...props }, ref) => (
    <BaseToggleGroup ref={ref} className={cn('mt-toggle-group', className)} {...props} />
  )
);
ToggleGroup.displayName = 'ToggleGroup';

export const ToggleGroupItem = React.forwardRef<HTMLButtonElement, React.ComponentPropsWithoutRef<typeof BaseToggle>>(
  ({ className, ...props }, ref) => (
    <BaseToggle ref={ref} className={cn('mt-toggle-group-item', className)} {...props} />
  )
);
ToggleGroupItem.displayName = 'ToggleGroupItem';
