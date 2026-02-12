'use client';
import { useState } from 'react';
import { Input } from '@mobtranslate/ui';
import { Section } from '../../../components/section';
import { ComponentPreview } from '../../../components/component-preview';
import { PropsTable } from '../../../components/props-table';
import { CodeBlock } from '../../../components/code-block';

export default function InputPage() {
  const [controlled, setControlled] = useState('Hello world');

  return (
    <div>
      <h1 className="text-4xl font-bold mb-2">Input</h1>
      <p className="text-lg text-[var(--color-muted-foreground)] mb-8">
        Text input field for capturing user data. Supports all native HTML input types
        and can be composed with labels, descriptions, and validation messages.
      </p>

      {/* ------------------------------------------------------------------ */}
      <Section title="Basic Usage" description="A simple text input with placeholder text.">
        <ComponentPreview>
          <div className="max-w-sm">
            <Input placeholder="Enter your name" />
          </div>
        </ComponentPreview>
        <CodeBlock code={`<Input placeholder="Enter your name" />`} />
      </Section>

      {/* ------------------------------------------------------------------ */}
      <Section title="Input Types" description="The component supports all native HTML input types via the type prop.">
        <ComponentPreview>
          <div className="max-w-sm space-y-3">
            <div className="flex flex-col gap-1.5">
              <label className="mt-field-label">Text</label>
              <Input type="text" placeholder="Plain text" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="mt-field-label">Email</label>
              <Input type="email" placeholder="user@example.com" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="mt-field-label">Password</label>
              <Input type="password" placeholder="Enter password" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="mt-field-label">Number</label>
              <Input type="number" placeholder="0" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="mt-field-label">Search</label>
              <Input type="search" placeholder="Search..." />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="mt-field-label">URL</label>
              <Input type="url" placeholder="https://example.com" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="mt-field-label">Telephone</label>
              <Input type="tel" placeholder="+1 (555) 000-0000" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="mt-field-label">Date</label>
              <Input type="date" />
            </div>
          </div>
        </ComponentPreview>
        <CodeBlock code={`<Input type="text" placeholder="Plain text" />
<Input type="email" placeholder="user@example.com" />
<Input type="password" placeholder="Enter password" />
<Input type="number" placeholder="0" />
<Input type="search" placeholder="Search..." />
<Input type="url" placeholder="https://example.com" />
<Input type="tel" placeholder="+1 (555) 000-0000" />
<Input type="date" />`} />
      </Section>

      {/* ------------------------------------------------------------------ */}
      <Section title="States" description="Inputs support disabled, read-only, and pre-filled value states.">
        <ComponentPreview>
          <div className="max-w-sm space-y-3">
            <div className="flex flex-col gap-1.5">
              <label className="mt-field-label">Default</label>
              <Input placeholder="Editable input" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="mt-field-label">With Value</label>
              <Input defaultValue="Pre-filled value" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="mt-field-label">Disabled</label>
              <Input placeholder="Cannot interact" disabled />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="mt-field-label">Disabled with Value</label>
              <Input value="Disabled content" disabled />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="mt-field-label">Read-Only</label>
              <Input value="Read-only content" readOnly />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="mt-field-label">Required</label>
              <Input placeholder="This field is required" required />
            </div>
          </div>
        </ComponentPreview>
        <CodeBlock code={`<Input placeholder="Editable input" />
<Input defaultValue="Pre-filled value" />
<Input placeholder="Cannot interact" disabled />
<Input value="Disabled content" disabled />
<Input value="Read-only content" readOnly />
<Input placeholder="This field is required" required />`} />
      </Section>

      {/* ------------------------------------------------------------------ */}
      <Section title="Controlled Input" description="Use the value and onChange props to control the input state externally.">
        <ComponentPreview>
          <div className="max-w-sm space-y-3">
            <Input
              value={controlled}
              onChange={(e) => setControlled(e.target.value)}
              placeholder="Type here..."
            />
            <p className="text-sm text-[var(--color-muted-foreground)]">
              Current value: <code className="font-mono bg-[var(--color-muted)] px-1 py-0.5 rounded">{controlled}</code>
            </p>
            <p className="text-sm text-[var(--color-muted-foreground)]">
              Character count: {controlled.length}
            </p>
          </div>
        </ComponentPreview>
        <CodeBlock code={`const [value, setValue] = useState('Hello world');

<Input
  value={value}
  onChange={(e) => setValue(e.target.value)}
  placeholder="Type here..."
/>
<p>Current value: {value}</p>`} />
      </Section>

      {/* ------------------------------------------------------------------ */}
      <Section title="With Labels and Descriptions" description="Compose with label elements and helper text to create complete form fields. For production use, consider the Field component.">
        <ComponentPreview>
          <div className="max-w-sm space-y-6">
            <div className="flex flex-col gap-1.5">
              <label className="mt-field-label">Full Name</label>
              <Input placeholder="John Doe" />
              <p className="mt-field-description">Enter your legal first and last name.</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="mt-field-label">Email Address</label>
              <Input type="email" placeholder="john@example.com" />
              <p className="mt-field-description">We will never share your email with third parties.</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="mt-field-label">Password</label>
              <Input type="password" placeholder="Create a strong password" />
              <p className="mt-field-description">Must be at least 8 characters with one uppercase letter and one number.</p>
            </div>
          </div>
        </ComponentPreview>
        <CodeBlock code={`<div className="flex flex-col gap-1.5">
  <label className="mt-field-label">Email Address</label>
  <Input type="email" placeholder="john@example.com" />
  <p className="mt-field-description">
    We will never share your email with third parties.
  </p>
</div>`} />
      </Section>

      {/* ------------------------------------------------------------------ */}
      <Section title="Form Layout Patterns" description="Common layout patterns using Input with other form elements.">
        <ComponentPreview>
          <div className="max-w-lg space-y-6">
            {/* Inline fields */}
            <div>
              <p className="mt-field-label mb-3">Inline Fields</p>
              <div className="flex gap-3">
                <div className="flex-1 flex flex-col gap-1.5">
                  <label className="mt-field-label text-xs">First Name</label>
                  <Input placeholder="John" />
                </div>
                <div className="flex-1 flex flex-col gap-1.5">
                  <label className="mt-field-label text-xs">Last Name</label>
                  <Input placeholder="Doe" />
                </div>
              </div>
            </div>
            {/* Input with prefix/suffix text */}
            <div>
              <p className="mt-field-label mb-3">With Prefix</p>
              <div className="flex items-center">
                <span className="inline-flex items-center px-3 h-10 border-2 border-r-0 border-[var(--color-border)] rounded-l-md bg-[var(--color-muted)] text-sm text-[var(--color-muted-foreground)]">
                  https://
                </span>
                <Input placeholder="example.com" className="rounded-l-none" />
              </div>
            </div>
            {/* Input with suffix */}
            <div>
              <p className="mt-field-label mb-3">With Suffix</p>
              <div className="flex items-center">
                <Input placeholder="username" className="rounded-r-none" />
                <span className="inline-flex items-center px-3 h-10 border-2 border-l-0 border-[var(--color-border)] rounded-r-md bg-[var(--color-muted)] text-sm text-[var(--color-muted-foreground)]">
                  @gmail.com
                </span>
              </div>
            </div>
          </div>
        </ComponentPreview>
        <CodeBlock code={`{/* Inline fields */}
<div className="flex gap-3">
  <Input placeholder="First name" />
  <Input placeholder="Last name" />
</div>

{/* Input with prefix */}
<div className="flex items-center">
  <span className="...">https://</span>
  <Input placeholder="example.com" className="rounded-l-none" />
</div>`} />
      </Section>

      {/* ------------------------------------------------------------------ */}
      <Section title="File Input" description="Use type='file' for file upload inputs.">
        <ComponentPreview>
          <div className="max-w-sm space-y-3">
            <div className="flex flex-col gap-1.5">
              <label className="mt-field-label">Upload Document</label>
              <Input type="file" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="mt-field-label">Profile Picture</label>
              <Input type="file" accept="image/*" />
              <p className="mt-field-description">Accepted formats: JPG, PNG, GIF. Max size 5MB.</p>
            </div>
          </div>
        </ComponentPreview>
        <CodeBlock code={`<Input type="file" />
<Input type="file" accept="image/*" />`} />
      </Section>

      {/* ------------------------------------------------------------------ */}
      <Section title="API Reference">
        <p className="text-sm text-[var(--color-muted-foreground)] mb-4">
          Input extends all native <code className="font-mono bg-[var(--color-muted)] px-1 py-0.5 rounded">{'<input>'}</code> HTML attributes via <code className="font-mono bg-[var(--color-muted)] px-1 py-0.5 rounded">React.InputHTMLAttributes</code>. The following are the most commonly used props.
        </p>
        <PropsTable props={[
          { name: 'type', type: 'string', default: "'text'", description: 'The HTML input type. Supports text, email, password, number, search, url, tel, date, file, and all other native types.' },
          { name: 'placeholder', type: 'string', default: '-', description: 'Placeholder text displayed when the input is empty. Disappears when the user starts typing.' },
          { name: 'value', type: 'string', default: '-', description: 'Controlled input value. Use with onChange for controlled components.' },
          { name: 'defaultValue', type: 'string', default: '-', description: 'Initial value for uncontrolled usage. The input manages its own state internally.' },
          { name: 'onChange', type: '(e: ChangeEvent<HTMLInputElement>) => void', default: '-', description: 'Callback fired when the input value changes. Receives the native change event.' },
          { name: 'disabled', type: 'boolean', default: 'false', description: 'Prevents all user interaction. The input appears visually muted.' },
          { name: 'readOnly', type: 'boolean', default: 'false', description: 'Prevents editing but allows text selection and focus. Useful for displaying computed values.' },
          { name: 'required', type: 'boolean', default: 'false', description: 'Marks the input as required for form validation. Adds the required attribute.' },
          { name: 'name', type: 'string', default: '-', description: 'The name attribute for form submission. Identifies the field in form data.' },
          { name: 'autoFocus', type: 'boolean', default: 'false', description: 'Automatically focuses the input when the component mounts.' },
          { name: 'maxLength', type: 'number', default: '-', description: 'Maximum number of characters allowed in the input.' },
          { name: 'pattern', type: 'string', default: '-', description: 'A regex pattern the input value must match for native form validation.' },
          { name: 'className', type: 'string', default: '-', description: 'Additional CSS classes appended to the input element.' },
          { name: 'ref', type: 'React.Ref<HTMLInputElement>', default: '-', description: 'A ref forwarded to the underlying input element. Useful for focusing or reading the DOM node.' },
        ]} />
      </Section>

      {/* ------------------------------------------------------------------ */}
      <Section title="Accessibility">
        <div className="border-2 border-[var(--color-border)] rounded-lg p-6 space-y-4">
          <div>
            <h3 className="font-semibold text-sm mb-1">Labels</h3>
            <p className="text-sm text-[var(--color-muted-foreground)]">
              Always pair inputs with visible labels using the <code className="font-mono bg-[var(--color-muted)] px-1 py-0.5 rounded">{'<label>'}</code> element or the Field component. Associate labels using the <code className="font-mono bg-[var(--color-muted)] px-1 py-0.5 rounded">htmlFor</code> attribute matching the input's <code className="font-mono bg-[var(--color-muted)] px-1 py-0.5 rounded">id</code>.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-sm mb-1">Placeholder Text</h3>
            <p className="text-sm text-[var(--color-muted-foreground)]">
              Placeholder text is not a substitute for labels. It disappears once the user begins typing, which removes the hint. Always use a visible label alongside placeholder text.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-sm mb-1">Focus Management</h3>
            <p className="text-sm text-[var(--color-muted-foreground)]">
              A visible focus ring appears on keyboard navigation. The border color changes on focus to indicate the active field. Focus styles meet WCAG 2.1 SC 2.4.7 (Focus Visible).
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-sm mb-1">Error States</h3>
            <p className="text-sm text-[var(--color-muted-foreground)]">
              When displaying validation errors, use <code className="font-mono bg-[var(--color-muted)] px-1 py-0.5 rounded">aria-invalid="true"</code> on the input and <code className="font-mono bg-[var(--color-muted)] px-1 py-0.5 rounded">aria-describedby</code> pointing to the error message element.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-sm mb-1">Descriptions</h3>
            <p className="text-sm text-[var(--color-muted-foreground)]">
              Use <code className="font-mono bg-[var(--color-muted)] px-1 py-0.5 rounded">aria-describedby</code> to associate helper text or descriptions with the input so screen readers announce them alongside the label.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-sm mb-1">Keyboard Interaction</h3>
            <ul className="text-sm text-[var(--color-muted-foreground)] list-disc list-inside space-y-1">
              <li><kbd className="font-mono bg-[var(--color-muted)] px-1 py-0.5 rounded text-xs">Tab</kbd> moves focus to and from the input.</li>
              <li>Standard text editing shortcuts work (Ctrl+A, Ctrl+C, Ctrl+V, etc.).</li>
              <li><kbd className="font-mono bg-[var(--color-muted)] px-1 py-0.5 rounded text-xs">Escape</kbd> does not clear the input by default (browser-dependent for search type).</li>
            </ul>
          </div>
        </div>
      </Section>
    </div>
  );
}
