'use client';
import { NumberField, NumberFieldGroup, NumberFieldInput, NumberFieldIncrement, NumberFieldDecrement } from '@mobtranslate/ui';
import { Section } from '../../../components/section';
import { ComponentPreview } from '../../../components/component-preview';
import { PropsTable } from '../../../components/props-table';

export default function NumberFieldPage() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-2">Number Field</h1>
      <p className="text-lg text-[var(--color-muted-foreground)] mb-8">
        A numeric input with increment/decrement buttons and keyboard step controls.
      </p>

      <Section title="Default" description="Basic number field with increment/decrement.">
        <ComponentPreview>
          <div className="max-w-xs">
            <NumberField defaultValue={5}>
              <NumberFieldGroup>
                <NumberFieldDecrement />
                <NumberFieldInput />
                <NumberFieldIncrement />
              </NumberFieldGroup>
            </NumberField>
          </div>
        </ComponentPreview>
      </Section>

      <Section title="With Min/Max" description="Constrained range.">
        <ComponentPreview>
          <div className="max-w-xs space-y-4">
            <div>
              <label className="mt-field-label mb-1 block">Quantity (1-10)</label>
              <NumberField defaultValue={1} min={1} max={10}>
                <NumberFieldGroup>
                  <NumberFieldDecrement />
                  <NumberFieldInput />
                  <NumberFieldIncrement />
                </NumberFieldGroup>
              </NumberField>
            </div>
          </div>
        </ComponentPreview>
      </Section>

      <Section title="API Reference">
        <PropsTable props={[
          { name: 'defaultValue', type: 'number', default: '-', description: 'Initial value.' },
          { name: 'value', type: 'number', default: '-', description: 'Controlled value.' },
          { name: 'min', type: 'number', default: '-', description: 'Minimum allowed value.' },
          { name: 'max', type: 'number', default: '-', description: 'Maximum allowed value.' },
          { name: 'step', type: 'number', default: '1', description: 'Step increment.' },
          { name: 'disabled', type: 'boolean', default: 'false', description: 'Prevents interaction.' },
          { name: 'onValueChange', type: '(value: number) => void', default: '-', description: 'Called when value changes.' },
        ]} />
      </Section>

      <Section title="Accessibility">
        <div className="border-2 border-[var(--color-border)] rounded-lg p-4 space-y-2">
          <p className="text-sm"><strong>Keyboard:</strong> Arrow Up/Down to increment/decrement. Page Up/Down for larger steps.</p>
          <p className="text-sm"><strong>ARIA:</strong> Uses spinbutton role with aria-valuemin, aria-valuemax, aria-valuenow.</p>
          <p className="text-sm"><strong>Scrub area:</strong> Optional mouse drag to scrub the value.</p>
        </div>
      </Section>
    </div>
  );
}
