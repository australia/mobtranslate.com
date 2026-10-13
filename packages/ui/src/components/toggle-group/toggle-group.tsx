'use client';
import * as React from 'react';
import { ToggleGroup as BaseToggleGroup } from '@base-ui-components/react/toggle-group';
import { Toggle as BaseToggle } from '@base-ui-components/react/toggle';
import { cn } from '../../utils/cn';

export interface ToggleGroupProps extends React.ComponentPropsWithoutRef<typeof BaseToggleGroup> {}

export const ToggleGroup = React.forwardRef<HTMLDivElement, ToggleGroupProps>(
  ({ className, orientation = 'horizontal', ...props }, ref) => (
    <BaseToggleGroup ref={ref} orientation={orientation} data-orientation={orientation} className={state => cn('mt-toggle-group', typeof className === 'function' ? className(state) : className)} {...props} />
  )
);
ToggleGroup.displayName = 'ToggleGroup';

export const ToggleGroupItem = React.forwardRef<HTMLButtonElement, React.ComponentPropsWithoutRef<typeof BaseToggle>>(
  ({ className, ...props }, ref) => (
    <BaseToggle ref={ref} className={state => cn('mt-toggle-group-item', typeof className === 'function' ? className(state) : className)} {...props} />
  )
);
ToggleGroupItem.displayName = 'ToggleGroupItem';
