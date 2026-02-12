'use client';
import { Separator } from '@mobtranslate/ui';
import { Section } from '../../../components/section';
import { ComponentPreview } from '../../../components/component-preview';
import { PropsTable } from '../../../components/props-table';

export default function SeparatorPage() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-2">Separator</h1>
      <p className="text-lg text-[var(--color-muted-foreground)] mb-8">
        A visual divider between content sections.
      </p>

      <Section title="Horizontal" description="Default horizontal separator.">
        <ComponentPreview>
          <div className="space-y-4 max-w-md">
            <p className="text-sm">Section one content</p>
            <Separator />
            <p className="text-sm">Section two content</p>
            <Separator />
            <p className="text-sm">Section three content</p>
          </div>
        </ComponentPreview>
      </Section>

      <Section title="In a List">
        <ComponentPreview>
          <div className="max-w-sm">
            {['Profile', 'Settings', 'Notifications', 'Logout'].map((item, i, arr) => (
              <div key={item}>
                <div className="py-2 px-3 text-sm hover:bg-[var(--color-muted)] rounded cursor-pointer">{item}</div>
                {i < arr.length - 1 && <Separator />}
              </div>
            ))}
          </div>
        </ComponentPreview>
      </Section>

      <Section title="API Reference">
        <PropsTable props={[
          { name: 'orientation', type: "'horizontal' | 'vertical'", default: "'horizontal'", description: 'Direction of the separator.' },
          { name: 'className', type: 'string', default: '-', description: 'Additional CSS classes.' },
        ]} />
      </Section>

      <Section title="Accessibility">
        <div className="border-2 border-[var(--color-border)] rounded-lg p-4 space-y-2">
          <p className="text-sm"><strong>Role:</strong> Uses role=separator with appropriate aria-orientation.</p>
          <p className="text-sm"><strong>Decorative:</strong> The separator is purely visual and does not convey structure to screen readers.</p>
        </div>
      </Section>
    </div>
  );
}
