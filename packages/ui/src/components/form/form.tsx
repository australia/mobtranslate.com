'use client';
import * as React from 'react';
import { Form as BaseForm } from '@base-ui-components/react/form';
import { cn } from '../../utils/cn';

export interface FormProps
  extends React.ComponentPropsWithoutRef<typeof BaseForm> {}

export const Form = React.forwardRef<HTMLFormElement, FormProps>(
  ({ className, ...props }, ref) => (
    <BaseForm ref={ref} className={state => cn('mt-form', typeof className === 'function' ? className(state) : className)} {...props} />
  )
);
Form.displayName = 'Form';
