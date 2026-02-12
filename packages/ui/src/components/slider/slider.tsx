'use client';
import * as React from 'react';
import { Slider as BaseSlider } from '@base-ui-components/react/slider';
import { cn } from '../../utils/cn';

export interface SliderProps extends React.ComponentPropsWithoutRef<typeof BaseSlider.Root> {}

export const Slider = React.forwardRef<HTMLDivElement, SliderProps>(
  ({ className, ...props }, ref) => (
    <BaseSlider.Root ref={ref} className={cn('mt-slider', className)} {...props}>
      <BaseSlider.Control className="mt-slider-control">
        <BaseSlider.Track className="mt-slider-track">
          <BaseSlider.Indicator className="mt-slider-indicator" />
          <BaseSlider.Thumb className="mt-slider-thumb" />
        </BaseSlider.Track>
      </BaseSlider.Control>
    </BaseSlider.Root>
  )
);
Slider.displayName = 'Slider';
