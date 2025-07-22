'use client';

import React from 'react';
import { cn } from '../lib/utils';
import { Container } from './Container';

export interface PageHeaderProps {
  title: string;
  description?: string;
  children?: React.ReactNode;
  className?: string;
  badge?: React.ReactNode;
}

export function PageHeader({ title, description, children, className, badge }: PageHeaderProps) {
    return (
      <header className={cn('', className)}>
        <div className="py-8 sm:py-12">
          <div className="text-center space-y-4">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground">
              <span className="flex items-center justify-center gap-3 flex-wrap">
                {title}
                {badge}
              </span>
            </h1>
            {description && (
              <p className="text-lg sm:text-xl text-muted-foreground max-w-3xl mx-auto">
                {description}
              </p>
            )}
            {children}
          </div>
        </div>
      </header>
    );
  }