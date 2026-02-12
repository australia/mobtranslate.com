'use client';
import { Alert, AlertTitle, AlertDescription } from '@mobtranslate/ui';
import { Section } from '../../../components/section';
import { ComponentPreview } from '../../../components/component-preview';
import { PropsTable } from '../../../components/props-table';
import { CodeBlock } from '../../../components/code-block';

export default function AlertPage() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-2">Alert</h1>
      <p className="text-lg text-[var(--color-muted-foreground)] mb-8">
        Display important messages to attract the user{"'"}s attention without interrupting their workflow.
      </p>

      <Section title="Variants" description="Five semantic variants for different message types.">
        <ComponentPreview>
          <div className="space-y-4">
            <Alert variant="default">
              <AlertTitle>Default Alert</AlertTitle>
              <AlertDescription>This is a default alert with neutral styling.</AlertDescription>
            </Alert>
            <Alert variant="info">
              <AlertTitle>Info</AlertTitle>
              <AlertDescription>This is an informational message about something relevant.</AlertDescription>
            </Alert>
            <Alert variant="success">
              <AlertTitle>Success</AlertTitle>
              <AlertDescription>Your changes have been saved successfully.</AlertDescription>
            </Alert>
            <Alert variant="warning">
              <AlertTitle>Warning</AlertTitle>
              <AlertDescription>Please review your changes before proceeding.</AlertDescription>
            </Alert>
            <Alert variant="error">
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>Something went wrong. Please try again later.</AlertDescription>
            </Alert>
          </div>
        </ComponentPreview>
        <CodeBlock code={`<Alert variant="info">
  <AlertTitle>Info</AlertTitle>
  <AlertDescription>Informational message.</AlertDescription>
</Alert>

<Alert variant="error">
  <AlertTitle>Error</AlertTitle>
  <AlertDescription>Something went wrong.</AlertDescription>
</Alert>`} />
      </Section>

      <Section title="Title Only" description="Alerts can be used with just a title for concise messages.">
        <ComponentPreview>
          <div className="space-y-4">
            <Alert variant="success">
              <AlertTitle>File uploaded successfully</AlertTitle>
            </Alert>
            <Alert variant="warning">
              <AlertTitle>Your session will expire in 5 minutes</AlertTitle>
            </Alert>
          </div>
        </ComponentPreview>
      </Section>

      <Section title="Description Only" description="For simple messages without a title.">
        <ComponentPreview>
          <div className="space-y-4">
            <Alert variant="info">
              <AlertDescription>Your trial period ends in 7 days. Upgrade to continue using all features.</AlertDescription>
            </Alert>
          </div>
        </ComponentPreview>
      </Section>

      <Section title="API Reference">
        <PropsTable props={[
          { name: 'variant', type: "'default' | 'info' | 'success' | 'warning' | 'error'", default: "'default'", description: 'The visual style and color scheme of the alert.' },
          { name: 'className', type: 'string', default: '-', description: 'Additional CSS classes merged via cn().' },
          { name: 'children', type: 'React.ReactNode', default: '-', description: 'Alert content (AlertTitle, AlertDescription).' },
        ]} />
      </Section>

      <Section title="Accessibility" description="Built-in accessibility features.">
        <div className="border-2 border-[var(--color-border)] rounded-lg p-4 space-y-2">
          <p className="text-sm"><strong>ARIA role:</strong> Uses role="alert" by default, which announces content to screen readers.</p>
          <p className="text-sm"><strong>Color + icon:</strong> Don{"'"}t rely on color alone to convey meaning. Consider adding icons for each variant.</p>
          <p className="text-sm"><strong>Dismissible:</strong> If the alert is dismissible, ensure the close button has an accessible label.</p>
        </div>
      </Section>
    </div>
  );
}
