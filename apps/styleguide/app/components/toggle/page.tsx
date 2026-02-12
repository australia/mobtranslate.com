'use client';
import { Toggle } from '@mobtranslate/ui';
import { Section } from '../../../components/section';
import { ComponentPreview } from '../../../components/component-preview';
import { PropsTable } from '../../../components/props-table';

export default function TogglePage() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-2">Toggle</h1>
      <p className="text-lg text-[var(--color-muted-foreground)] mb-8">
        A two-state button that can be toggled on or off.
      </p>

      <Section title="Default" description="Basic toggle buttons.">
        <ComponentPreview>
          <div className="flex gap-2">
            <Toggle>B</Toggle>
            <Toggle>I</Toggle>
            <Toggle defaultPressed>U</Toggle>
          </div>
        </ComponentPreview>
      </Section>

      <Section title="With Text" description="Toggle buttons with full text labels.">
        <ComponentPreview>
          <div className="flex gap-2">
            <Toggle>Mute</Toggle>
            <Toggle>Pin</Toggle>
            <Toggle>Star</Toggle>
          </div>
        </ComponentPreview>
      </Section>

      <Section title="Disabled">
        <ComponentPreview>
          <div className="flex gap-2">
            <Toggle disabled>Disabled</Toggle>
            <Toggle disabled defaultPressed>Pressed + Disabled</Toggle>
          </div>
        </ComponentPreview>
      </Section>

      <Section title="API Reference">
        <PropsTable props={[
          { name: 'defaultPressed', type: 'boolean', default: 'false', description: 'Initial pressed state.' },
          { name: 'pressed', type: 'boolean', default: '-', description: 'Controlled pressed state.' },
          { name: 'onPressedChange', type: '(pressed: boolean) => void', default: '-', description: 'Called on toggle.' },
          { name: 'disabled', type: 'boolean', default: 'false', description: 'Prevents interaction.' },
          { name: 'className', type: 'string', default: '-', description: 'Additional CSS classes.' },
        ]} />
      </Section>

      <Section title="Accessibility">
        <div className="border-2 border-[var(--color-border)] rounded-lg p-4 space-y-2">
          <p className="text-sm"><strong>ARIA:</strong> Uses aria-pressed to indicate toggle state.</p>
          <p className="text-sm"><strong>Keyboard:</strong> Space or Enter to toggle.</p>
        </div>
      </Section>
    </div>
  );
}
