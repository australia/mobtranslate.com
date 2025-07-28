'use client';

import React from 'react';
import { cn } from '../lib/utils';

export interface SearchInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  onSearch?: (value: string) => void;
}

const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
  ({ className, onSearch, ...props }, ref) => {
    return (
      <div className="relative">
        <input
          type="search"
          className={cn(
            'w-full h-11 pl-12 pr-4 py-3 rounded-lg border border-gray-200 dark:border-gray-700',
            'bg-white dark:bg-gray-900 text-base shadow-sm transition-all duration-200',
            'placeholder:text-gray-400 dark:placeholder:text-gray-500',
            'hover:border-gray-300 dark:hover:border-gray-600',
            'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 focus:border-transparent',
            'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-gray-50 dark:disabled:bg-gray-800',
            className
          )}
          ref={ref}
          {...props}
        />
        <div className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>
    );
  }
);

SearchInput.displayName = 'SearchInput';

export { SearchInput };