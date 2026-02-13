'use client';
import { ContextMenu, ContextMenuTrigger, ContextMenuPortal, ContextMenuPositioner, ContextMenuPopup, ContextMenuItem, ContextMenuSeparator } from '@mobtranslate/ui';
import { Section } from '../../../components/section';
import { ComponentPreview } from '../../../components/component-preview';
import { PropsTable } from '../../../components/props-table';
import { CodeBlock } from '../../../components/code-block';

export default function ContextMenuPage() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-2">Context Menu</h1>
      <p className="text-lg text-[var(--color-muted-foreground)] mb-8">
        A menu that appears on right-click, providing contextual actions.
      </p>

      <Section title="Default" description="Right-click the area below to open the context menu.">
        <ComponentPreview>
          <ContextMenu>
            <ContextMenuTrigger>
              <div className="border-2 border-dashed border-[var(--color-border)] rounded-lg p-8 text-center text-sm text-[var(--color-muted-foreground)]">
                Right-click here
              </div>
            </ContextMenuTrigger>
            <ContextMenuPortal>
              <ContextMenuPositioner>
                <ContextMenuPopup>
                  <ContextMenuItem>Cut</ContextMenuItem>
                  <ContextMenuItem>Copy</ContextMenuItem>
                  <ContextMenuItem>Paste</ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem>Select All</ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem>Inspect Element</ContextMenuItem>
                </ContextMenuPopup>
              </ContextMenuPositioner>
            </ContextMenuPortal>
          </ContextMenu>
        </ComponentPreview>
        <CodeBlock code={`<ContextMenu>
  <ContextMenuTrigger>
    <div>Right-click here</div>
  </ContextMenuTrigger>
  <ContextMenuPortal>
    <ContextMenuPositioner>
      <ContextMenuPopup>
        <ContextMenuItem>Cut</ContextMenuItem>
        <ContextMenuItem>Copy</ContextMenuItem>
        <ContextMenuItem>Paste</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem>Select All</ContextMenuItem>
      </ContextMenuPopup>
    </ContextMenuPositioner>
  </ContextMenuPortal>
</ContextMenu>`} />
      </Section>

      <Section title="API Reference">
        <PropsTable props={[
          { name: 'ContextMenu', type: 'Root', default: '-', description: 'Root component.' },
          { name: 'ContextMenuTrigger', type: 'Trigger', default: '-', description: 'Area that responds to right-click.' },
          { name: 'ContextMenuPopup', type: 'Popup', default: '-', description: 'The menu container.' },
          { name: 'ContextMenuItem', type: 'Item', default: '-', description: 'An actionable menu item.' },
          { name: 'ContextMenuSeparator', type: 'Separator', default: '-', description: 'Visual divider between items.' },
        ]} />
      </Section>

      <Section title="Accessibility">
        <div className="border-2 border-[var(--color-border)] rounded-lg p-4 space-y-2">
          <p className="text-sm"><strong>Keyboard:</strong> Arrow keys to navigate items. Enter to activate. Escape to close.</p>
          <p className="text-sm"><strong>ARIA:</strong> Uses menu role with menuitem roles for each item.</p>
        </div>
      </Section>
    </div>
  );
}
