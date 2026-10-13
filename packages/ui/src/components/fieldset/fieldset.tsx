'use client';
import * as React from 'react';
import { Fieldset as BaseFieldset } from '@base-ui-components/react/fieldset';
import { cn } from '../../utils/cn';

export const Fieldset = React.forwardRef<
  HTMLFieldSetElement,
  React.ComponentPropsWithoutRef<typeof BaseFieldset.Root>
>(({ className, disabled = false, render, ...props }, ref) => (
  <BaseFieldset.Root
    ref={ref}
    disabled={disabled}
    render={render ?? <fieldset disabled={disabled} />}
    className={state => cn('mt-fieldset', typeof className === 'function' ? className(state) : className)}
    {...props}
  />
));
Fieldset.displayName = 'Fieldset';

export const FieldsetLegend = React.forwardRef<
  HTMLLegendElement,
  React.ComponentPropsWithoutRef<typeof BaseFieldset.Legend>
>(({ className, ...props }, ref) => (
  <BaseFieldset.Legend
    ref={ref}
    className={state => cn('mt-fieldset-legend', typeof className === 'function' ? className(state) : className)}
    {...props}
  />
));
FieldsetLegend.displayName = 'FieldsetLegend';
