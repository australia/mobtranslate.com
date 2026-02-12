'use client';
import { Badge } from '@mobtranslate/ui';
import { Section } from '../../../components/section';
import { ComponentPreview } from '../../../components/component-preview';
import { PropsTable } from '../../../components/props-table';
import { CodeBlock } from '../../../components/code-block';

export default function BadgePage() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-2">Badge</h1>
      <p className="text-lg text-[var(--color-muted-foreground)] mb-8">
        Small status indicators for labeling, categorization, and notification counts.
      </p>

      <Section title="Variants" description="Seven visual variants for different semantic meanings.">
        <ComponentPreview>
          <div className="flex flex-wrap gap-3 items-center">
            <Badge variant="default">Default</Badge>
            <Badge variant="primary">Primary</Badge>
            <Badge variant="secondary">Secondary</Badge>
            <Badge variant="destructive">Destructive</Badge>
            <Badge variant="outline">Outline</Badge>
            <Badge variant="success">Success</Badge>
            <Badge variant="warning">Warning</Badge>
          </div>
        </ComponentPreview>
        <CodeBlock code={`<Badge variant="default">Default</Badge>
<Badge variant="primary">Primary</Badge>
<Badge variant="secondary">Secondary</Badge>
<Badge variant="destructive">Destructive</Badge>
<Badge variant="outline">Outline</Badge>
<Badge variant="success">Success</Badge>
<Badge variant="warning">Warning</Badge>`} />
      </Section>

      <Section title="Use Cases" description="Common badge usage patterns.">
        <ComponentPreview>
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="font-medium">Status:</span>
              <Badge variant="success">Active</Badge>
              <Badge variant="warning">Pending</Badge>
              <Badge variant="destructive">Inactive</Badge>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium">Categories:</span>
              <Badge variant="primary">React</Badge>
              <Badge variant="outline">TypeScript</Badge>
              <Badge variant="default">CSS</Badge>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium">Notifications:</span>
              <Badge variant="destructive">3</Badge>
              <Badge variant="primary">12</Badge>
              <Badge variant="default">99+</Badge>
            </div>
          </div>
        </ComponentPreview>
      </Section>

      <Section title="With Other Elements" description="Badges composed alongside other components.">
        <ComponentPreview>
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-base">
              Inbox <Badge variant="primary">5</Badge>
            </div>
            <div className="flex items-center gap-2 text-base">
              Pull Requests <Badge variant="success">Open</Badge>
            </div>
            <div className="flex items-center gap-2 text-base">
              Build Status <Badge variant="destructive">Failed</Badge>
            </div>
          </div>
        </ComponentPreview>
      </Section>

      <Section title="API Reference">
        <PropsTable props={[
          { name: 'variant', type: "'default' | 'primary' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'", default: "'default'", description: 'The visual style variant.' },
          { name: 'className', type: 'string', default: '-', description: 'Additional CSS classes merged via cn().' },
          { name: 'children', type: 'React.ReactNode', default: '-', description: 'The badge content.' },
        ]} />
      </Section>

      <Section title="Accessibility" description="Built-in accessibility features.">
        <div className="border-2 border-[var(--color-border)] rounded-lg p-4 space-y-2">
          <p className="text-sm"><strong>Semantics:</strong> Renders as a span element. Add role and aria-label when used for status indicators.</p>
          <p className="text-sm"><strong>Color contrast:</strong> All variants meet WCAG AA contrast requirements.</p>
        </div>
      </Section>
    </div>
  );
}
