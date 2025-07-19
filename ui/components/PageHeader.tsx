'use client';

import React from 'react';
import { cn } from '../lib/utils';
import { Container } from './Container';

export interface PageHeaderProps {
  title: string;
  description?: string;
  children?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, description, children, className }: PageHeaderProps) {
    return (
      <header className={cn('bg-card border-b border-border', className)}>
        <Container className="py-8">
          <div className="text-center space-y-4">
            <h1 className="text-4xl font-bold font-crimson text-foreground">
              {title}
            </h1>
            {description && (
              <p className="text-xl text-muted-foreground max-w-3xl mx-auto font-source-sans">
                {description}
              </p>
            )}
            {children}
          </div>
        </Container>
      </header>
    );
  }