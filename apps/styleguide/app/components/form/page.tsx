'use client';
import { Form, Field, FieldLabel, Input, Button } from '@mobtranslate/ui';
import { Section } from '../../../components/section';
import { ComponentPreview } from '../../../components/component-preview';

export default function FormPage() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-2">Form</h1>
      <p className="text-lg text-[var(--color-muted-foreground)] mb-8">Form container with validation support.</p>
      <Section title="Default">
        <ComponentPreview>
          <Form className="max-w-sm" onSubmit={(e: React.FormEvent) => e.preventDefault()}>
            <Field><FieldLabel>Username</FieldLabel><Input placeholder="Enter username" /></Field>
            <Field><FieldLabel>Password</FieldLabel><Input type="password" placeholder="Enter password" /></Field>
            <Button type="submit">Submit</Button>
          </Form>
        </ComponentPreview>
      </Section>
    </div>
  );
}
