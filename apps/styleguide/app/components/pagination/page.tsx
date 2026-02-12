'use client';
import React from 'react';
import { Pagination, PaginationContent, PaginationItem, PaginationButton, PaginationPrevious, PaginationNext, PaginationEllipsis } from '@mobtranslate/ui';
import { Section } from '../../../components/section';
import { ComponentPreview } from '../../../components/component-preview';
import { PropsTable } from '../../../components/props-table';
import { CodeBlock } from '../../../components/code-block';

function PaginationDemo() {
  const [page, setPage] = React.useState(3);
  return (
    <Pagination>
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} />
        </PaginationItem>
        {[1, 2, 3, 4, 5].map((p) => (
          <PaginationItem key={p}>
            <PaginationButton isActive={p === page} onClick={() => setPage(p)}>
              {p}
            </PaginationButton>
          </PaginationItem>
        ))}
        <PaginationItem>
          <PaginationEllipsis />
        </PaginationItem>
        <PaginationItem>
          <PaginationButton onClick={() => setPage(10)}>10</PaginationButton>
        </PaginationItem>
        <PaginationItem>
          <PaginationNext onClick={() => setPage(Math.min(10, page + 1))} disabled={page === 10} />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}

export default function PaginationPage() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-2">Pagination</h1>
      <p className="text-lg text-[var(--color-muted-foreground)] mb-8">
        Navigate between pages of content with previous/next buttons and page numbers.
      </p>

      <Section title="Interactive Demo" description="Click page numbers or navigation buttons.">
        <ComponentPreview>
          <PaginationDemo />
        </ComponentPreview>
        <CodeBlock code={`<Pagination>
  <PaginationContent>
    <PaginationItem><PaginationPrevious /></PaginationItem>
    <PaginationItem><PaginationButton isActive>1</PaginationButton></PaginationItem>
    <PaginationItem><PaginationButton>2</PaginationButton></PaginationItem>
    <PaginationItem><PaginationButton>3</PaginationButton></PaginationItem>
    <PaginationItem><PaginationEllipsis /></PaginationItem>
    <PaginationItem><PaginationNext /></PaginationItem>
  </PaginationContent>
</Pagination>`} />
      </Section>

      <Section title="API Reference">
        <PropsTable props={[
          { name: 'isActive', type: 'boolean', default: 'false', description: 'Marks the current page button with active styling.' },
          { name: 'disabled', type: 'boolean', default: 'false', description: 'Disables navigation buttons.' },
        ]} />
      </Section>

      <Section title="Accessibility">
        <div className="border-2 border-[var(--color-border)] rounded-lg p-4 space-y-2">
          <p className="text-sm"><strong>nav element:</strong> Wrapped in nav with aria-label="Pagination".</p>
          <p className="text-sm"><strong>aria-current:</strong> Active page uses aria-current="page".</p>
          <p className="text-sm"><strong>Labeled buttons:</strong> Previous/Next have aria-label for screen readers.</p>
        </div>
      </Section>
    </div>
  );
}
