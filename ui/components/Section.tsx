'use client';

import React from 'react';
import { cn } from '../lib/utils';
import { Container } from './Container';

export interface SectionProps extends React.HTMLAttributes<HTMLElement> {
  title?: string;
  description?: string;
  contained?: boolean;
  children: React.ReactNode;
}

export function Section({ className, title, description, contained = true, children, ...props }: SectionProps) {
    const content = (
      <div className="space-y-6">
        {(title || description) && (
          <div className="space-y-2">
            {title && (
              <h2 className="text-3xl font-bold font-crimson text-foreground">
                {title}
              </h2>
            )}
            {description && (
              <p className="text-lg text-muted-foreground font-source-sans">
                {description}
              </p>
            )}
          </div>
        )}
        {children}
      </div>
    );

    return (
      <section
        className={cn('py-8', className)}
        {...props}
      >
        {contained ? (
          <Container>
            {content}
          </Container>
        ) : (
          content
        )}
      </section>
    );
  }