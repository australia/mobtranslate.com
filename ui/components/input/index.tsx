'use client';

import * as React from "react";
import { cn } from "../../lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  fullWidth?: boolean;
  variant?: 'standard' | 'outlined' | 'filled';
}

export const Input = ({ 
  className, 
  label, 
  error, 
  helperText, 
  fullWidth = false, 
  variant = 'standard', 
  ...props 
}: InputProps) => {
  // Base classes
  let containerClass = 'flex flex-col space-y-1';
  let inputClass = 'py-2 px-3 border rounded focus:outline-none transition-all duration-200';
  
  // Variant specific classes
  switch (variant) {
    case 'outlined':
      inputClass += ' bg-white border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500';
      break;
    case 'filled':
      inputClass += ' bg-gray-100 border-transparent focus:bg-white focus:border-blue-500';
      break;
    default: // standard
      inputClass += ' bg-white border-b border-gray-300 rounded-none px-0 focus:border-blue-500';
  }
  
  // Combine with passed className and fullWidth
  if (fullWidth) {
    containerClass += ' w-full';
    inputClass += ' w-full';
  }
  
  return (
    <div className={containerClass}>
      {label && (
        <label className="text-sm font-medium text-gray-700">{label}</label>
      )}
      <input
        className={cn(inputClass, 
          error ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : '',
          className)}
        {...props}
      />
      {(error || helperText) && (
        <p className={`text-xs ${error ? 'text-red-500' : 'text-gray-500'}`}>
          {error || helperText}
        </p>
      )}
    </div>
  );
};
