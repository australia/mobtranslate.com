'use client';
import { Autocomplete } from '@mobtranslate/ui';
import { Section } from '../../../components/section';
import { ComponentPreview } from '../../../components/component-preview';

const fruits = [
  { value: 'apple', label: 'Apple' },
  { value: 'banana', label: 'Banana' },
  { value: 'cherry', label: 'Cherry' },
  { value: 'grape', label: 'Grape' },
  { value: 'mango', label: 'Mango' },
  { value: 'orange', label: 'Orange' },
  { value: 'peach', label: 'Peach' },
];

export default function AutocompletePage() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-2">Autocomplete</h1>
      <p className="text-lg text-[var(--color-muted-foreground)] mb-8">Text input with suggestion dropdown.</p>
      <Section title="Default">
        <ComponentPreview>
          <div className="max-w-sm">
            <Autocomplete options={fruits} placeholder="Search fruits..." />
          </div>
        </ComponentPreview>
      </Section>
    </div>
  );
}
