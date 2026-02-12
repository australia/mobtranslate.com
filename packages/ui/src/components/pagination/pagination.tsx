'use client';
import * as React from 'react';
import { cn } from '../../utils/cn';

export interface PaginationProps extends React.HTMLAttributes<HTMLElement> {}

export const Pagination = React.forwardRef<HTMLElement, PaginationProps>(
  ({ className, ...props }, ref) => (
    <nav ref={ref} role="navigation" aria-label="Pagination" className={cn('mt-pagination', className)} {...props} />
  )
);
Pagination.displayName = 'Pagination';

export const PaginationContent = React.forwardRef<HTMLUListElement, React.HTMLAttributes<HTMLUListElement>>(
  ({ className, ...props }, ref) => (
    <ul ref={ref} className={cn('mt-pagination-content', className)} {...props} />
  )
);
PaginationContent.displayName = 'PaginationContent';

export const PaginationItem = React.forwardRef<HTMLLIElement, React.LiHTMLAttributes<HTMLLIElement>>(
  ({ className, ...props }, ref) => (
    <li ref={ref} className={cn('mt-pagination-item', className)} {...props} />
  )
);
PaginationItem.displayName = 'PaginationItem';

export interface PaginationButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  isActive?: boolean;
}

export const PaginationButton = React.forwardRef<HTMLButtonElement, PaginationButtonProps>(
  ({ className, isActive, ...props }, ref) => (
    <button
      ref={ref}
      aria-current={isActive ? 'page' : undefined}
      className={cn('mt-pagination-btn', isActive && 'mt-pagination-btn-active', className)}
      {...props}
    />
  )
);
PaginationButton.displayName = 'PaginationButton';

export const PaginationPrevious = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
  ({ className, children, ...props }, ref) => (
    <button ref={ref} aria-label="Go to previous page" className={cn('mt-pagination-btn', 'mt-pagination-nav', className)} {...props}>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
        <path d="M10 4l-4 4 4 4" />
      </svg>
      {children ?? <span>Previous</span>}
    </button>
  )
);
PaginationPrevious.displayName = 'PaginationPrevious';

export const PaginationNext = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
  ({ className, children, ...props }, ref) => (
    <button ref={ref} aria-label="Go to next page" className={cn('mt-pagination-btn', 'mt-pagination-nav', className)} {...props}>
      {children ?? <span>Next</span>}
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
        <path d="M6 4l4 4-4 4" />
      </svg>
    </button>
  )
);
PaginationNext.displayName = 'PaginationNext';

export const PaginationEllipsis = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  ({ className, ...props }, ref) => (
    <span ref={ref} aria-hidden="true" className={cn('mt-pagination-ellipsis', className)} {...props}>
      ...
    </span>
  )
);
PaginationEllipsis.displayName = 'PaginationEllipsis';
