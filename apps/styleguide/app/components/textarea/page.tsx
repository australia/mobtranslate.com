'use client';
import { Textarea } from '@mobtranslate/ui';
import { Section } from '../../../components/section';
import { ComponentPreview } from '../../../components/component-preview';
import { PropsTable } from '../../../components/props-table';
import { CodeBlock } from '../../../components/code-block';

export default function TextareaPage() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-2">Textarea</h1>
      <p className="text-lg text-[var(--color-muted-foreground)] mb-8">
        A multiline text input for longer form content like descriptions, comments, and messages.
      </p>

      <Section title="Basic Usage" description="A simple textarea with placeholder.">
        <ComponentPreview>
          <div className="max-w-sm">
            <Textarea placeholder="Enter your message..." />
          </div>
        </ComponentPreview>
        <CodeBlock code={`<Textarea placeholder="Enter your message..." />`} />
      </Section>

      <Section title="Resize Options" description="Control how the textarea can be resized by the user.">
        <ComponentPreview>
          <div className="max-w-sm space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Vertical (default)</label>
              <Textarea resize="vertical" placeholder="Resize vertically..." />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Horizontal</label>
              <Textarea resize="horizontal" placeholder="Resize horizontally..." />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Both</label>
              <Textarea resize="both" placeholder="Resize in both directions..." />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">None</label>
              <Textarea resize="none" placeholder="Cannot resize..." />
            </div>
          </div>
        </ComponentPreview>
        <CodeBlock code={`<Textarea resize="vertical" placeholder="Default..." />
<Textarea resize="horizontal" placeholder="Horizontal..." />
<Textarea resize="both" placeholder="Both..." />
<Textarea resize="none" placeholder="Fixed..." />`} />
      </Section>

      <Section title="Disabled" description="A disabled textarea prevents user interaction.">
        <ComponentPreview>
          <div className="max-w-sm">
            <Textarea disabled placeholder="This textarea is disabled" />
          </div>
        </ComponentPreview>
      </Section>

      <Section title="With Default Value" description="Pre-populate with initial content.">
        <ComponentPreview>
          <div className="max-w-sm">
            <Textarea defaultValue="This textarea has default content that the user can edit. It supports multiple lines of text." rows={4} />
          </div>
        </ComponentPreview>
      </Section>

      <Section title="Custom Rows" description="Control the visible height with the rows attribute.">
        <ComponentPreview>
          <div className="max-w-sm space-y-4">
            <Textarea rows={2} placeholder="2 rows" />
            <Textarea rows={4} placeholder="4 rows" />
            <Textarea rows={8} placeholder="8 rows" />
          </div>
        </ComponentPreview>
        <CodeBlock code={`<Textarea rows={2} placeholder="2 rows" />
<Textarea rows={4} placeholder="4 rows" />
<Textarea rows={8} placeholder="8 rows" />`} />
      </Section>

      <Section title="API Reference">
        <PropsTable props={[
          { name: 'resize', type: "'none' | 'vertical' | 'horizontal' | 'both'", default: "'vertical'", description: 'Controls how the textarea can be resized.' },
          { name: 'rows', type: 'number', default: '-', description: 'Number of visible text lines.' },
          { name: 'placeholder', type: 'string', default: '-', description: 'Placeholder text when empty.' },
          { name: 'disabled', type: 'boolean', default: 'false', description: 'Prevents user interaction.' },
          { name: 'className', type: 'string', default: '-', description: 'Additional CSS classes merged via cn().' },
          { name: 'ref', type: 'React.Ref<HTMLTextAreaElement>', default: '-', description: 'Forwarded ref to the underlying textarea element.' },
        ]} />
      </Section>

      <Section title="Accessibility" description="Built-in accessibility features.">
        <div className="border-2 border-[var(--color-border)] rounded-lg p-4 space-y-2">
          <p className="text-sm"><strong>Label:</strong> Always pair with a label element or aria-label for screen readers.</p>
          <p className="text-sm"><strong>Focus:</strong> Visible focus ring on keyboard navigation via :focus.</p>
          <p className="text-sm"><strong>Disabled:</strong> Uses native disabled attribute, removing from tab order.</p>
        </div>
      </Section>
    </div>
  );
}
