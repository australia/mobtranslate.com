'use client';
import { ScrollArea } from '@mobtranslate/ui';
import { Section } from '../../../components/section';
import { ComponentPreview } from '../../../components/component-preview';
import { PropsTable } from '../../../components/props-table';
import { CodeBlock } from '../../../components/code-block';

export default function ScrollAreaPage() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-2">Scroll Area</h1>
      <p className="text-lg text-[var(--color-muted-foreground)] mb-8">
        Custom scrollable container with styled scrollbars.
      </p>

      <Section title="Vertical Scroll" description="A fixed-height container with vertical scrolling.">
        <ComponentPreview>
          <ScrollArea className="h-48 w-full border border-[var(--color-border)] rounded-lg">
            <div className="p-4 space-y-4">
              {Array.from({ length: 20 }, (_, i) => (
                <p key={i} className="text-sm">Scrollable content item {i + 1}</p>
              ))}
            </div>
          </ScrollArea>
        </ComponentPreview>
        <CodeBlock code={`<ScrollArea className="h-48">
  <div className="p-4 space-y-4">
    {items.map((item, i) => (
      <p key={i}>{item}</p>
    ))}
  </div>
</ScrollArea>`} />
      </Section>

      <Section title="API Reference">
        <PropsTable props={[
          { name: 'children', type: 'React.ReactNode', default: '-', description: 'Scrollable content.' },
          { name: 'className', type: 'string', default: '-', description: 'Additional CSS classes for the root element.' },
        ]} />
      </Section>

      <Section title="Accessibility">
        <div className="border border-[var(--color-border)] rounded-lg p-4 space-y-2">
          <p className="text-sm"><strong>Scrollbar:</strong> Custom scrollbar is purely visual. Native scrolling behavior is preserved.</p>
          <p className="text-sm"><strong>Keyboard:</strong> Content is scrollable via arrow keys and Page Up/Down when focused.</p>
        </div>
      </Section>
    </div>
  );
}
