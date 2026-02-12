'use client';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipPortal, TooltipPositioner, TooltipPopup, Button } from '@mobtranslate/ui';
import { Section } from '../../../components/section';
import { ComponentPreview } from '../../../components/component-preview';
import { PropsTable } from '../../../components/props-table';
import { CodeBlock } from '../../../components/code-block';

export default function TooltipPage() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-2">Tooltip</h1>
      <p className="text-lg text-[var(--color-muted-foreground)] mb-8">
        A popup that displays informative text when hovering over or focusing an element.
      </p>

      <Section title="Default" description="Hover over the button to see the tooltip.">
        <ComponentPreview>
          <TooltipProvider>
            <div className="flex gap-4">
              <Tooltip>
                <TooltipTrigger render={<Button variant="outline">Hover me</Button>} />
                <TooltipPortal>
                  <TooltipPositioner>
                    <TooltipPopup>This is a tooltip</TooltipPopup>
                  </TooltipPositioner>
                </TooltipPortal>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger render={<Button variant="outline">Save</Button>} />
                <TooltipPortal>
                  <TooltipPositioner>
                    <TooltipPopup>Save your changes (Ctrl+S)</TooltipPopup>
                  </TooltipPositioner>
                </TooltipPortal>
              </Tooltip>
            </div>
          </TooltipProvider>
        </ComponentPreview>
        <CodeBlock code={`<TooltipProvider>
  <Tooltip>
    <TooltipTrigger render={<Button>Hover</Button>} />
    <TooltipPortal>
      <TooltipPositioner>
        <TooltipPopup>Tooltip text</TooltipPopup>
      </TooltipPositioner>
    </TooltipPortal>
  </Tooltip>
</TooltipProvider>`} />
      </Section>

      <Section title="On Icon Buttons" description="Tooltips are essential for icon-only buttons.">
        <ComponentPreview>
          <TooltipProvider>
            <div className="flex gap-2">
              {[
                { icon: 'M12 5v14M5 12h14', label: 'Add item' },
                { icon: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z', label: 'Edit' },
                { icon: 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16', label: 'Delete' },
              ].map(({ icon, label }) => (
                <Tooltip key={label}>
                  <TooltipTrigger render={
                    <Button variant="outline" size="icon" aria-label={label}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={icon}/></svg>
                    </Button>
                  } />
                  <TooltipPortal>
                    <TooltipPositioner>
                      <TooltipPopup>{label}</TooltipPopup>
                    </TooltipPositioner>
                  </TooltipPortal>
                </Tooltip>
              ))}
            </div>
          </TooltipProvider>
        </ComponentPreview>
      </Section>

      <Section title="API Reference">
        <PropsTable props={[
          { name: 'TooltipProvider', type: 'Provider', default: '-', description: 'Wrap around all tooltips. Controls delay behavior.' },
          { name: 'Tooltip', type: 'Root', default: '-', description: 'Root component for a single tooltip.' },
          { name: 'TooltipTrigger', type: 'Trigger', default: '-', description: 'The element that activates the tooltip.' },
          { name: 'TooltipPositioner', type: 'Positioner', default: '-', description: 'Handles floating positioning logic.' },
          { name: 'TooltipPopup', type: 'Popup', default: '-', description: 'The tooltip content container.' },
        ]} />
      </Section>

      <Section title="Accessibility">
        <div className="border-2 border-[var(--color-border)] rounded-lg p-4 space-y-2">
          <p className="text-sm"><strong>Focus:</strong> Tooltips appear on focus as well as hover, supporting keyboard users.</p>
          <p className="text-sm"><strong>ARIA:</strong> Uses aria-describedby to link trigger with tooltip content.</p>
          <p className="text-sm"><strong>Delay:</strong> Short delay before showing to avoid accidental triggers.</p>
          <p className="text-sm"><strong>Escape:</strong> Pressing Escape dismisses the tooltip.</p>
        </div>
      </Section>
    </div>
  );
}
