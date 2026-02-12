'use client';
import * as React from 'react';
import { Meter as BaseMeter } from '@base-ui-components/react/meter';
import { cn } from '../../utils/cn';

export interface MeterProps
  extends React.ComponentPropsWithoutRef<typeof BaseMeter.Root> {}

export const Meter = React.forwardRef<HTMLDivElement, MeterProps>(
  ({ className, ...props }, ref) => (
    <BaseMeter.Root
      ref={ref}
      className={cn('mt-meter', className)}
      {...props}
    >
      <BaseMeter.Track className="mt-meter-track">
        <BaseMeter.Indicator className="mt-meter-indicator" />
      </BaseMeter.Track>
    </BaseMeter.Root>
  )
);
Meter.displayName = 'Meter';
