'use client';
import { ToggleGroup, ToggleGroupItem } from '@mobtranslate/ui';
import { Section } from '../../../components/section';
import { ComponentPreview } from '../../../components/component-preview';
import { PropsTable } from '../../../components/props-table';

export default function ToggleGroupPage() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-2">Toggle Group</h1>
      <p className="text-lg text-[var(--color-muted-foreground)] mb-8">
        A set of two-state buttons that can be toggled on or off, grouped visually.
      </p>

      <Section title="Single Selection" description="Only one item can be active at a time.">
        <ComponentPreview>
          <ToggleGroup defaultValue="center">
            <ToggleGroupItem value="left">Left</ToggleGroupItem>
            <ToggleGroupItem value="center">Center</ToggleGroupItem>
            <ToggleGroupItem value="right">Right</ToggleGroupItem>
          </ToggleGroup>
        </ComponentPreview>
      </Section>

      <Section title="Text Formatting" description="Common toolbar pattern.">
        <ComponentPreview>
          <ToggleGroup type="multiple">
            <ToggleGroupItem value="bold">B</ToggleGroupItem>
            <ToggleGroupItem value="italic">I</ToggleGroupItem>
            <ToggleGroupItem value="underline">U</ToggleGroupItem>
            <ToggleGroupItem value="strikethrough">S</ToggleGroupItem>
          </ToggleGroup>
        </ComponentPreview>
      </Section>

      <Section title="Disabled Items">
        <ComponentPreview>
          <ToggleGroup defaultValue="grid">
            <ToggleGroupItem value="list">List</ToggleGroupItem>
            <ToggleGroupItem value="grid">Grid</ToggleGroupItem>
            <ToggleGroupItem value="kanban" disabled>Kanban</ToggleGroupItem>
          </ToggleGroup>
        </ComponentPreview>
      </Section>

      <Section title="API Reference">
        <h3 className="font-semibold mb-2">ToggleGroup</h3>
        <PropsTable props={[
          { name: 'type', type: "'single' | 'multiple'", default: "'single'", description: 'Single or multiple selection mode.' },
          { name: 'defaultValue', type: 'string | string[]', default: '-', description: 'Initially active value(s).' },
          { name: 'value', type: 'string | string[]', default: '-', description: 'Controlled active value(s).' },
          { name: 'onValueChange', type: '(value) => void', default: '-', description: 'Called when selection changes.' },
        ]} />
        <h3 className="font-semibold mt-4 mb-2">ToggleGroupItem</h3>
        <PropsTable props={[
          { name: 'value', type: 'string', default: '-', description: 'Unique identifier for this item.' },
          { name: 'disabled', type: 'boolean', default: 'false', description: 'Disables this specific item.' },
        ]} />
      </Section>

      <Section title="Accessibility">
        <div className="border-2 border-[var(--color-border)] rounded-lg p-4 space-y-2">
          <p className="text-sm"><strong>Keyboard:</strong> Arrow keys navigate between items. Space/Enter toggles.</p>
          <p className="text-sm"><strong>ARIA:</strong> Uses group role with aria-pressed on each item.</p>
        </div>
      </Section>
    </div>
  );
}
