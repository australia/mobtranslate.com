'use client';
import { Autocomplete } from '@mobtranslate/ui';
import { Section } from '../../../components/section';
import { ComponentPreview } from '../../../components/component-preview';
import { PropsTable } from '../../../components/props-table';
import { CodeBlock } from '../../../components/code-block';

const fruits = [
  { value: 'apple', label: 'Apple' },
  { value: 'banana', label: 'Banana' },
  { value: 'cherry', label: 'Cherry' },
  { value: 'grape', label: 'Grape' },
  { value: 'mango', label: 'Mango' },
  { value: 'orange', label: 'Orange' },
  { value: 'peach', label: 'Peach' },
  { value: 'strawberry', label: 'Strawberry' },
];

export default function AutocompletePage() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-2">Autocomplete</h1>
      <p className="text-lg text-[var(--color-muted-foreground)] mb-8">
        Text input with filtered suggestion dropdown for selecting from a list.
      </p>

      <Section title="Default" description="Type to filter suggestions from the list.">
        <ComponentPreview>
          <div className="max-w-sm">
            <Autocomplete options={fruits} placeholder="Search fruits..." />
          </div>
        </ComponentPreview>
        <CodeBlock code={`<Autocomplete
  options={[
    { value: 'apple', label: 'Apple' },
    { value: 'banana', label: 'Banana' },
    { value: 'cherry', label: 'Cherry' },
  ]}
  placeholder="Search fruits..."
/>`} />
      </Section>

      <Section title="API Reference">
        <PropsTable props={[
          { name: 'options', type: '{ value: string; label: string }[]', default: '-', description: 'Array of options to display and filter.' },
          { name: 'placeholder', type: 'string', default: '-', description: 'Placeholder text for the input.' },
          { name: 'value', type: 'string', default: '-', description: 'Controlled selected value.' },
          { name: 'onChange', type: '(value: string) => void', default: '-', description: 'Called when an option is selected.' },
          { name: 'className', type: 'string', default: '-', description: 'Additional CSS classes for the root element.' },
        ]} />
      </Section>

      <Section title="Accessibility">
        <div className="border border-[var(--color-border)] rounded-lg p-4 space-y-2">
          <p className="text-sm"><strong>ARIA:</strong> Uses combobox role with listbox popup. Options use option role with aria-selected.</p>
          <p className="text-sm"><strong>Keyboard:</strong> Arrow keys navigate suggestions. Enter selects. Escape closes the dropdown.</p>
          <p className="text-sm"><strong>Screen readers:</strong> Announces the number of available results as the user types.</p>
        </div>
      </Section>
    </div>
  );
}
