'use client';
import { Fieldset, FieldsetLegend, Field, FieldLabel, Input } from '@mobtranslate/ui';
import { Section } from '../../../components/section';
import { ComponentPreview } from '../../../components/component-preview';

export default function FieldsetPage() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-2">Fieldset</h1>
      <p className="text-lg text-[var(--color-muted-foreground)] mb-8">Group related form fields.</p>
      <Section title="Default">
        <ComponentPreview>
          <Fieldset>
            <FieldsetLegend>Personal Information</FieldsetLegend>
            <Field><FieldLabel>First Name</FieldLabel><Input placeholder="John" /></Field>
            <Field><FieldLabel>Last Name</FieldLabel><Input placeholder="Doe" /></Field>
            <Field><FieldLabel>Email</FieldLabel><Input type="email" placeholder="john@example.com" /></Field>
          </Fieldset>
        </ComponentPreview>
      </Section>
    </div>
  );
}
