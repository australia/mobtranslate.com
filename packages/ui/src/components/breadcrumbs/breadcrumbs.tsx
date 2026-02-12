'use client';
import * as React from 'react';
import { cn } from '../../utils/cn';

export interface BreadcrumbsProps extends React.HTMLAttributes<HTMLElement> {
  separator?: React.ReactNode;
}

export const Breadcrumbs = React.forwardRef<HTMLElement, BreadcrumbsProps>(
  ({ className, separator, children, ...props }, ref) => {
    const items = React.Children.toArray(children);
    const defaultSep = separator ?? (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
        <path d="M6 4l4 4-4 4" />
      </svg>
    );

    return (
      <nav ref={ref} aria-label="Breadcrumb" className={cn('mt-breadcrumbs', className)} {...props}>
        <ol className="mt-breadcrumbs-list">
          {items.map((child, index) => (
            <li key={index} className="mt-breadcrumbs-item">
              {child}
              {index < items.length - 1 && (
                <span className="mt-breadcrumbs-separator" aria-hidden="true">
                  {defaultSep}
                </span>
              )}
            </li>
          ))}
        </ol>
      </nav>
    );
  }
);
Breadcrumbs.displayName = 'Breadcrumbs';

export const BreadcrumbLink = React.forwardRef<HTMLAnchorElement, React.AnchorHTMLAttributes<HTMLAnchorElement>>(
  ({ className, ...props }, ref) => (
    <a ref={ref} className={cn('mt-breadcrumbs-link', className)} {...props} />
  )
);
BreadcrumbLink.displayName = 'BreadcrumbLink';

export const BreadcrumbPage = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  ({ className, ...props }, ref) => (
    <span ref={ref} aria-current="page" className={cn('mt-breadcrumbs-page', className)} {...props} />
  )
);
BreadcrumbPage.displayName = 'BreadcrumbPage';
