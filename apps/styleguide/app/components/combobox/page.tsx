'use client';
import { useState } from 'react';
import { Combobox } from '@mobtranslate/ui';
import { Section } from '../../../components/section';
import { ComponentPreview } from '../../../components/component-preview';

const countries = [
  { value: 'au', label: 'Australia' },
  { value: 'br', label: 'Brazil' },
  { value: 'ca', label: 'Canada' },
  { value: 'de', label: 'Germany' },
  { value: 'jp', label: 'Japan' },
  { value: 'uk', label: 'United Kingdom' },
  { value: 'us', label: 'United States' },
];

export default function ComboboxPage() {
  const [value, setValue] = useState('');
  return (
    <div>
      <h1 className="text-4xl font-bold mb-2">Combobox</h1>
      <p className="text-lg text-[var(--color-muted-foreground)] mb-8">Searchable selection dropdown.</p>
      <Section title="Default">
        <ComponentPreview>
          <div className="max-w-sm">
            <Combobox options={countries} value={value} onChange={setValue} placeholder="Select a country..." />
          </div>
        </ComponentPreview>
      </Section>
    </div>
  );
}
