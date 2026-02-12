'use client';
import { Field, FieldLabel, FieldDescription, FieldError, Input } from '@mobtranslate/ui';
import { Section } from '../../../components/section';
import { ComponentPreview } from '../../../components/component-preview';

export default function FieldPage() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-2">Field</h1>
      <p className="text-lg text-[var(--color-muted-foreground)] mb-8">Form field with label, description, and error.</p>
      <Section title="Default">
        <ComponentPreview>
          <div className="max-w-sm">
            <Field>
              <FieldLabel>Email</FieldLabel>
              <Input placeholder="email@example.com" />
              <FieldDescription>We will never share your email.</FieldDescription>
            </Field>
          </div>
        </ComponentPreview>
      </Section>
      <Section title="With Error">
        <ComponentPreview>
          <div className="max-w-sm">
            <Field invalid>
              <FieldLabel>Email</FieldLabel>
              <Input placeholder="email@example.com" />
              <FieldError>This field is required.</FieldError>
            </Field>
          </div>
        </ComponentPreview>
      </Section>
    </div>
  );
}
