'use client';

import React from 'react';
import { cn } from '../lib/utils';
import { Label } from './Label';

export interface FormFieldProps {
  label?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}

const FormField = React.forwardRef<HTMLDivElement, FormFieldProps>(
  ({ label, error, required = false, children, className }, ref) => {
    return (
      <div ref={ref} className={cn('space-y-2', className)}>
        {label && (
          <Label required={required}>
            {label}
          </Label>
        )}
        {children}
        {error && (
          <p className="text-sm text-red-600">
            {error}
          </p>
        )}
      </div>
    );
  }
);

FormField.displayName = 'FormField';

export { FormField };