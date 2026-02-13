'use client';
import { Fieldset, FieldsetLegend, Field, FieldLabel, Input } from '@mobtranslate/ui';
import { Section } from '../../../components/section';
import { ComponentPreview } from '../../../components/component-preview';
import { PropsTable } from '../../../components/props-table';
import { CodeBlock } from '../../../components/code-block';

export default function FieldsetPage() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-2">Fieldset</h1>
      <p className="text-lg text-[var(--color-muted-foreground)] mb-8">
        Group related form fields with a legend for semantic structure.
      </p>

      <Section title="Default" description="A fieldset grouping personal information fields.">
        <ComponentPreview>
          <Fieldset>
            <FieldsetLegend>Personal Information</FieldsetLegend>
            <Field>
              <FieldLabel>First Name</FieldLabel>
              <Input placeholder="John" />
            </Field>
            <Field>
              <FieldLabel>Last Name</FieldLabel>
              <Input placeholder="Doe" />
            </Field>
            <Field>
              <FieldLabel>Email</FieldLabel>
              <Input type="email" placeholder="john@example.com" />
            </Field>
          </Fieldset>
        </ComponentPreview>
        <CodeBlock code={`<Fieldset>
  <FieldsetLegend>Personal Information</FieldsetLegend>
  <Field>
    <FieldLabel>First Name</FieldLabel>
    <Input placeholder="John" />
  </Field>
  <Field>
    <FieldLabel>Last Name</FieldLabel>
    <Input placeholder="Doe" />
  </Field>
</Fieldset>`} />
      </Section>

      <Section title="API Reference">
        <PropsTable props={[
          { name: 'children', type: 'React.ReactNode', default: '-', description: 'Legend and field elements.' },
          { name: 'className', type: 'string', default: '-', description: 'Additional CSS classes.' },
        ]} />
      </Section>

      <Section title="Accessibility">
        <div className="border border-[var(--color-border)] rounded-lg p-4 space-y-2">
          <p className="text-sm"><strong>Semantics:</strong> Uses the native fieldset/legend elements for proper grouping semantics.</p>
          <p className="text-sm"><strong>Screen readers:</strong> The legend text is announced when a user enters the fieldset group.</p>
        </div>
      </Section>
    </div>
  );
}
