'use client';
import * as React from 'react';
import { Switch as BaseSwitch } from '@base-ui-components/react/switch';
import { cn } from '../../utils/cn';

export interface SwitchProps extends React.ComponentPropsWithoutRef<typeof BaseSwitch.Root> {
  label?: string;
}

export const Switch = React.forwardRef<HTMLElement, SwitchProps>(
  ({ className, label, ...props }, ref) => (
    <label className="mt-switch-label">
      <BaseSwitch.Root ref={ref} aria-label={label} className={state => cn('mt-switch', typeof className === 'function' ? className(state) : className)} {...props}>
        <BaseSwitch.Thumb className="mt-switch-thumb" />
      </BaseSwitch.Root>
      {label && <span className="mt-switch-text">{label}</span>}
    </label>
  )
);
Switch.displayName = 'Switch';
