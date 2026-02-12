'use client';
import * as React from 'react';
import { Select as BaseSelect } from '@base-ui-components/react/select';
import { cn } from '../../utils/cn';

export const Select = BaseSelect.Root;

export const SelectTrigger = React.forwardRef<HTMLButtonElement, React.ComponentPropsWithoutRef<typeof BaseSelect.Trigger>>(
  ({ className, children, ...props }, ref) => (
    <BaseSelect.Trigger ref={ref} className={cn('mt-select-trigger', className)} {...props}>
      {children}
      <BaseSelect.Icon className="mt-select-icon">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>
      </BaseSelect.Icon>
    </BaseSelect.Trigger>
  )
);
SelectTrigger.displayName = 'SelectTrigger';

export const SelectValue = BaseSelect.Value;

export const SelectPortal = BaseSelect.Portal;

export const SelectPositioner = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof BaseSelect.Positioner>>(
  ({ className, ...props }, ref) => (
    <BaseSelect.Positioner ref={ref} className={cn('mt-select-positioner', className)} {...props} />
  )
);
SelectPositioner.displayName = 'SelectPositioner';

export const SelectPopup = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof BaseSelect.Popup>>(
  ({ className, ...props }, ref) => (
    <BaseSelect.Popup ref={ref} className={cn('mt-select-popup', className)} {...props} />
  )
);
SelectPopup.displayName = 'SelectPopup';

export const SelectItem = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof BaseSelect.Item>>(
  ({ className, children, ...props }, ref) => (
    <BaseSelect.Item ref={ref} className={cn('mt-select-item', className)} {...props}>
      <BaseSelect.ItemIndicator className="mt-select-item-indicator">
        <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 6L5 9L10 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>
      </BaseSelect.ItemIndicator>
      <BaseSelect.ItemText>{children}</BaseSelect.ItemText>
    </BaseSelect.Item>
  )
);
SelectItem.displayName = 'SelectItem';

export const SelectGroup = BaseSelect.Group;
export const SelectGroupLabel = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof BaseSelect.GroupLabel>>(
  ({ className, ...props }, ref) => (
    <BaseSelect.GroupLabel ref={ref} className={cn('mt-select-group-label', className)} {...props} />
  )
);
SelectGroupLabel.displayName = 'SelectGroupLabel';

export const SelectSeparator = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof BaseSelect.Separator>>(
  ({ className, ...props }, ref) => (
    <BaseSelect.Separator ref={ref} className={cn('mt-select-separator', className)} {...props} />
  )
);
SelectSeparator.displayName = 'SelectSeparator';
