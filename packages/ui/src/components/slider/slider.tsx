'use client';
import * as React from 'react';
import { Slider as BaseSlider } from '@base-ui-components/react/slider';
import { cn } from '../../utils/cn';

export interface SliderProps extends React.ComponentPropsWithoutRef<typeof BaseSlider.Root> {
  getAriaLabel?: (index: number) => string;
  getAriaValueText?: (formattedValue: string, value: number, index: number) => string;
}

export const Slider = React.forwardRef<HTMLDivElement, SliderProps>(
  ({ className, getAriaLabel, getAriaValueText, thumbAlignment = 'edge', ...props }, ref) => {
    const value = props.value ?? props.defaultValue;
    const count = Array.isArray(value) ? value.length : 1;
    return <BaseSlider.Root ref={ref} thumbAlignment={thumbAlignment} className={state => cn('mt-slider', typeof className === 'function' ? className(state) : className)} {...props}>
      <BaseSlider.Control className="mt-slider-control">
        <BaseSlider.Track className="mt-slider-track">
          <BaseSlider.Indicator className="mt-slider-indicator" />
          {Array.from({ length: count }, (_, index) => <BaseSlider.Thumb key={index} index={index} className="mt-slider-thumb" getAriaLabel={getAriaLabel} getAriaValueText={getAriaValueText} aria-label={props['aria-label']} aria-labelledby={props['aria-labelledby']} />)}
        </BaseSlider.Track>
      </BaseSlider.Control>
    </BaseSlider.Root>;
  }
);
Slider.displayName = 'Slider';
