'use client';
import * as React from 'react';
import { Separator as BaseSeparator } from '@base-ui-components/react/separator';
import { cn } from '../../utils/cn';

export interface SeparatorProps extends React.ComponentPropsWithoutRef<typeof BaseSeparator> {}

export const Separator = React.forwardRef<HTMLDivElement, SeparatorProps>(
  ({ className, ...props }, ref) => (
    <BaseSeparator ref={ref} className={cn('mt-separator', className)} {...props} />
  )
);
Separator.displayName = 'Separator';
