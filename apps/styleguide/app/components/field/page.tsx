'use client';
import { Field, FieldLabel, FieldDescription, FieldError, Input } from '@mobtranslate/ui';
import { Section } from '../../../components/section';
import { ComponentPreview } from '../../../components/component-preview';
import { PropsTable } from '../../../components/props-table';
import { CodeBlock } from '../../../components/code-block';

export default function FieldPage() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-2">Field</h1>
      <p className="text-lg text-[var(--color-muted-foreground)] mb-8">
        Form field wrapper with label, description, and error message support.
      </p>

      <Section title="Default" description="A field with label and description.">
        <ComponentPreview>
          <div className="max-w-sm">
            <Field>
              <FieldLabel>Email</FieldLabel>
              <Input placeholder="email@example.com" />
              <FieldDescription>We will never share your email.</FieldDescription>
            </Field>
          </div>
        </ComponentPreview>
        <CodeBlock code={`<Field>
  <FieldLabel>Email</FieldLabel>
  <Input placeholder="email@example.com" />
  <FieldDescription>We will never share your email.</FieldDescription>
</Field>`} />
      </Section>

      <Section title="With Error" description="Show validation errors with the invalid prop.">
        <ComponentPreview>
          <div className="max-w-sm">
            <Field invalid>
              <FieldLabel>Email</FieldLabel>
              <Input placeholder="email@example.com" />
              <FieldError>This field is required.</FieldError>
            </Field>
          </div>
        </ComponentPreview>
        <CodeBlock code={`<Field invalid>
  <FieldLabel>Email</FieldLabel>
  <Input placeholder="email@example.com" />
  <FieldError>This field is required.</FieldError>
</Field>`} />
      </Section>

      <Section title="API Reference">
        <PropsTable props={[
          { name: 'invalid', type: 'boolean', default: 'false', description: 'Marks the field as invalid and shows error styling.' },
          { name: 'children', type: 'React.ReactNode', default: '-', description: 'Label, input, description, and error elements.' },
          { name: 'className', type: 'string', default: '-', description: 'Additional CSS classes.' },
        ]} />
      </Section>

      <Section title="Accessibility">
        <div className="border border-[var(--color-border)] rounded-lg p-4 space-y-2">
          <p className="text-sm"><strong>ARIA:</strong> FieldLabel is associated with the input via htmlFor/id. FieldError uses aria-errormessage.</p>
          <p className="text-sm"><strong>Validation:</strong> When invalid, the input is marked with aria-invalid for screen reader users.</p>
        </div>
      </Section>
    </div>
  );
}
