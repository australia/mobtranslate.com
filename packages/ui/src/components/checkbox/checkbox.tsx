'use client';
import * as React from 'react';
import { Checkbox as BaseCheckbox } from '@base-ui-components/react/checkbox';
import { cn } from '../../utils/cn';

export interface CheckboxProps extends React.ComponentPropsWithoutRef<typeof BaseCheckbox.Root> {
  label?: string;
}

export const Checkbox = React.forwardRef<HTMLElement, CheckboxProps>(
  ({ className, label, ...props }, ref) => (
    <label className="mt-checkbox-label">
      <BaseCheckbox.Root ref={ref} aria-label={label} className={state => cn('mt-checkbox', typeof className === 'function' ? className(state) : className)} {...props}>
        <BaseCheckbox.Indicator className="mt-checkbox-indicator">
          <svg viewBox="0 0 12 10" fill="none" className="mt-checkbox-icon" aria-hidden="true" focusable="false">
            <path className="mt-checkbox-mixed" d="M2 5h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <polyline className="mt-checkbox-check" points="1.5 6 4.5 9 10.5 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </BaseCheckbox.Indicator>
      </BaseCheckbox.Root>
      {label && <span className="mt-checkbox-text">{label}</span>}
    </label>
  )
);
Checkbox.displayName = 'Checkbox';
