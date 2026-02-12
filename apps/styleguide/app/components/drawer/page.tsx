'use client';
import { Drawer, DrawerTrigger, DrawerClose, DrawerBackdrop, DrawerPopup, DrawerTitle, DrawerDescription, DrawerPortal } from '@mobtranslate/ui';
import { Button } from '@mobtranslate/ui';
import { Section } from '../../../components/section';
import { ComponentPreview } from '../../../components/component-preview';
import { PropsTable } from '../../../components/props-table';
import { CodeBlock } from '../../../components/code-block';

export default function DrawerPage() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-2">Drawer</h1>
      <p className="text-lg text-[var(--color-muted-foreground)] mb-8">
        A panel that slides in from any edge of the screen, built on the Dialog primitive.
      </p>

      <Section title="Sides" description="Drawers can slide from left, right, top, or bottom.">
        <ComponentPreview>
          <div className="flex flex-wrap gap-3">
            {(['left', 'right', 'top', 'bottom'] as const).map((side) => (
              <Drawer key={side}>
                <DrawerTrigger render={<Button variant="outline">{side}</Button>} />
                <DrawerPortal>
                  <DrawerBackdrop />
                  <DrawerPopup side={side}>
                    <DrawerTitle>Drawer ({side})</DrawerTitle>
                    <DrawerDescription>This drawer slides from the {side}.</DrawerDescription>
                    <div className="mt-4">
                      <DrawerClose render={<Button variant="outline">Close</Button>} />
                    </div>
                  </DrawerPopup>
                </DrawerPortal>
              </Drawer>
            ))}
          </div>
        </ComponentPreview>
        <CodeBlock code={`<Drawer>
  <DrawerTrigger render={<Button>Open</Button>} />
  <DrawerPortal>
    <DrawerBackdrop />
    <DrawerPopup side="right">
      <DrawerTitle>Settings</DrawerTitle>
      <DrawerDescription>Manage your preferences.</DrawerDescription>
      <DrawerClose render={<Button>Close</Button>} />
    </DrawerPopup>
  </DrawerPortal>
</Drawer>`} />
      </Section>

      <Section title="API Reference">
        <PropsTable props={[
          { name: 'side', type: "'left' | 'right' | 'top' | 'bottom'", default: "'right'", description: 'Which edge the drawer slides from.' },
          { name: 'className', type: 'string', default: '-', description: 'Additional CSS classes on the popup.' },
        ]} />
      </Section>

      <Section title="Accessibility">
        <div className="border-2 border-[var(--color-border)] rounded-lg p-4 space-y-2">
          <p className="text-sm"><strong>Built on Dialog:</strong> Inherits all accessibility features from Base UI Dialog (focus trapping, Escape to close, aria attributes).</p>
          <p className="text-sm"><strong>Backdrop click:</strong> Clicking the backdrop closes the drawer.</p>
        </div>
      </Section>
    </div>
  );
}
