'use client';

import React from 'react';
import { cn } from '../lib/utils';

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange?: (page: number) => void;
  className?: string;
}

const Pagination = React.forwardRef<HTMLDivElement, PaginationProps>(
  ({ currentPage, totalPages, onPageChange, className }, ref) => {
    const getVisiblePages = () => {
      const pages = [];
      const showPages = 5;
      let start = Math.max(1, currentPage - Math.floor(showPages / 2));
      let end = Math.min(totalPages, start + showPages - 1);
      
      if (end - start + 1 < showPages) {
        start = Math.max(1, end - showPages + 1);
      }

      for (let i = start; i <= end; i++) {
        pages.push(i);
      }
      
      return pages;
    };

    const visiblePages = getVisiblePages();

    return (
      <div ref={ref} className={cn('flex items-center space-x-2', className)}>
        <button
          onClick={() => onPageChange?.(currentPage - 1)}
          disabled={currentPage <= 1}
          className="px-3 py-2 border border-border rounded-md hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Previous
        </button>
        
        {visiblePages[0] > 1 && (
          <>
            <button
              onClick={() => onPageChange?.(1)}
              className="px-3 py-2 border border-border rounded-md hover:bg-muted transition-colors"
            >
              1
            </button>
            {visiblePages[0] > 2 && (
              <span className="px-3 py-2 text-muted-foreground">...</span>
            )}
          </>
        )}
        
        {visiblePages.map((page) => (
          <button
            key={page}
            onClick={() => onPageChange?.(page)}
            className={cn(
              'px-3 py-2 rounded-md transition-colors',
              page === currentPage
                ? 'bg-primary text-primary-foreground'
                : 'border border-border hover:bg-muted'
            )}
          >
            {page}
          </button>
        ))}
        
        {visiblePages[visiblePages.length - 1] < totalPages && (
          <>
            {visiblePages[visiblePages.length - 1] < totalPages - 1 && (
              <span className="px-3 py-2 text-muted-foreground">...</span>
            )}
            <button
              onClick={() => onPageChange?.(totalPages)}
              className="px-3 py-2 border border-border rounded-md hover:bg-muted transition-colors"
            >
              {totalPages}
            </button>
          </>
        )}
        
        <button
          onClick={() => onPageChange?.(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className="px-3 py-2 border border-border rounded-md hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>
    );
  }
);

Pagination.displayName = 'Pagination';

export { Pagination };