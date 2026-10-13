'use client';
import * as React from 'react';
import { Toggle as BaseToggle } from '@base-ui-components/react/toggle';
import { cn } from '../../utils/cn';

export interface ToggleProps extends React.ComponentPropsWithoutRef<typeof BaseToggle> {}

export const Toggle = React.forwardRef<HTMLButtonElement, ToggleProps>(
  ({ className, ...props }, ref) => (
    <BaseToggle ref={ref} className={state => cn('mt-toggle', typeof className === 'function' ? className(state) : className)} {...props} />
  )
);
Toggle.displayName = 'Toggle';
