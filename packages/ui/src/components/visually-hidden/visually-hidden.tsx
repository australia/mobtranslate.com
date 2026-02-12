import * as React from 'react';
import { cn } from '../../utils/cn';

export interface VisuallyHiddenProps extends React.HTMLAttributes<HTMLSpanElement> {}

export const VisuallyHidden = React.forwardRef<HTMLSpanElement, VisuallyHiddenProps>(
  ({ className, ...props }, ref) => (
    <span ref={ref} className={cn('mt-visually-hidden', className)} {...props} />
  )
);
VisuallyHidden.displayName = 'VisuallyHidden';
