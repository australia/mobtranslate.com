'use client';
import * as React from 'react';
import { Switch as BaseSwitch } from '@base-ui-components/react/switch';
import { cn } from '../../utils/cn';

export interface SwitchProps extends React.ComponentPropsWithoutRef<typeof BaseSwitch.Root> {
  label?: string;
}

export const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ className, label, ...props }, ref) => (
    <label className="mt-switch-label">
      <BaseSwitch.Root ref={ref} className={cn('mt-switch', className)} {...props}>
        <BaseSwitch.Thumb className="mt-switch-thumb" />
      </BaseSwitch.Root>
      {label && <span className="mt-switch-text">{label}</span>}
    </label>
  )
);
Switch.displayName = 'Switch';
