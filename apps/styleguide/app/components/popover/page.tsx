'use client';
import { Popover, PopoverTrigger, PopoverPortal, PopoverPositioner, PopoverPopup, PopoverTitle, PopoverDescription, PopoverClose, Button, Input } from '@mobtranslate/ui';
import { Section } from '../../../components/section';
import { ComponentPreview } from '../../../components/component-preview';
import { PropsTable } from '../../../components/props-table';
import { CodeBlock } from '../../../components/code-block';

export default function PopoverPage() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-2">Popover</h1>
      <p className="text-lg text-[var(--color-muted-foreground)] mb-8">
        A floating panel anchored to a trigger element, for displaying additional content.
      </p>

      <Section title="Default" description="Basic popover with title and description.">
        <ComponentPreview>
          <Popover>
            <PopoverTrigger render={<Button variant="outline">Open Popover</Button>} />
            <PopoverPortal>
              <PopoverPositioner>
                <PopoverPopup>
                  <PopoverTitle>Dimensions</PopoverTitle>
                  <PopoverDescription>Set the dimensions for the element.</PopoverDescription>
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center gap-2"><label className="text-sm w-16">Width</label><Input className="flex-1" defaultValue="100%" /></div>
                    <div className="flex items-center gap-2"><label className="text-sm w-16">Height</label><Input className="flex-1" defaultValue="auto" /></div>
                  </div>
                </PopoverPopup>
              </PopoverPositioner>
            </PopoverPortal>
          </Popover>
        </ComponentPreview>
        <CodeBlock code={`<Popover>
  <PopoverTrigger render={<Button>Open</Button>} />
  <PopoverPortal>
    <PopoverPositioner>
      <PopoverPopup>
        <PopoverTitle>Title</PopoverTitle>
        <PopoverDescription>Content</PopoverDescription>
      </PopoverPopup>
    </PopoverPositioner>
  </PopoverPortal>
</Popover>`} />
      </Section>

      <Section title="API Reference">
        <PropsTable props={[
          { name: 'Popover', type: 'Root', default: '-', description: 'Root component managing open state.' },
          { name: 'PopoverTrigger', type: 'Trigger', default: '-', description: 'Element that toggles the popover.' },
          { name: 'PopoverPositioner', type: 'Positioner', default: '-', description: 'Positions the popup relative to trigger.' },
          { name: 'PopoverPopup', type: 'Popup', default: '-', description: 'The floating content container.' },
          { name: 'PopoverTitle', type: 'Title', default: '-', description: 'Optional heading.' },
          { name: 'PopoverDescription', type: 'Description', default: '-', description: 'Optional descriptive text.' },
        ]} />
      </Section>

      <Section title="Accessibility">
        <div className="border-2 border-[var(--color-border)] rounded-lg p-4 space-y-2">
          <p className="text-sm"><strong>Dismiss:</strong> Closes on Escape and clicking outside.</p>
          <p className="text-sm"><strong>Focus:</strong> Focus moves to the popover when opened and returns to trigger on close.</p>
          <p className="text-sm"><strong>ARIA:</strong> Linked via aria-controls and aria-expanded.</p>
        </div>
      </Section>
    </div>
  );
}
