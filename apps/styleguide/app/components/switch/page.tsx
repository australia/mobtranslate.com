'use client';
import { useState } from 'react';
import { Switch } from '@mobtranslate/ui';
import { Section } from '../../../components/section';
import { ComponentPreview } from '../../../components/component-preview';
import { PropsTable } from '../../../components/props-table';
import { CodeBlock } from '../../../components/code-block';

export default function SwitchPage() {
  const [enabled, setEnabled] = useState(false);

  return (
    <div>
      <h1 className="text-4xl font-bold mb-2">Switch</h1>
      <p className="text-lg text-[var(--color-muted-foreground)] mb-8">
        A toggle control for binary on/off states. Use switches for settings that take
        effect immediately, as opposed to checkboxes which typically require form submission.
      </p>

      {/* ------------------------------------------------------------------ */}
      <Section title="Basic Usage" description="A simple switch with a label. Click the switch or its label to toggle.">
        <ComponentPreview>
          <div className="space-y-4">
            <Switch label="Enable notifications" />
            <Switch label="Dark mode" defaultChecked />
          </div>
        </ComponentPreview>
        <CodeBlock code={`<Switch label="Enable notifications" />
<Switch label="Dark mode" defaultChecked />`} />
      </Section>

      {/* ------------------------------------------------------------------ */}
      <Section title="All States" description="Switches can be off, on, disabled (in both states).">
        <ComponentPreview>
          <div className="space-y-4">
            <Switch label="Off (default)" />
            <Switch label="On" defaultChecked />
            <Switch label="Disabled - off" disabled />
            <Switch label="Disabled - on" disabled defaultChecked />
          </div>
        </ComponentPreview>
        <CodeBlock code={`<Switch label="Off (default)" />
<Switch label="On" defaultChecked />
<Switch label="Disabled - off" disabled />
<Switch label="Disabled - on" disabled defaultChecked />`} />
      </Section>

      {/* ------------------------------------------------------------------ */}
      <Section title="Controlled Switch" description="Use checked and onCheckedChange for external state management.">
        <ComponentPreview>
          <div className="space-y-4">
            <Switch
              label="Airplane mode"
              checked={enabled}
              onCheckedChange={setEnabled}
            />
            <p className="text-sm text-[var(--color-muted-foreground)]">
              Status: <code className="font-mono bg-[var(--color-muted)] px-1 py-0.5 rounded">{enabled ? 'ON' : 'OFF'}</code>
            </p>
            <button
              className="text-sm text-[var(--color-primary)] underline"
              onClick={() => setEnabled(!enabled)}
            >
              Toggle from outside
            </button>
          </div>
        </ComponentPreview>
        <CodeBlock code={`const [enabled, setEnabled] = useState(false);

<Switch
  label="Airplane mode"
  checked={enabled}
  onCheckedChange={setEnabled}
/>
<p>Status: {enabled ? 'ON' : 'OFF'}</p>`} />
      </Section>

      {/* ------------------------------------------------------------------ */}
      <Section title="Without Label" description="When using a standalone switch, always provide an aria-label for accessibility.">
        <ComponentPreview>
          <div className="flex items-center gap-6">
            <Switch aria-label="Toggle feature A" />
            <Switch aria-label="Toggle feature B" defaultChecked />
          </div>
        </ComponentPreview>
        <CodeBlock code={`<Switch aria-label="Toggle feature A" />
<Switch aria-label="Toggle feature B" defaultChecked />`} />
      </Section>

      {/* ------------------------------------------------------------------ */}
      <Section title="Settings Pattern" description="Switches arranged in a typical settings page layout with labels and descriptions.">
        <ComponentPreview>
          <div className="max-w-md space-y-0">
            {[
              { label: 'Email notifications', desc: 'Receive email updates about your account activity.', on: true },
              { label: 'Push notifications', desc: 'Get push notifications on your mobile device.', on: true },
              { label: 'SMS notifications', desc: 'Receive text messages for critical alerts only.', on: false },
              { label: 'Marketing emails', desc: 'Occasional product news and feature announcements.', on: false },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between py-4 border-b border-[var(--color-border)]">
                <div className="pr-4">
                  <p className="font-medium text-sm">{item.label}</p>
                  <p className="text-xs text-[var(--color-muted-foreground)] mt-0.5">{item.desc}</p>
                </div>
                <Switch defaultChecked={item.on} aria-label={item.label} />
              </div>
            ))}
          </div>
        </ComponentPreview>
        <CodeBlock code={`<div className="flex items-center justify-between py-4 border-b">
  <div>
    <p className="font-medium text-sm">Email notifications</p>
    <p className="text-xs text-muted">Receive email updates...</p>
  </div>
  <Switch defaultChecked aria-label="Email notifications" />
</div>`} />
      </Section>

      {/* ------------------------------------------------------------------ */}
      <Section title="Feature Toggles" description="Use switches for enabling or disabling features in a dashboard-style interface.">
        <ComponentPreview>
          <div className="max-w-md">
            <div className="border-2 border-[var(--color-border)] rounded-lg divide-y divide-[var(--color-border)]">
              {[
                { label: 'Two-factor authentication', desc: 'Add an extra layer of security to your account.', on: true },
                { label: 'Auto-save drafts', desc: 'Automatically save your work every 30 seconds.', on: true },
                { label: 'Developer mode', desc: 'Show advanced options and debug information.', on: false },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between p-4">
                  <div className="pr-4">
                    <p className="font-medium text-sm">{item.label}</p>
                    <p className="text-xs text-[var(--color-muted-foreground)] mt-0.5">{item.desc}</p>
                  </div>
                  <Switch defaultChecked={item.on} aria-label={item.label} />
                </div>
              ))}
            </div>
          </div>
        </ComponentPreview>
      </Section>

      {/* ------------------------------------------------------------------ */}
      <Section title="Compact Layout" description="Switches without labels in a compact horizontal layout, useful for toolbars.">
        <ComponentPreview>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Wi-Fi</span>
              <Switch defaultChecked aria-label="Wi-Fi" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Bluetooth</span>
              <Switch aria-label="Bluetooth" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">GPS</span>
              <Switch defaultChecked aria-label="GPS" />
            </div>
          </div>
        </ComponentPreview>
        <CodeBlock code={`<div className="flex items-center gap-2">
  <span className="text-sm font-medium">Wi-Fi</span>
  <Switch defaultChecked aria-label="Wi-Fi" />
</div>`} />
      </Section>

      {/* ------------------------------------------------------------------ */}
      <Section title="API Reference">
        <p className="text-sm text-[var(--color-muted-foreground)] mb-4">
          Built on Base UI Switch. Extends all native switch root props.
        </p>
        <PropsTable props={[
          { name: 'label', type: 'string', default: '-', description: 'Text label displayed next to the switch. Clicking the label toggles the switch.' },
          { name: 'defaultChecked', type: 'boolean', default: 'false', description: 'Initial checked state for uncontrolled usage.' },
          { name: 'checked', type: 'boolean', default: '-', description: 'Controlled checked state. Use with onCheckedChange for full control.' },
          { name: 'onCheckedChange', type: '(checked: boolean) => void', default: '-', description: 'Callback fired when the switch state changes. Receives the new boolean value.' },
          { name: 'disabled', type: 'boolean', default: 'false', description: 'Prevents all user interaction. Applies a muted visual style.' },
          { name: 'required', type: 'boolean', default: 'false', description: 'Marks the switch as required for form validation.' },
          { name: 'name', type: 'string', default: '-', description: 'The name attribute for form submission.' },
          { name: 'className', type: 'string', default: '-', description: 'Additional CSS classes appended to the switch root element.' },
        ]} />
      </Section>

      {/* ------------------------------------------------------------------ */}
      <Section title="Accessibility">
        <div className="border-2 border-[var(--color-border)] rounded-lg p-6 space-y-4">
          <div>
            <h3 className="font-semibold text-sm mb-1">Role</h3>
            <p className="text-sm text-[var(--color-muted-foreground)]">
              Renders as a <code className="font-mono bg-[var(--color-muted)] px-1 py-0.5 rounded">{'<button>'}</code> with <code className="font-mono bg-[var(--color-muted)] px-1 py-0.5 rounded">role="switch"</code> and manages <code className="font-mono bg-[var(--color-muted)] px-1 py-0.5 rounded">aria-checked</code> automatically. Screen readers announce the switch as a toggle control.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-sm mb-1">Labels</h3>
            <p className="text-sm text-[var(--color-muted-foreground)]">
              Always provide a visible <code className="font-mono bg-[var(--color-muted)] px-1 py-0.5 rounded">label</code> prop or an <code className="font-mono bg-[var(--color-muted)] px-1 py-0.5 rounded">aria-label</code> attribute. Without a label, screen readers cannot convey the purpose of the switch to the user.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-sm mb-1">Keyboard Interaction</h3>
            <ul className="text-sm text-[var(--color-muted-foreground)] list-disc list-inside space-y-1">
              <li><kbd className="font-mono bg-[var(--color-muted)] px-1 py-0.5 rounded text-xs">Space</kbd> toggles the switch when focused.</li>
              <li><kbd className="font-mono bg-[var(--color-muted)] px-1 py-0.5 rounded text-xs">Enter</kbd> toggles the switch when focused.</li>
              <li><kbd className="font-mono bg-[var(--color-muted)] px-1 py-0.5 rounded text-xs">Tab</kbd> moves focus to the next focusable element.</li>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold text-sm mb-1">Switch vs. Checkbox</h3>
            <p className="text-sm text-[var(--color-muted-foreground)]">
              Use a switch when the action takes effect immediately (like enabling a setting). Use a checkbox when the change requires a form submission to apply. Switches are semantically different from checkboxes and should not be used interchangeably.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-sm mb-1">Focus Visibility</h3>
            <p className="text-sm text-[var(--color-muted-foreground)]">
              A visible focus ring appears on keyboard navigation to meet WCAG 2.1 SC 2.4.7 (Focus Visible). The thumb animates between states to provide clear visual feedback.
            </p>
          </div>
        </div>
      </Section>
    </div>
  );
}
