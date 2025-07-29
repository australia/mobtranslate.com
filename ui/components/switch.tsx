'use client';

import * as React from 'react';
import { cn } from '../lib/utils';

export interface SwitchProps extends React.InputHTMLAttributes<HTMLInputElement> {
  onCheckedChange?: (checked: boolean) => void;
}

const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(
  ({ className, checked, onCheckedChange, ...props }, ref) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      onCheckedChange?.(e.target.checked);
    };

    return (
      <label className="relative inline-flex items-center cursor-pointer">
        <input
          type="checkbox"
          ref={ref}
          checked={checked}
          onChange={handleChange}
          className="sr-only peer"
          {...props}
        />
        <div className={cn(
          "w-11 h-6 bg-gray-200 rounded-full peer dark:bg-gray-700",
          "peer-checked:bg-blue-600 peer-checked:dark:bg-blue-500",
          "peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800",
          "after:content-[''] after:absolute after:top-[2px] after:left-[2px]",
          "after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all",
          "peer-checked:after:translate-x-full peer-checked:after:border-white",
          className
        )} />
      </label>
    );
  }
);

Switch.displayName = 'Switch';

export { Switch };