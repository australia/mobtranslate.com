'use client';
import * as React from 'react';
import { NumberField as BaseNumberField } from '@base-ui-components/react/number-field';
import { cn } from '../../utils/cn';

export const NumberField = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseNumberField.Root>
>(({ className, ...props }, ref) => (
  <BaseNumberField.Root
    ref={ref}
    className={state => cn('mt-number-field', typeof className === 'function' ? className(state) : className)}
    {...props}
  />
));
NumberField.displayName = 'NumberField';

export const NumberFieldGroup = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseNumberField.Group>
>(({ className, ...props }, ref) => (
  <BaseNumberField.Group
    ref={ref}
    className={state => cn('mt-number-field-group', typeof className === 'function' ? className(state) : className)}
    {...props}
  />
));
NumberFieldGroup.displayName = 'NumberFieldGroup';

export const NumberFieldInput = React.forwardRef<
  HTMLInputElement,
  React.ComponentPropsWithoutRef<typeof BaseNumberField.Input>
>(({ className, ...props }, ref) => (
  <BaseNumberField.Input
    ref={ref}
    className={state => cn('mt-number-field-input', typeof className === 'function' ? className(state) : className)}
    {...props}
  />
));
NumberFieldInput.displayName = 'NumberFieldInput';

export const NumberFieldIncrement = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<typeof BaseNumberField.Increment>
>(({ className, children, ...props }, ref) => (
  <BaseNumberField.Increment
    ref={ref}
    aria-label="Increase value"
    className={state => cn('mt-number-field-increment', typeof className === 'function' ? className(state) : className)}
    {...props}
  >
    {children || (
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" focusable="false">
        <path
          d="M5 2V8M2 5H8"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    )}
  </BaseNumberField.Increment>
));
NumberFieldIncrement.displayName = 'NumberFieldIncrement';

export const NumberFieldDecrement = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<typeof BaseNumberField.Decrement>
>(({ className, children, ...props }, ref) => (
  <BaseNumberField.Decrement
    ref={ref}
    aria-label="Decrease value"
    className={state => cn('mt-number-field-decrement', typeof className === 'function' ? className(state) : className)}
    {...props}
  >
    {children || (
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" focusable="false">
        <path
          d="M2 5H8"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    )}
  </BaseNumberField.Decrement>
));
NumberFieldDecrement.displayName = 'NumberFieldDecrement';

export const NumberFieldScrubArea = BaseNumberField.ScrubArea;
export const NumberFieldScrubAreaCursor = BaseNumberField.ScrubAreaCursor;
