'use client';
import React from 'react';
import { Rating } from '@mobtranslate/ui';
import { Section } from '../../../components/section';
import { ComponentPreview } from '../../../components/component-preview';
import { PropsTable } from '../../../components/props-table';
import { CodeBlock } from '../../../components/code-block';

function RatingDemo() {
  const [value, setValue] = React.useState(3);
  return (
    <div>
      <Rating value={value} onChange={setValue} />
      <p className="text-sm text-[var(--color-muted-foreground)] mt-2">Selected: {value} stars</p>
    </div>
  );
}

export default function RatingPage() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-2">Rating</h1>
      <p className="text-lg text-[var(--color-muted-foreground)] mb-8">
        Star-based rating input with hover preview and keyboard support.
      </p>

      <Section title="Interactive" description="Click or hover to select a rating.">
        <ComponentPreview>
          <RatingDemo />
        </ComponentPreview>
        <CodeBlock code={`const [value, setValue] = React.useState(3);
<Rating value={value} onChange={setValue} />`} />
      </Section>

      <Section title="Sizes" description="Three size variants.">
        <ComponentPreview>
          <div className="space-y-3">
            <div><label className="text-sm font-medium mr-3">Small</label><Rating value={4} size="sm" readOnly /></div>
            <div><label className="text-sm font-medium mr-3">Medium</label><Rating value={4} size="md" readOnly /></div>
            <div><label className="text-sm font-medium mr-3">Large</label><Rating value={4} size="lg" readOnly /></div>
          </div>
        </ComponentPreview>
      </Section>

      <Section title="Read Only" description="Display-only ratings without interaction.">
        <ComponentPreview>
          <div className="space-y-2">
            <Rating value={5} readOnly />
            <Rating value={3} readOnly />
            <Rating value={1} readOnly />
          </div>
        </ComponentPreview>
      </Section>

      <Section title="Custom Max" description="Change the number of stars.">
        <ComponentPreview>
          <Rating value={7} max={10} readOnly />
        </ComponentPreview>
      </Section>

      <Section title="API Reference">
        <PropsTable props={[
          { name: 'value', type: 'number', default: '0', description: 'Current rating value.' },
          { name: 'max', type: 'number', default: '5', description: 'Total number of stars.' },
          { name: 'size', type: "'sm' | 'md' | 'lg'", default: "'md'", description: 'Size of the stars.' },
          { name: 'readOnly', type: 'boolean', default: 'false', description: 'Disables interaction (display only).' },
          { name: 'onChange', type: '(value: number) => void', default: '-', description: 'Callback when rating changes.' },
        ]} />
      </Section>

      <Section title="Accessibility">
        <div className="border-2 border-[var(--color-border)] rounded-lg p-4 space-y-2">
          <p className="text-sm"><strong>Radio group:</strong> Uses role="radiogroup" with individual role="radio" buttons.</p>
          <p className="text-sm"><strong>Labels:</strong> Each star has an aria-label like "3 stars".</p>
        </div>
      </Section>
    </div>
  );
}
