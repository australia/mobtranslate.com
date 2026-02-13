'use client';
import { Menubar, Button } from '@mobtranslate/ui';
import { Section } from '../../../components/section';
import { ComponentPreview } from '../../../components/component-preview';
import { PropsTable } from '../../../components/props-table';
import { CodeBlock } from '../../../components/code-block';

export default function MenubarPage() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-2">Menubar</h1>
      <p className="text-lg text-[var(--color-muted-foreground)] mb-8">
        Horizontal menu bar container for application-style menus.
      </p>

      <Section title="Default" description="A basic menubar with ghost buttons.">
        <ComponentPreview>
          <Menubar>
            <Button variant="ghost" size="sm">File</Button>
            <Button variant="ghost" size="sm">Edit</Button>
            <Button variant="ghost" size="sm">View</Button>
            <Button variant="ghost" size="sm">Help</Button>
          </Menubar>
        </ComponentPreview>
        <CodeBlock code={`<Menubar>
  <Button variant="ghost" size="sm">File</Button>
  <Button variant="ghost" size="sm">Edit</Button>
  <Button variant="ghost" size="sm">View</Button>
  <Button variant="ghost" size="sm">Help</Button>
</Menubar>`} />
      </Section>

      <Section title="API Reference">
        <PropsTable props={[
          { name: 'children', type: 'React.ReactNode', default: '-', description: 'Menu trigger buttons or items.' },
          { name: 'className', type: 'string', default: '-', description: 'Additional CSS classes.' },
        ]} />
      </Section>

      <Section title="Accessibility">
        <div className="border border-[var(--color-border)] rounded-lg p-4 space-y-2">
          <p className="text-sm"><strong>ARIA:</strong> Uses menubar role with menuitem roles for each trigger.</p>
          <p className="text-sm"><strong>Keyboard:</strong> Left/Right arrow keys navigate between menu items. Enter/Space activates a menu.</p>
        </div>
      </Section>
    </div>
  );
}
