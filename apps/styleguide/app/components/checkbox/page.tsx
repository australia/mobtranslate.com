'use client';
import { useState } from 'react';
import { Checkbox, CheckboxGroup } from '@mobtranslate/ui';
import { Section } from '../../../components/section';
import { ComponentPreview } from '../../../components/component-preview';
import { PropsTable } from '../../../components/props-table';
import { CodeBlock } from '../../../components/code-block';

export default function CheckboxPage() {
  const [checked, setChecked] = useState(false);
  const [items, setItems] = useState<string[]>(['design']);

  return (
    <div>
      <h1 className="text-4xl font-bold mb-2">Checkbox</h1>
      <p className="text-lg text-[var(--color-muted-foreground)] mb-8">
        A control that allows users to select one or more items from a set, or toggle
        a single boolean option on or off.
      </p>

      {/* ------------------------------------------------------------------ */}
      <Section title="Basic Usage" description="A simple checkbox with a label. Click the checkbox or its label to toggle.">
        <ComponentPreview>
          <div className="space-y-3">
            <Checkbox label="Accept terms and conditions" />
            <Checkbox label="Subscribe to newsletter" defaultChecked />
          </div>
        </ComponentPreview>
        <CodeBlock code={`<Checkbox label="Accept terms and conditions" />
<Checkbox label="Subscribe to newsletter" defaultChecked />`} />
      </Section>

      {/* ------------------------------------------------------------------ */}
      <Section title="All States" description="Checkboxes can be unchecked, checked, disabled (in both states), and used without a label.">
        <ComponentPreview>
          <div className="space-y-3">
            <Checkbox label="Unchecked (default)" />
            <Checkbox label="Checked" defaultChecked />
            <Checkbox label="Disabled - unchecked" disabled />
            <Checkbox label="Disabled - checked" disabled defaultChecked />
          </div>
        </ComponentPreview>
        <CodeBlock code={`<Checkbox label="Unchecked (default)" />
<Checkbox label="Checked" defaultChecked />
<Checkbox label="Disabled - unchecked" disabled />
<Checkbox label="Disabled - checked" disabled defaultChecked />`} />
      </Section>

      {/* ------------------------------------------------------------------ */}
      <Section title="Controlled Checkbox" description="Use checked and onCheckedChange for full control over the checkbox state.">
        <ComponentPreview>
          <div className="space-y-3">
            <Checkbox
              label="I agree to the terms"
              checked={checked}
              onCheckedChange={(val) => setChecked(val as boolean)}
            />
            <p className="text-sm text-[var(--color-muted-foreground)]">
              Checked: <code className="font-mono bg-[var(--color-muted)] px-1 py-0.5 rounded">{String(checked)}</code>
            </p>
            <button
              className="text-sm text-[var(--color-primary)] underline"
              onClick={() => setChecked(!checked)}
            >
              Toggle from outside
            </button>
          </div>
        </ComponentPreview>
        <CodeBlock code={`const [checked, setChecked] = useState(false);

<Checkbox
  label="I agree to the terms"
  checked={checked}
  onCheckedChange={(val) => setChecked(val as boolean)}
/>
<p>Checked: {String(checked)}</p>`} />
      </Section>

      {/* ------------------------------------------------------------------ */}
      <Section title="Checkbox Group" description="Use CheckboxGroup to group related checkboxes together. All checkboxes within a group share the same group context.">
        <ComponentPreview>
          <div>
            <p className="mt-field-label mb-3">Select your interests:</p>
            <CheckboxGroup>
              <Checkbox label="Design" name="interests" value="design" />
              <Checkbox label="Development" name="interests" value="development" />
              <Checkbox label="Marketing" name="interests" value="marketing" />
              <Checkbox label="Analytics" name="interests" value="analytics" />
            </CheckboxGroup>
          </div>
        </ComponentPreview>
        <CodeBlock code={`<CheckboxGroup>
  <Checkbox label="Design" name="interests" value="design" />
  <Checkbox label="Development" name="interests" value="dev" />
  <Checkbox label="Marketing" name="interests" value="marketing" />
  <Checkbox label="Analytics" name="interests" value="analytics" />
</CheckboxGroup>`} />
      </Section>

      {/* ------------------------------------------------------------------ */}
      <Section title="Without Label" description="When using a standalone checkbox (e.g., in a table row), always provide an aria-label for accessibility.">
        <ComponentPreview>
          <div className="flex items-center gap-6">
            <Checkbox aria-label="Select row 1" />
            <Checkbox aria-label="Select row 2" defaultChecked />
            <Checkbox aria-label="Select row 3" />
          </div>
        </ComponentPreview>
        <CodeBlock code={`<Checkbox aria-label="Select row 1" />
<Checkbox aria-label="Select row 2" defaultChecked />`} />
      </Section>

      {/* ------------------------------------------------------------------ */}
      <Section title="Form Integration" description="Checkboxes work with native HTML forms via the name and value props.">
        <ComponentPreview>
          <div className="max-w-md space-y-4">
            <div className="flex flex-col gap-1.5">
              <p className="mt-field-label">Notification Preferences</p>
              <p className="mt-field-description">Choose which notifications you want to receive.</p>
            </div>
            <CheckboxGroup>
              <Checkbox label="Email notifications" name="notifications" value="email" defaultChecked />
              <Checkbox label="Push notifications" name="notifications" value="push" defaultChecked />
              <Checkbox label="SMS notifications" name="notifications" value="sms" />
              <Checkbox label="In-app notifications" name="notifications" value="inapp" defaultChecked />
            </CheckboxGroup>
          </div>
        </ComponentPreview>
        <CodeBlock code={`<CheckboxGroup>
  <Checkbox label="Email notifications" name="notifications" value="email" defaultChecked />
  <Checkbox label="Push notifications" name="notifications" value="push" defaultChecked />
  <Checkbox label="SMS notifications" name="notifications" value="sms" />
  <Checkbox label="In-app notifications" name="notifications" value="inapp" defaultChecked />
</CheckboxGroup>`} />
      </Section>

      {/* ------------------------------------------------------------------ */}
      <Section title="Settings Pattern" description="Checkboxes in a settings-style layout with descriptions.">
        <ComponentPreview>
          <div className="max-w-md">
            {[
              { label: 'Activity notifications', desc: 'Get notified when someone comments on your posts.' },
              { label: 'Security alerts', desc: 'Receive alerts about unusual sign-in activity.' },
              { label: 'Product updates', desc: 'News about product and feature updates.' },
              { label: 'Marketing emails', desc: 'Receive tips, offers, and promotions.' },
            ].map((item, i) => (
              <div key={item.label} className="flex items-start gap-3 py-3 border-b border-[var(--color-border)]">
                <Checkbox defaultChecked={i < 2} aria-label={item.label} />
                <div>
                  <p className="font-medium text-sm">{item.label}</p>
                  <p className="text-xs text-[var(--color-muted-foreground)]">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </ComponentPreview>
      </Section>

      {/* ------------------------------------------------------------------ */}
      <Section title="API Reference">
        <h3 className="font-semibold mt-4 mb-2">Checkbox</h3>
        <p className="text-sm text-[var(--color-muted-foreground)] mb-4">
          Built on Base UI Checkbox. Extends all native checkbox root props.
        </p>
        <PropsTable props={[
          { name: 'label', type: 'string', default: '-', description: 'Text label displayed next to the checkbox. Clicking the label toggles the checkbox.' },
          { name: 'defaultChecked', type: 'boolean', default: 'false', description: 'Whether the checkbox is checked on initial render (uncontrolled mode).' },
          { name: 'checked', type: 'boolean', default: '-', description: 'Controlled checked state. Use with onCheckedChange for full control.' },
          { name: 'onCheckedChange', type: '(checked: boolean | "indeterminate") => void', default: '-', description: 'Callback fired when the checked state changes. Receives the new checked value.' },
          { name: 'disabled', type: 'boolean', default: 'false', description: 'Prevents all user interaction. Applies a muted visual style.' },
          { name: 'required', type: 'boolean', default: 'false', description: 'Marks the checkbox as required for form validation.' },
          { name: 'name', type: 'string', default: '-', description: 'The name attribute for form submission.' },
          { name: 'value', type: 'string', default: '-', description: 'The value attribute for form submission. Useful in checkbox groups.' },
          { name: 'className', type: 'string', default: '-', description: 'Additional CSS classes appended to the checkbox root element.' },
        ]} />
        <h3 className="font-semibold mt-8 mb-2">CheckboxGroup</h3>
        <p className="text-sm text-[var(--color-muted-foreground)] mb-4">
          A container that groups related Checkbox components together.
        </p>
        <PropsTable props={[
          { name: 'children', type: 'React.ReactNode', default: '-', description: 'Checkbox components to group together.' },
          { name: 'disabled', type: 'boolean', default: 'false', description: 'Disables all checkboxes within the group.' },
          { name: 'className', type: 'string', default: '-', description: 'Additional CSS classes for the group container.' },
        ]} />
      </Section>

      {/* ------------------------------------------------------------------ */}
      <Section title="Accessibility">
        <div className="border-2 border-[var(--color-border)] rounded-lg p-6 space-y-4">
          <div>
            <h3 className="font-semibold text-sm mb-1">Labels</h3>
            <p className="text-sm text-[var(--color-muted-foreground)]">
              Always provide a visible <code className="font-mono bg-[var(--color-muted)] px-1 py-0.5 rounded">label</code> prop or an <code className="font-mono bg-[var(--color-muted)] px-1 py-0.5 rounded">aria-label</code> attribute for screen readers. The label prop wraps the checkbox in a <code className="font-mono bg-[var(--color-muted)] px-1 py-0.5 rounded">{'<label>'}</code> element for click-to-toggle behavior.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-sm mb-1">Keyboard Interaction</h3>
            <ul className="text-sm text-[var(--color-muted-foreground)] list-disc list-inside space-y-1">
              <li><kbd className="font-mono bg-[var(--color-muted)] px-1 py-0.5 rounded text-xs">Space</kbd> toggles the checkbox when focused.</li>
              <li><kbd className="font-mono bg-[var(--color-muted)] px-1 py-0.5 rounded text-xs">Tab</kbd> moves focus to the next focusable element.</li>
              <li><kbd className="font-mono bg-[var(--color-muted)] px-1 py-0.5 rounded text-xs">Shift+Tab</kbd> moves focus to the previous focusable element.</li>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold text-sm mb-1">ARIA Roles</h3>
            <p className="text-sm text-[var(--color-muted-foreground)]">
              Renders with <code className="font-mono bg-[var(--color-muted)] px-1 py-0.5 rounded">role="checkbox"</code> and manages <code className="font-mono bg-[var(--color-muted)] px-1 py-0.5 rounded">aria-checked</code> automatically. Disabled checkboxes include <code className="font-mono bg-[var(--color-muted)] px-1 py-0.5 rounded">aria-disabled="true"</code>.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-sm mb-1">Groups</h3>
            <p className="text-sm text-[var(--color-muted-foreground)]">
              When using CheckboxGroup, provide a group label using a visible heading or <code className="font-mono bg-[var(--color-muted)] px-1 py-0.5 rounded">aria-label</code> on the group so screen readers can announce the group context. The group uses <code className="font-mono bg-[var(--color-muted)] px-1 py-0.5 rounded">role="group"</code>.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-sm mb-1">Focus Visibility</h3>
            <p className="text-sm text-[var(--color-muted-foreground)]">
              A visible focus ring appears on keyboard navigation to meet WCAG 2.1 SC 2.4.7 (Focus Visible). The focus indicator has sufficient contrast against the background.
            </p>
          </div>
        </div>
      </Section>
    </div>
  );
}
