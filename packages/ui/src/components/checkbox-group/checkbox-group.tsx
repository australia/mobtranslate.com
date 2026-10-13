'use client';
import * as React from 'react';
import { CheckboxGroup as BaseCheckboxGroup } from '@base-ui-components/react/checkbox-group';
import { cn } from '../../utils/cn';

export interface CheckboxGroupProps
  extends React.ComponentPropsWithoutRef<typeof BaseCheckboxGroup> {}

export const CheckboxGroup = React.forwardRef<HTMLDivElement, CheckboxGroupProps>(
  ({ className, ...props }, ref) => (
    <BaseCheckboxGroup
      ref={ref}
      className={state => cn('mt-checkbox-group', typeof className === 'function' ? className(state) : className)}
      {...props}
    />
  )
);
CheckboxGroup.displayName = 'CheckboxGroup';
