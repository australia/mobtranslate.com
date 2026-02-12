'use client';
import { useState } from 'react';
import { RadioGroup, RadioItem } from '@mobtranslate/ui';
import { Section } from '../../../components/section';
import { ComponentPreview } from '../../../components/component-preview';
import { PropsTable } from '../../../components/props-table';
import { CodeBlock } from '../../../components/code-block';

export default function RadioPage() {
  const [plan, setPlan] = useState('standard');

  return (
    <div>
      <h1 className="text-4xl font-bold mb-2">Radio</h1>
      <p className="text-lg text-[var(--color-muted-foreground)] mb-8">
        A control that allows the user to select exactly one option from a set of
        mutually exclusive choices. Use RadioGroup to wrap RadioItem components.
      </p>

      {/* ------------------------------------------------------------------ */}
      <Section title="Basic Usage" description="A radio group with labeled options. Only one option can be selected at a time.">
        <ComponentPreview>
          <RadioGroup defaultValue="option-1">
            <RadioItem value="option-1" label="Option One" />
            <RadioItem value="option-2" label="Option Two" />
            <RadioItem value="option-3" label="Option Three" />
          </RadioGroup>
        </ComponentPreview>
        <CodeBlock code={`<RadioGroup defaultValue="option-1">
  <RadioItem value="option-1" label="Option One" />
  <RadioItem value="option-2" label="Option Two" />
  <RadioItem value="option-3" label="Option Three" />
</RadioGroup>`} />
      </Section>

      {/* ------------------------------------------------------------------ */}
      <Section title="Controlled" description="Use value and onValueChange for external state management.">
        <ComponentPreview>
          <div className="space-y-4">
            <RadioGroup value={plan} onValueChange={setPlan}>
              <RadioItem value="free" label="Free" />
              <RadioItem value="standard" label="Standard" />
              <RadioItem value="premium" label="Premium" />
            </RadioGroup>
            <p className="text-sm text-[var(--color-muted-foreground)]">
              Selected plan: <code className="font-mono bg-[var(--color-muted)] px-1 py-0.5 rounded">{plan}</code>
            </p>
            <div className="flex gap-2">
              {['free', 'standard', 'premium'].map((p) => (
                <button
                  key={p}
                  className="text-sm text-[var(--color-primary)] underline"
                  onClick={() => setPlan(p)}
                >
                  Select {p}
                </button>
              ))}
            </div>
          </div>
        </ComponentPreview>
        <CodeBlock code={`const [plan, setPlan] = useState('standard');

<RadioGroup value={plan} onValueChange={setPlan}>
  <RadioItem value="free" label="Free" />
  <RadioItem value="standard" label="Standard" />
  <RadioItem value="premium" label="Premium" />
</RadioGroup>
<p>Selected: {plan}</p>`} />
      </Section>

      {/* ------------------------------------------------------------------ */}
      <Section title="Disabled Items" description="Individual items or the entire group can be disabled.">
        <ComponentPreview>
          <div className="space-y-6">
            <div>
              <p className="mt-field-label mb-2">Partially disabled</p>
              <RadioGroup defaultValue="free">
                <RadioItem value="free" label="Free Plan" />
                <RadioItem value="pro" label="Pro Plan" />
                <RadioItem value="enterprise" label="Enterprise (Coming Soon)" disabled />
              </RadioGroup>
            </div>
            <div>
              <p className="mt-field-label mb-2">Entire group disabled</p>
              <RadioGroup defaultValue="a" disabled>
                <RadioItem value="a" label="Option A" />
                <RadioItem value="b" label="Option B" />
                <RadioItem value="c" label="Option C" />
              </RadioGroup>
            </div>
          </div>
        </ComponentPreview>
        <CodeBlock code={`{/* Individual item disabled */}
<RadioGroup defaultValue="free">
  <RadioItem value="free" label="Free Plan" />
  <RadioItem value="pro" label="Pro Plan" />
  <RadioItem value="enterprise" label="Enterprise" disabled />
</RadioGroup>

{/* Entire group disabled */}
<RadioGroup defaultValue="a" disabled>
  <RadioItem value="a" label="Option A" />
  <RadioItem value="b" label="Option B" />
</RadioGroup>`} />
      </Section>

      {/* ------------------------------------------------------------------ */}
      <Section title="With Descriptions" description="Add descriptions to each radio option for additional context.">
        <ComponentPreview>
          <div className="max-w-md">
            <p className="mt-field-label mb-3">Choose a plan</p>
            <RadioGroup defaultValue="starter">
              {[
                { value: 'starter', label: 'Starter', desc: 'Best for personal projects. Up to 3 team members.' },
                { value: 'business', label: 'Business', desc: 'For growing teams. Up to 20 team members with advanced analytics.' },
                { value: 'enterprise', label: 'Enterprise', desc: 'Unlimited team members, dedicated support, and custom integrations.' },
              ].map((option) => (
                <div key={option.value} className="flex items-start gap-0 py-2">
                  <RadioItem value={option.value} label={option.label} />
                  <p className="text-xs text-[var(--color-muted-foreground)] ml-0 mt-0.5 -translate-x-1">{option.desc}</p>
                </div>
              ))}
            </RadioGroup>
          </div>
        </ComponentPreview>
      </Section>

      {/* ------------------------------------------------------------------ */}
      <Section title="Card Selection Pattern" description="Radio buttons styled as selectable cards for a more visual selection experience.">
        <ComponentPreview>
          <RadioGroup defaultValue="standard" className="grid grid-cols-3 gap-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)' }}>
            {[
              { value: 'economy', label: 'Economy', desc: '5-7 business days', price: '$4.99' },
              { value: 'standard', label: 'Standard', desc: '3-5 business days', price: '$9.99' },
              { value: 'express', label: 'Express', desc: '1-2 business days', price: '$19.99' },
            ].map((option) => (
              <label key={option.value} className="border-2 border-[var(--color-border)] rounded-lg p-4 cursor-pointer hover:bg-[var(--color-muted)] transition-colors has-[:checked]:border-[var(--color-primary)]">
                <RadioItem value={option.value} label={option.label} />
                <p className="text-xs text-[var(--color-muted-foreground)] ml-7 mt-0.5">{option.desc}</p>
                <p className="text-sm font-semibold ml-7 mt-1">{option.price}</p>
              </label>
            ))}
          </RadioGroup>
        </ComponentPreview>
        <CodeBlock code={`<RadioGroup defaultValue="standard">
  {options.map((option) => (
    <label key={option.value} className="border-2 rounded-lg p-4 cursor-pointer">
      <RadioItem value={option.value} label={option.label} />
      <p className="text-xs ml-7">{option.desc}</p>
      <p className="font-semibold ml-7">{option.price}</p>
    </label>
  ))}
</RadioGroup>`} />
      </Section>

      {/* ------------------------------------------------------------------ */}
      <Section title="Horizontal Layout" description="Arrange radio items in a horizontal row for compact selections.">
        <ComponentPreview>
          <div className="space-y-4">
            <div>
              <p className="mt-field-label mb-2">Size</p>
              <RadioGroup defaultValue="md" style={{ display: 'flex', flexDirection: 'row', gap: '1rem' }}>
                <RadioItem value="sm" label="Small" />
                <RadioItem value="md" label="Medium" />
                <RadioItem value="lg" label="Large" />
                <RadioItem value="xl" label="Extra Large" />
              </RadioGroup>
            </div>
            <div>
              <p className="mt-field-label mb-2">Color</p>
              <RadioGroup defaultValue="blue" style={{ display: 'flex', flexDirection: 'row', gap: '1rem' }}>
                <RadioItem value="red" label="Red" />
                <RadioItem value="blue" label="Blue" />
                <RadioItem value="green" label="Green" />
              </RadioGroup>
            </div>
          </div>
        </ComponentPreview>
        <CodeBlock code={`<RadioGroup defaultValue="md" style={{ display: 'flex', flexDirection: 'row', gap: '1rem' }}>
  <RadioItem value="sm" label="Small" />
  <RadioItem value="md" label="Medium" />
  <RadioItem value="lg" label="Large" />
</RadioGroup>`} />
      </Section>

      {/* ------------------------------------------------------------------ */}
      <Section title="Form Integration" description="Radio groups integrate naturally with HTML forms via the name attribute.">
        <ComponentPreview>
          <div className="max-w-md space-y-4">
            <div className="flex flex-col gap-1.5">
              <p className="mt-field-label">Payment Method</p>
              <p className="mt-field-description">Select how you would like to pay.</p>
            </div>
            <RadioGroup defaultValue="card" name="payment">
              <RadioItem value="card" label="Credit / Debit Card" />
              <RadioItem value="paypal" label="PayPal" />
              <RadioItem value="bank" label="Bank Transfer" />
              <RadioItem value="crypto" label="Cryptocurrency" disabled />
            </RadioGroup>
          </div>
        </ComponentPreview>
      </Section>

      {/* ------------------------------------------------------------------ */}
      <Section title="API Reference">
        <h3 className="font-semibold mt-4 mb-2">RadioGroup</h3>
        <p className="text-sm text-[var(--color-muted-foreground)] mb-4">
          A container that manages radio selection state. Built on Base UI RadioGroup.
        </p>
        <PropsTable props={[
          { name: 'defaultValue', type: 'string', default: '-', description: 'Initially selected value for uncontrolled usage.' },
          { name: 'value', type: 'string', default: '-', description: 'Controlled selected value. Use with onValueChange for full control.' },
          { name: 'onValueChange', type: '(value: string) => void', default: '-', description: 'Callback fired when the selected value changes. Receives the new value string.' },
          { name: 'disabled', type: 'boolean', default: 'false', description: 'Disables all radio items within the group.' },
          { name: 'name', type: 'string', default: '-', description: 'The name attribute for form submission. Applied to all radio items in the group.' },
          { name: 'required', type: 'boolean', default: 'false', description: 'Marks the group as required for form validation.' },
          { name: 'className', type: 'string', default: '-', description: 'Additional CSS classes for the group container.' },
          { name: 'ref', type: 'React.Ref<HTMLDivElement>', default: '-', description: 'Forwarded ref to the group container element.' },
        ]} />
        <h3 className="font-semibold mt-8 mb-2">RadioItem</h3>
        <p className="text-sm text-[var(--color-muted-foreground)] mb-4">
          An individual radio option within a RadioGroup.
        </p>
        <PropsTable props={[
          { name: 'value', type: 'string', default: '-', description: 'The unique value of this radio option. Must be unique within the group.' },
          { name: 'label', type: 'string', default: '-', description: 'Text label displayed next to the radio indicator. Clicking the label selects the option.' },
          { name: 'disabled', type: 'boolean', default: 'false', description: 'Disables this specific radio item. Overrides the group disabled state.' },
          { name: 'className', type: 'string', default: '-', description: 'Additional CSS classes for the radio item.' },
          { name: 'ref', type: 'React.Ref<HTMLButtonElement>', default: '-', description: 'Forwarded ref to the radio button element.' },
        ]} />
      </Section>

      {/* ------------------------------------------------------------------ */}
      <Section title="Accessibility">
        <div className="border-2 border-[var(--color-border)] rounded-lg p-6 space-y-4">
          <div>
            <h3 className="font-semibold text-sm mb-1">ARIA Pattern</h3>
            <p className="text-sm text-[var(--color-muted-foreground)]">
              Implements the WAI-ARIA Radio Group pattern. The group uses <code className="font-mono bg-[var(--color-muted)] px-1 py-0.5 rounded">role="radiogroup"</code> and each item uses <code className="font-mono bg-[var(--color-muted)] px-1 py-0.5 rounded">role="radio"</code> with <code className="font-mono bg-[var(--color-muted)] px-1 py-0.5 rounded">aria-checked</code> managed automatically.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-sm mb-1">Keyboard Interaction</h3>
            <ul className="text-sm text-[var(--color-muted-foreground)] list-disc list-inside space-y-1">
              <li><kbd className="font-mono bg-[var(--color-muted)] px-1 py-0.5 rounded text-xs">Tab</kbd> moves focus into and out of the radio group. Focus lands on the selected item, or the first item if none is selected.</li>
              <li><kbd className="font-mono bg-[var(--color-muted)] px-1 py-0.5 rounded text-xs">Arrow Down</kbd> / <kbd className="font-mono bg-[var(--color-muted)] px-1 py-0.5 rounded text-xs">Arrow Right</kbd> moves focus to the next radio item and selects it.</li>
              <li><kbd className="font-mono bg-[var(--color-muted)] px-1 py-0.5 rounded text-xs">Arrow Up</kbd> / <kbd className="font-mono bg-[var(--color-muted)] px-1 py-0.5 rounded text-xs">Arrow Left</kbd> moves focus to the previous radio item and selects it.</li>
              <li><kbd className="font-mono bg-[var(--color-muted)] px-1 py-0.5 rounded text-xs">Space</kbd> selects the focused radio item if it is not already selected.</li>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold text-sm mb-1">Group Label</h3>
            <p className="text-sm text-[var(--color-muted-foreground)]">
              Always provide an accessible name for the radio group using a visible heading, <code className="font-mono bg-[var(--color-muted)] px-1 py-0.5 rounded">aria-label</code>, or <code className="font-mono bg-[var(--color-muted)] px-1 py-0.5 rounded">aria-labelledby</code> pointing to a heading element. This helps screen readers announce the context of the radio group.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-sm mb-1">Roving Focus</h3>
            <p className="text-sm text-[var(--color-muted-foreground)]">
              The radio group uses roving tabindex for keyboard navigation. Only the selected (or first) item is in the tab order, and arrow keys move focus between items. This follows the WAI-ARIA recommended pattern for radio groups.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-sm mb-1">Focus Visibility</h3>
            <p className="text-sm text-[var(--color-muted-foreground)]">
              A visible focus ring appears on keyboard navigation to meet WCAG 2.1 SC 2.4.7 (Focus Visible). Disabled items are skipped during keyboard navigation.
            </p>
          </div>
        </div>
      </Section>
    </div>
  );
}
