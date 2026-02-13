'use client';
import { useState } from 'react';
import { Combobox } from '@mobtranslate/ui';
import { Section } from '../../../components/section';
import { ComponentPreview } from '../../../components/component-preview';
import { PropsTable } from '../../../components/props-table';
import { CodeBlock } from '../../../components/code-block';

const countries = [
  { value: 'au', label: 'Australia' },
  { value: 'br', label: 'Brazil' },
  { value: 'ca', label: 'Canada' },
  { value: 'de', label: 'Germany' },
  { value: 'jp', label: 'Japan' },
  { value: 'mx', label: 'Mexico' },
  { value: 'uk', label: 'United Kingdom' },
  { value: 'us', label: 'United States' },
];

export default function ComboboxPage() {
  const [value, setValue] = useState('');

  return (
    <div>
      <h1 className="text-4xl font-bold mb-2">Combobox</h1>
      <p className="text-lg text-[var(--color-muted-foreground)] mb-8">
        Searchable dropdown for selecting from a list with keyboard support.
      </p>

      <Section title="Default" description="Type to search and filter the dropdown list.">
        <ComponentPreview>
          <div className="max-w-sm">
            <Combobox options={countries} value={value} onChange={setValue} placeholder="Select a country..." />
          </div>
        </ComponentPreview>
        <CodeBlock code={`const [value, setValue] = useState('');

<Combobox
  options={[
    { value: 'au', label: 'Australia' },
    { value: 'br', label: 'Brazil' },
    { value: 'ca', label: 'Canada' },
  ]}
  value={value}
  onChange={setValue}
  placeholder="Select a country..."
/>`} />
      </Section>

      <Section title="API Reference">
        <PropsTable props={[
          { name: 'options', type: '{ value: string; label: string }[]', default: '-', description: 'Array of selectable options.' },
          { name: 'value', type: 'string', default: '-', description: 'Controlled selected value.' },
          { name: 'onChange', type: '(value: string) => void', default: '-', description: 'Called when an option is selected.' },
          { name: 'placeholder', type: 'string', default: '-', description: 'Placeholder text for the input.' },
          { name: 'className', type: 'string', default: '-', description: 'Additional CSS classes.' },
        ]} />
      </Section>

      <Section title="Accessibility">
        <div className="border border-[var(--color-border)] rounded-lg p-4 space-y-2">
          <p className="text-sm"><strong>ARIA:</strong> Uses combobox role with listbox popup. The selected option has aria-selected.</p>
          <p className="text-sm"><strong>Keyboard:</strong> Arrow keys navigate. Enter selects. Escape closes. Type to filter results.</p>
          <p className="text-sm"><strong>Focus:</strong> Focus returns to the input when the dropdown closes.</p>
        </div>
      </Section>
    </div>
  );
}
