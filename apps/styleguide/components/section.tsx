import React from 'react';

export function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="mb-12">
      <h2 className="text-2xl font-bold mb-2">{title}</h2>
      {description && <p className="text-[var(--color-muted-foreground)] mb-6">{description}</p>}
      {children}
    </section>
  );
}
