'use client';
import { CheckboxGroup, Checkbox } from '@mobtranslate/ui';
import { Section } from '../../../components/section';
import { ComponentPreview } from '../../../components/component-preview';
import { PropsTable } from '../../../components/props-table';
import { CodeBlock } from '../../../components/code-block';

export default function CheckboxGroupPage() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-2">Checkbox Group</h1>
      <p className="text-lg text-[var(--color-muted-foreground)] mb-8">
        Group related checkboxes with shared layout and semantics.
      </p>

      <Section title="Default" description="A vertical group of related checkboxes.">
        <ComponentPreview>
          <CheckboxGroup>
            <Checkbox label="Email notifications" name="notifications" value="email" />
            <Checkbox label="SMS notifications" name="notifications" value="sms" />
            <Checkbox label="Push notifications" name="notifications" value="push" />
          </CheckboxGroup>
        </ComponentPreview>
        <CodeBlock code={`<CheckboxGroup>
  <Checkbox label="Email notifications" name="notifications" value="email" />
  <Checkbox label="SMS notifications" name="notifications" value="sms" />
  <Checkbox label="Push notifications" name="notifications" value="push" />
</CheckboxGroup>`} />
      </Section>

      <Section title="With Default Values" description="Pre-select options with defaultValue.">
        <ComponentPreview>
          <CheckboxGroup>
            <Checkbox label="JavaScript" name="languages" value="js" defaultChecked />
            <Checkbox label="TypeScript" name="languages" value="ts" defaultChecked />
            <Checkbox label="Python" name="languages" value="py" />
            <Checkbox label="Rust" name="languages" value="rs" />
          </CheckboxGroup>
        </ComponentPreview>
      </Section>

      <Section title="API Reference">
        <PropsTable props={[
          { name: 'children', type: 'React.ReactNode', default: '-', description: 'Checkbox components to group.' },
          { name: 'className', type: 'string', default: '-', description: 'Additional CSS classes.' },
        ]} />
      </Section>

      <Section title="Accessibility">
        <div className="border border-[var(--color-border)] rounded-lg p-4 space-y-2">
          <p className="text-sm"><strong>ARIA:</strong> The group uses the group role to associate related checkboxes semantically.</p>
          <p className="text-sm"><strong>Keyboard:</strong> Tab moves between checkboxes. Space toggles the focused checkbox.</p>
        </div>
      </Section>
    </div>
  );
}
