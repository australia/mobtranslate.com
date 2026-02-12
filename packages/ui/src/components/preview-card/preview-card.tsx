'use client';
import * as React from 'react';
import { PreviewCard as BasePreviewCard } from '@base-ui-components/react/preview-card';
import { cn } from '../../utils/cn';

export const PreviewCard = BasePreviewCard.Root;
export const PreviewCardTrigger = BasePreviewCard.Trigger;
export const PreviewCardPortal = BasePreviewCard.Portal;

export const PreviewCardPositioner = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BasePreviewCard.Positioner>
>(({ className, ...props }, ref) => (
  <BasePreviewCard.Positioner
    ref={ref}
    className={cn('mt-preview-card-positioner', className)}
    {...props}
  />
));
PreviewCardPositioner.displayName = 'PreviewCardPositioner';

export const PreviewCardPopup = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BasePreviewCard.Popup>
>(({ className, ...props }, ref) => (
  <BasePreviewCard.Popup
    ref={ref}
    className={cn('mt-preview-card-popup', className)}
    {...props}
  >
    {props.children}
    <BasePreviewCard.Arrow className="mt-preview-card-arrow" />
  </BasePreviewCard.Popup>
));
PreviewCardPopup.displayName = 'PreviewCardPopup';
