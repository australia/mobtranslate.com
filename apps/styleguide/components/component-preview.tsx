import React from 'react';

export function ComponentPreview({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`border-2 border-[var(--color-border)] rounded-lg p-6 bg-[var(--color-background)] ${className || ''}`}>
      {children}
    </div>
  );
}
