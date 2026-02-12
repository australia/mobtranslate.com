'use client';
import React from 'react';
import { Chip } from '@mobtranslate/ui';
import { Section } from '../../../components/section';
import { ComponentPreview } from '../../../components/component-preview';
import { PropsTable } from '../../../components/props-table';
import { CodeBlock } from '../../../components/code-block';

export default function ChipPage() {
  const [chips, setChips] = React.useState(['React', 'TypeScript', 'Tailwind', 'Base UI']);

  return (
    <div>
      <h1 className="text-4xl font-bold mb-2">Chip</h1>
      <p className="text-lg text-[var(--color-muted-foreground)] mb-8">
        Compact elements representing tags, attributes, or actions.
      </p>

      <Section title="Variants" description="Three visual variants for different contexts.">
        <ComponentPreview>
          <div className="flex flex-wrap gap-2">
            <Chip variant="filled">Filled</Chip>
            <Chip variant="outlined">Outlined</Chip>
            <Chip variant="soft">Soft</Chip>
          </div>
        </ComponentPreview>
        <CodeBlock code={`<Chip variant="filled">Filled</Chip>
<Chip variant="outlined">Outlined</Chip>
<Chip variant="soft">Soft</Chip>`} />
      </Section>

      <Section title="Colors" description="Semantic color options for each variant.">
        <ComponentPreview>
          <div className="space-y-3">
            {(['filled', 'outlined', 'soft'] as const).map((variant) => (
              <div key={variant} className="flex flex-wrap gap-2">
                <Chip variant={variant} color="default">Default</Chip>
                <Chip variant={variant} color="primary">Primary</Chip>
                <Chip variant={variant} color="success">Success</Chip>
                <Chip variant={variant} color="warning">Warning</Chip>
                <Chip variant={variant} color="error">Error</Chip>
              </div>
            ))}
          </div>
        </ComponentPreview>
      </Section>

      <Section title="Sizes" description="Three sizes: sm, md, lg.">
        <ComponentPreview>
          <div className="flex items-center gap-2">
            <Chip size="sm">Small</Chip>
            <Chip size="md">Medium</Chip>
            <Chip size="lg">Large</Chip>
          </div>
        </ComponentPreview>
      </Section>

      <Section title="Deletable" description="Chips with a delete button for tag management.">
        <ComponentPreview>
          <div className="flex flex-wrap gap-2">
            {chips.map((chip) => (
              <Chip key={chip} variant="outlined" onDelete={() => setChips(chips.filter((c) => c !== chip))}>
                {chip}
              </Chip>
            ))}
          </div>
        </ComponentPreview>
      </Section>

      <Section title="API Reference">
        <PropsTable props={[
          { name: 'variant', type: "'filled' | 'outlined' | 'soft'", default: "'filled'", description: 'Visual style of the chip.' },
          { name: 'color', type: "'default' | 'primary' | 'success' | 'warning' | 'error'", default: "'default'", description: 'Semantic color.' },
          { name: 'size', type: "'sm' | 'md' | 'lg'", default: "'md'", description: 'Size of the chip.' },
          { name: 'onDelete', type: '() => void', default: '-', description: 'If provided, shows a delete button.' },
        ]} />
      </Section>
    </div>
  );
}
