import React from 'react';

export function Section({ title, description, children, id }: { title: string; description?: string; children: React.ReactNode; id?: string }) {
  const sectionId = id ?? title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return (
    <section className="mb-12 scroll-mt-6" aria-labelledby={sectionId}>
      <h2 id={sectionId} className="text-2xl font-bold mb-2 scroll-mt-6"><a href={`#${sectionId}`} className="section-anchor">{title}<span aria-hidden="true" className="anchor-mark"> #</span></a></h2>
      {description && <p className="text-[var(--color-muted-foreground)] mb-6">{description}</p>}
      {children}
    </section>
  );
}
