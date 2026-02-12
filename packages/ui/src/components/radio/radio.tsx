'use client';
import * as React from 'react';
import { RadioGroup as BaseRadioGroup } from '@base-ui-components/react/radio-group';
import { Radio as BaseRadio } from '@base-ui-components/react/radio';
import { cn } from '../../utils/cn';

export interface RadioGroupProps extends React.ComponentPropsWithoutRef<typeof BaseRadioGroup> {}

export const RadioGroup = React.forwardRef<HTMLDivElement, RadioGroupProps>(
  ({ className, ...props }, ref) => (
    <BaseRadioGroup ref={ref} className={cn('mt-radio-group', className)} {...props} />
  )
);
RadioGroup.displayName = 'RadioGroup';

export interface RadioItemProps extends React.ComponentPropsWithoutRef<typeof BaseRadio.Root> {
  label?: string;
}

export const RadioItem = React.forwardRef<HTMLButtonElement, RadioItemProps>(
  ({ className, label, ...props }, ref) => (
    <label className="mt-radio-label">
      <BaseRadio.Root ref={ref} className={cn('mt-radio', className)} {...props}>
        <BaseRadio.Indicator className="mt-radio-indicator" />
      </BaseRadio.Root>
      {label && <span className="mt-radio-text">{label}</span>}
    </label>
  )
);
RadioItem.displayName = 'RadioItem';
