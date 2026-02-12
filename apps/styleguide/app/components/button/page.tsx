'use client';
import { Button } from '@mobtranslate/ui';
import { Section } from '../../../components/section';
import { ComponentPreview } from '../../../components/component-preview';
import { PropsTable } from '../../../components/props-table';
import { CodeBlock } from '../../../components/code-block';

export default function ButtonPage() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-2">Button</h1>
      <p className="text-lg text-[var(--color-muted-foreground)] mb-8">
        Buttons allow users to trigger actions and events with a single click.
      </p>

      <Section title="Variants" description="The Button comes in 6 visual variants to communicate different levels of emphasis and intent.">
        <ComponentPreview>
          <div className="flex flex-wrap gap-3 items-center">
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="destructive">Destructive</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="link">Link</Button>
          </div>
        </ComponentPreview>
        <CodeBlock code={`<Button variant="primary">Primary</Button>
<Button variant="secondary">Secondary</Button>
<Button variant="destructive">Destructive</Button>
<Button variant="outline">Outline</Button>
<Button variant="ghost">Ghost</Button>
<Button variant="link">Link</Button>`} />
      </Section>

      <Section title="Sizes" description="Four size options to fit different UI contexts.">
        <ComponentPreview>
          <div className="flex items-center gap-3">
            <Button size="sm">Small</Button>
            <Button size="md">Medium</Button>
            <Button size="lg">Large</Button>
            <Button size="icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
            </Button>
          </div>
        </ComponentPreview>
        <CodeBlock code={`<Button size="sm">Small</Button>
<Button size="md">Medium</Button>
<Button size="lg">Large</Button>
<Button size="icon"><PlusIcon /></Button>`} />
      </Section>

      <Section title="Disabled States" description="Disabled buttons prevent interaction and display reduced opacity.">
        <ComponentPreview>
          <div className="flex flex-wrap gap-3 items-center">
            <Button variant="primary" disabled>Primary</Button>
            <Button variant="secondary" disabled>Secondary</Button>
            <Button variant="destructive" disabled>Destructive</Button>
            <Button variant="outline" disabled>Outline</Button>
            <Button variant="ghost" disabled>Ghost</Button>
            <Button variant="link" disabled>Link</Button>
          </div>
        </ComponentPreview>
      </Section>

      <Section title="Loading State" description="Show a spinner to indicate an ongoing action.">
        <ComponentPreview>
          <div className="flex flex-wrap gap-3 items-center">
            <Button loading>Processing...</Button>
            <Button variant="secondary" loading>Saving...</Button>
            <Button variant="outline" loading>Loading...</Button>
          </div>
        </ComponentPreview>
        <CodeBlock code={`<Button loading>Processing...</Button>`} />
      </Section>

      <Section title="With Icons" description="Buttons can include leading or trailing icons for additional context.">
        <ComponentPreview>
          <div className="flex flex-wrap gap-3 items-center">
            <Button>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              Continue
            </Button>
            <Button variant="outline">
              Download
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
            </Button>
            <Button variant="destructive">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
              Delete
            </Button>
          </div>
        </ComponentPreview>
      </Section>

      <Section title="Full Width" description="Buttons can expand to fill their container.">
        <ComponentPreview>
          <div className="max-w-sm space-y-3">
            <Button className="w-full">Full Width Primary</Button>
            <Button variant="outline" className="w-full">Full Width Outline</Button>
          </div>
        </ComponentPreview>
      </Section>

      <Section title="Button Group" description="Compose buttons together for related actions.">
        <ComponentPreview>
          <div className="flex">
            <Button variant="outline" className="rounded-r-none border-r-0">Left</Button>
            <Button variant="outline" className="rounded-none border-r-0">Center</Button>
            <Button variant="outline" className="rounded-l-none">Right</Button>
          </div>
        </ComponentPreview>
      </Section>

      <Section title="Variant + Size Matrix" description="Every variant at every size for visual reference.">
        <ComponentPreview>
          <div className="space-y-4">
            {(['primary', 'secondary', 'destructive', 'outline', 'ghost'] as const).map((variant) => (
              <div key={variant} className="flex items-center gap-3">
                <span className="text-xs font-mono w-24 text-[var(--color-muted-foreground)]">{variant}</span>
                <Button variant={variant} size="sm">Small</Button>
                <Button variant={variant} size="md">Medium</Button>
                <Button variant={variant} size="lg">Large</Button>
              </div>
            ))}
          </div>
        </ComponentPreview>
      </Section>

      <Section title="API Reference">
        <PropsTable props={[
          { name: 'variant', type: "'primary' | 'secondary' | 'destructive' | 'outline' | 'ghost' | 'link'", default: "'primary'", description: 'The visual style variant of the button.' },
          { name: 'size', type: "'sm' | 'md' | 'lg' | 'icon'", default: "'md'", description: 'The size of the button. Use icon for square icon-only buttons.' },
          { name: 'loading', type: 'boolean', default: 'false', description: 'Shows a loading spinner and disables the button.' },
          { name: 'disabled', type: 'boolean', default: 'false', description: 'Prevents interaction and reduces opacity.' },
          { name: 'className', type: 'string', default: '-', description: 'Additional CSS classes merged via cn().' },
          { name: 'children', type: 'React.ReactNode', default: '-', description: 'The button content (text, icons, etc.).' },
          { name: 'type', type: "'button' | 'submit' | 'reset'", default: "'button'", description: 'The HTML button type attribute.' },
          { name: 'onClick', type: '(e: MouseEvent) => void', default: '-', description: 'Click event handler.' },
          { name: 'ref', type: 'React.Ref<HTMLButtonElement>', default: '-', description: 'Forwarded ref to the underlying button element.' },
        ]} />
      </Section>

      <Section title="Accessibility" description="Built-in accessibility features.">
        <div className="border-2 border-[var(--color-border)] rounded-lg p-4 space-y-2">
          <p className="text-sm"><strong>Keyboard:</strong> Buttons are focusable and activated with Enter or Space keys.</p>
          <p className="text-sm"><strong>Screen readers:</strong> Use descriptive text content. For icon-only buttons, add an aria-label.</p>
          <p className="text-sm"><strong>Focus ring:</strong> Visible focus indicator appears on keyboard navigation via :focus-visible.</p>
          <p className="text-sm"><strong>Disabled state:</strong> Disabled buttons use the disabled attribute, removing them from tab order.</p>
        </div>
      </Section>
    </div>
  );
}
