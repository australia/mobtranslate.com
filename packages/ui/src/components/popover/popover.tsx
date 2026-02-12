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
    <BasePopover.Positioner ref={ref} className={cn('mt-popover-positioner', className)} {...props} />
  )
);
PopoverPositioner.displayName = 'PopoverPositioner';

export const PopoverPopup = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof BasePopover.Popup>>(
  ({ className, ...props }, ref) => (
    <BasePopover.Popup ref={ref} className={cn('mt-popover-popup', className)} {...props}>
      {props.children}
      <BasePopover.Arrow className="mt-popover-arrow" />
    </BasePopover.Popup>
  )
);
PopoverPopup.displayName = 'PopoverPopup';

export const PopoverTitle = React.forwardRef<HTMLHeadingElement, React.ComponentPropsWithoutRef<typeof BasePopover.Title>>(
  ({ className, ...props }, ref) => (
    <BasePopover.Title ref={ref} className={cn('mt-popover-title', className)} {...props} />
  )
);
PopoverTitle.displayName = 'PopoverTitle';

export const PopoverDescription = React.forwardRef<HTMLParagraphElement, React.ComponentPropsWithoutRef<typeof BasePopover.Description>>(
  ({ className, ...props }, ref) => (
    <BasePopover.Description ref={ref} className={cn('mt-popover-description', className)} {...props} />
  )
);
PopoverDescription.displayName = 'PopoverDescription';
