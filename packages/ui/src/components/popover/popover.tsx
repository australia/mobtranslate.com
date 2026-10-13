'use client';
import * as React from 'react';
import { Popover as BasePopover } from '@base-ui-components/react/popover';
import { cn } from '../../utils/cn';

export const Popover = BasePopover.Root;
export const PopoverTrigger = BasePopover.Trigger;
export const PopoverClose = BasePopover.Close;
export const PopoverPortal = BasePopover.Portal;

export const PopoverPositioner = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof BasePopover.Positioner>>(
  ({ className, ...props }, ref) => (
    <BasePopover.Positioner ref={ref} className={state => cn('mt-popover-positioner', typeof className === 'function' ? className(state) : className)} {...props} />
  )
);
PopoverPositioner.displayName = 'PopoverPositioner';

export const PopoverPopup = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof BasePopover.Popup>>(
  ({ className, ...props }, ref) => (
    <BasePopover.Popup ref={ref} className={state => cn('mt-popover-popup', typeof className === 'function' ? className(state) : className)} {...props}>
      {props.children}
      <BasePopover.Arrow className="mt-popover-arrow" />
    </BasePopover.Popup>
  )
);
PopoverPopup.displayName = 'PopoverPopup';

export const PopoverTitle = React.forwardRef<HTMLHeadingElement, React.ComponentPropsWithoutRef<typeof BasePopover.Title>>(
  ({ className, ...props }, ref) => (
    <BasePopover.Title ref={ref} className={state => cn('mt-popover-title', typeof className === 'function' ? className(state) : className)} {...props} />
  )
);
PopoverTitle.displayName = 'PopoverTitle';

export const PopoverDescription = React.forwardRef<HTMLParagraphElement, React.ComponentPropsWithoutRef<typeof BasePopover.Description>>(
  ({ className, ...props }, ref) => (
    <BasePopover.Description ref={ref} className={state => cn('mt-popover-description', typeof className === 'function' ? className(state) : className)} {...props} />
  )
);
PopoverDescription.displayName = 'PopoverDescription';
