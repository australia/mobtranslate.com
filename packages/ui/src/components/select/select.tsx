'use client';
import * as React from 'react';
import { Select as BaseSelect } from '@base-ui-components/react/select';
import { cn } from '../../utils/cn';

export const Select = BaseSelect.Root;

export const SelectTrigger = React.forwardRef<HTMLButtonElement, React.ComponentPropsWithoutRef<typeof BaseSelect.Trigger>>(
  ({ className, children, ...props }, ref) => (
    <BaseSelect.Trigger ref={ref} className={state => cn('mt-select-trigger', typeof className === 'function' ? className(state) : className)} {...props}>
      {children}
      <BaseSelect.Icon className="mt-select-icon">
        <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>
      </BaseSelect.Icon>
    </BaseSelect.Trigger>
  )
);
SelectTrigger.displayName = 'SelectTrigger';

export const SelectValue = BaseSelect.Value;

export const SelectPortal = BaseSelect.Portal;

export const SelectPositioner = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof BaseSelect.Positioner>>(
  ({ className, ...props }, ref) => (
    <BaseSelect.Positioner ref={ref} className={state => cn('mt-select-positioner', typeof className === 'function' ? className(state) : className)} {...props} />
  )
);
SelectPositioner.displayName = 'SelectPositioner';

export const SelectPopup = React.forwardRef<Element, React.ComponentPropsWithoutRef<typeof BaseSelect.Popup>>(
  ({ className, ...props }, ref) => (
    <BaseSelect.Popup ref={ref} className={state => cn('mt-select-popup', typeof className === 'function' ? className(state) : className)} {...props} />
  )
);
SelectPopup.displayName = 'SelectPopup';

export const SelectItem = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof BaseSelect.Item>>(
  ({ className, children, ...props }, ref) => (
    <BaseSelect.Item ref={ref} className={state => cn('mt-select-item', typeof className === 'function' ? className(state) : className)} {...props}>
      <BaseSelect.ItemIndicator className="mt-select-item-indicator">
        <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12"><path d="M2 6L5 9L10 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>
      </BaseSelect.ItemIndicator>
      <BaseSelect.ItemText>{children}</BaseSelect.ItemText>
    </BaseSelect.Item>
  )
);
SelectItem.displayName = 'SelectItem';

export const SelectGroup = BaseSelect.Group;
export const SelectGroupLabel = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof BaseSelect.GroupLabel>>(
  ({ className, ...props }, ref) => (
    <BaseSelect.GroupLabel ref={ref} className={state => cn('mt-select-group-label', typeof className === 'function' ? className(state) : className)} {...props} />
  )
);
SelectGroupLabel.displayName = 'SelectGroupLabel';

export const SelectSeparator = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof BaseSelect.Separator>>(
  ({ className, ...props }, ref) => (
    <BaseSelect.Separator ref={ref} className={state => cn('mt-select-separator', typeof className === 'function' ? className(state) : className)} {...props} />
  )
);
SelectSeparator.displayName = 'SelectSeparator';

export const SelectList = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof BaseSelect.List>>(
  ({ className, ...props }, ref) => <BaseSelect.List ref={ref} className={state => cn('mt-select-list', typeof className === 'function' ? className(state) : className)} {...props} />
);
SelectList.displayName = 'SelectList';
export const SelectIcon = BaseSelect.Icon;
export const SelectItemText = BaseSelect.ItemText;
export const SelectItemIndicator = BaseSelect.ItemIndicator;
export const SelectBackdrop = BaseSelect.Backdrop;
export const SelectArrow = BaseSelect.Arrow;
export const SelectScrollUpArrow = BaseSelect.ScrollUpArrow;
export const SelectScrollDownArrow = BaseSelect.ScrollDownArrow;
