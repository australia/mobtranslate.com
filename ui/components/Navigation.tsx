'use client';

import React from 'react';
import { cn } from '../lib/utils';

export interface NavigationItem {
  href: string;
  label: string;
  active?: boolean;
}

export interface NavigationProps {
  items: NavigationItem[];
  className?: string;
}

const Navigation = React.forwardRef<HTMLElement, NavigationProps>(
  ({ items, className }, ref) => {
    return (
      <nav ref={ref} className={cn('bg-card p-4 rounded-lg border', className)}>
        <ul className="flex space-x-6">
          {items.map((item) => (
            <li key={item.href}>
              <a
                href={item.href}
                className={cn(
                  'font-medium transition-colors',
                  item.active
                    ? 'text-primary'
                    : 'text-foreground hover:text-primary'
                )}
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    );
  }
);

Navigation.displayName = 'Navigation';

const Breadcrumbs = React.forwardRef<HTMLElement, NavigationProps>(
  ({ items, className }, ref) => {
    return (
      <nav ref={ref} className={cn('flex items-center space-x-2 text-sm', className)}>
        {items.map((item, index) => (
          <React.Fragment key={item.href}>
            {index > 0 && (
              <span className="text-muted-foreground">/</span>
            )}
            {index === items.length - 1 ? (
              <span className="text-foreground">{item.label}</span>
            ) : (
              <a
                href={item.href}
                className="text-primary hover:text-primary/80"
              >
                {item.label}
              </a>
            )}
          </React.Fragment>
        ))}
      </nav>
    );
  }
);

Breadcrumbs.displayName = 'Breadcrumbs';

export { Navigation, Breadcrumbs };