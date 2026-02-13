'use client';
import { Form, Field, FieldLabel, FieldDescription, Input, Button } from '@mobtranslate/ui';
import { Section } from '../../../components/section';
import { ComponentPreview } from '../../../components/component-preview';
import { PropsTable } from '../../../components/props-table';
import { CodeBlock } from '../../../components/code-block';

export default function FormPage() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-2">Form</h1>
      <p className="text-lg text-[var(--color-muted-foreground)] mb-8">
        Form container with consistent spacing and submission handling.
      </p>

      <Section title="Default" description="A login form with fields and a submit button.">
        <ComponentPreview>
          <Form className="max-w-sm" onSubmit={(e: React.FormEvent) => e.preventDefault()}>
            <Field>
              <FieldLabel>Username</FieldLabel>
              <Input placeholder="Enter username" />
            </Field>
            <Field>
              <FieldLabel>Password</FieldLabel>
              <Input type="password" placeholder="Enter password" />
            </Field>
            <Button type="submit">Sign In</Button>
          </Form>
        </ComponentPreview>
        <CodeBlock code={`<Form onSubmit={handleSubmit}>
  <Field>
    <FieldLabel>Username</FieldLabel>
    <Input placeholder="Enter username" />
  </Field>
  <Field>
    <FieldLabel>Password</FieldLabel>
    <Input type="password" placeholder="Enter password" />
  </Field>
  <Button type="submit">Sign In</Button>
</Form>`} />
      </Section>

      <Section title="With Descriptions" description="Add help text to each field.">
        <ComponentPreview>
          <Form className="max-w-sm" onSubmit={(e: React.FormEvent) => e.preventDefault()}>
            <Field>
              <FieldLabel>Display Name</FieldLabel>
              <Input placeholder="Your name" />
              <FieldDescription>This is how other users will see you.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel>Bio</FieldLabel>
              <Input placeholder="A short bio" />
              <FieldDescription>Max 160 characters.</FieldDescription>
            </Field>
            <Button type="submit">Save Profile</Button>
          </Form>
        </ComponentPreview>
      </Section>

      <Section title="API Reference">
        <PropsTable props={[
          { name: 'onSubmit', type: '(e: FormEvent) => void', default: '-', description: 'Form submission handler.' },
          { name: 'children', type: 'React.ReactNode', default: '-', description: 'Form fields and submit button.' },
          { name: 'className', type: 'string', default: '-', description: 'Additional CSS classes.' },
        ]} />
      </Section>

      <Section title="Accessibility">
        <div className="border border-[var(--color-border)] rounded-lg p-4 space-y-2">
          <p className="text-sm"><strong>Semantics:</strong> Uses the native form element for proper form semantics and browser validation.</p>
          <p className="text-sm"><strong>Keyboard:</strong> Enter submits the form when focused on an input. Tab navigates between fields.</p>
        </div>
      </Section>
    </div>
  );
}
