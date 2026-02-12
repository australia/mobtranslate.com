'use client';
import { Form, Field, FieldLabel, FieldDescription, Input, Checkbox, Button, Separator } from '@mobtranslate/ui';
import { Section } from '../../../components/section';
import { ComponentPreview } from '../../../components/component-preview';

export default function FormsPatternPage() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-2">Form Patterns</h1>
      <p className="text-lg text-[var(--color-muted-foreground)] mb-8">Composed form examples using design system components.</p>
      <Section title="Login Form">
        <ComponentPreview>
          <Form className="max-w-sm" onSubmit={(e: React.FormEvent) => e.preventDefault()}>
            <Field><FieldLabel>Email</FieldLabel><Input type="email" placeholder="you@example.com" /></Field>
            <Field><FieldLabel>Password</FieldLabel><Input type="password" placeholder="Enter password" /></Field>
            <Checkbox label="Remember me" />
            <Button type="submit" className="w-full">Sign In</Button>
          </Form>
        </ComponentPreview>
      </Section>
      <Separator className="my-8" />
      <Section title="Registration Form">
        <ComponentPreview>
          <Form className="max-w-md" onSubmit={(e: React.FormEvent) => e.preventDefault()}>
            <div className="grid grid-cols-2 gap-4">
              <Field><FieldLabel>First Name</FieldLabel><Input placeholder="John" /></Field>
              <Field><FieldLabel>Last Name</FieldLabel><Input placeholder="Doe" /></Field>
            </div>
            <Field><FieldLabel>Email</FieldLabel><Input type="email" placeholder="john@example.com" /><FieldDescription>We will send a verification email.</FieldDescription></Field>
            <Field><FieldLabel>Password</FieldLabel><Input type="password" placeholder="Create password" /></Field>
            <Checkbox label="I agree to the terms and conditions" />
            <Button type="submit" className="w-full">Create Account</Button>
          </Form>
        </ComponentPreview>
      </Section>
    </div>
  );
}
