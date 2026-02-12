'use client';
import * as React from 'react';
import { Tooltip as BaseTooltip } from '@base-ui-components/react/tooltip';
import { cn } from '../../utils/cn';

export const TooltipProvider = BaseTooltip.Provider;
export const Tooltip = BaseTooltip.Root;
export const TooltipTrigger = BaseTooltip.Trigger;
export const TooltipPortal = BaseTooltip.Portal;

export const TooltipPositioner = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof BaseTooltip.Positioner>>(
  ({ className, ...props }, ref) => (
    <BaseTooltip.Positioner ref={ref} className={cn('mt-tooltip-positioner', className)} {...props} />
  )
);
TooltipPositioner.displayName = 'TooltipPositioner';

export const TooltipPopup = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof BaseTooltip.Popup>>(
  ({ className, ...props }, ref) => (
    <BaseTooltip.Popup ref={ref} className={cn('mt-tooltip-popup', className)} {...props}>
      {props.children}
      <BaseTooltip.Arrow className="mt-tooltip-arrow" />
    </BaseTooltip.Popup>
  )
);
TooltipPopup.displayName = 'TooltipPopup';
