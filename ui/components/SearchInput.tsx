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
            'w-full pl-10 pr-4 py-2 border border-input rounded-md transition-all shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary',
            className
          )}
          ref={ref}
          {...props}
        />
        <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>
    );
  }
);

SearchInput.displayName = 'SearchInput';

export { SearchInput };