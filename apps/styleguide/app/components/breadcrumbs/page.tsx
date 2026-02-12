'use client';
import { Breadcrumbs, BreadcrumbLink, BreadcrumbPage } from '@mobtranslate/ui';
import { Section } from '../../../components/section';
import { ComponentPreview } from '../../../components/component-preview';
import { PropsTable } from '../../../components/props-table';
import { CodeBlock } from '../../../components/code-block';

export default function BreadcrumbsPage() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-2">Breadcrumbs</h1>
      <p className="text-lg text-[var(--color-muted-foreground)] mb-8">
        Navigation breadcrumbs showing the user{"'"}s current location in a hierarchy.
      </p>

      <Section title="Basic" description="Default breadcrumbs with chevron separator.">
        <ComponentPreview>
          <Breadcrumbs>
            <BreadcrumbLink href="#">Home</BreadcrumbLink>
            <BreadcrumbLink href="#">Products</BreadcrumbLink>
            <BreadcrumbPage>Widget Pro</BreadcrumbPage>
          </Breadcrumbs>
        </ComponentPreview>
        <CodeBlock code={`<Breadcrumbs>
  <BreadcrumbLink href="/">Home</BreadcrumbLink>
  <BreadcrumbLink href="/products">Products</BreadcrumbLink>
  <BreadcrumbPage>Widget Pro</BreadcrumbPage>
</Breadcrumbs>`} />
      </Section>

      <Section title="Custom Separator" description="Use any React node as separator.">
        <ComponentPreview>
          <Breadcrumbs separator="/">
            <BreadcrumbLink href="#">Home</BreadcrumbLink>
            <BreadcrumbLink href="#">Docs</BreadcrumbLink>
            <BreadcrumbPage>Components</BreadcrumbPage>
          </Breadcrumbs>
        </ComponentPreview>
      </Section>

      <Section title="API Reference">
        <PropsTable props={[
          { name: 'separator', type: 'React.ReactNode', default: 'Chevron SVG', description: 'Custom separator between breadcrumb items.' },
          { name: 'className', type: 'string', default: '-', description: 'Additional CSS classes.' },
        ]} />
      </Section>

      <Section title="Accessibility">
        <div className="border-2 border-[var(--color-border)] rounded-lg p-4 space-y-2">
          <p className="text-sm"><strong>nav element:</strong> Wraps in a nav with aria-label="Breadcrumb".</p>
          <p className="text-sm"><strong>aria-current:</strong> The current page uses aria-current="page" for screen readers.</p>
          <p className="text-sm"><strong>Separators:</strong> Marked aria-hidden="true" to avoid screen reader noise.</p>
        </div>
      </Section>
    </div>
  );
}
