'use client';
import * as React from 'react';
import { Field as BaseField } from '@base-ui-components/react/field';
import { cn } from '../../utils/cn';

export const Field = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseField.Root>
>(({ className, ...props }, ref) => (
  <BaseField.Root
    ref={ref}
    className={cn('mt-field', className)}
    {...props}
  />
));
Field.displayName = 'Field';

export const FieldLabel = React.forwardRef<
  HTMLLabelElement,
  React.ComponentPropsWithoutRef<typeof BaseField.Label>
>(({ className, ...props }, ref) => (
  <BaseField.Label
    ref={ref}
    className={cn('mt-field-label', className)}
    {...props}
  />
));
FieldLabel.displayName = 'FieldLabel';

export const FieldDescription = React.forwardRef<
  HTMLParagraphElement,
  React.ComponentPropsWithoutRef<typeof BaseField.Description>
>(({ className, ...props }, ref) => (
  <BaseField.Description
    ref={ref}
    className={cn('mt-field-description', className)}
    {...props}
  />
));
FieldDescription.displayName = 'FieldDescription';

export const FieldError = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseField.Error>
>(({ className, ...props }, ref) => (
  <BaseField.Error
    ref={ref}
    className={cn('mt-field-error', className)}
    {...props}
  />
));
FieldError.displayName = 'FieldError';

export const FieldControl = BaseField.Control;
export const FieldValidity = BaseField.Validity;
