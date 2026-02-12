'use client';
import * as React from 'react';
import { Fieldset as BaseFieldset } from '@base-ui-components/react/fieldset';
import { cn } from '../../utils/cn';

export const Fieldset = React.forwardRef<
  HTMLFieldSetElement,
  React.ComponentPropsWithoutRef<typeof BaseFieldset.Root>
>(({ className, ...props }, ref) => (
  <BaseFieldset.Root
    ref={ref}
    className={cn('mt-fieldset', className)}
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
    className={cn('mt-fieldset-legend', className)}
    {...props}
  />
));
FieldsetLegend.displayName = 'FieldsetLegend';
