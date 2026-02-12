'use client';
import { Menu, MenuTrigger, MenuPortal, MenuPositioner, MenuPopup, MenuItem, MenuSeparator, MenuGroupLabel, Button } from '@mobtranslate/ui';
import { Section } from '../../../components/section';
import { ComponentPreview } from '../../../components/component-preview';
import { PropsTable } from '../../../components/props-table';

export default function MenuPage() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-2">Menu</h1>
      <p className="text-lg text-[var(--color-muted-foreground)] mb-8">
        A dropdown menu triggered by a button, for displaying a list of actions.
      </p>

      <Section title="Default" description="Click the button to open the menu.">
        <ComponentPreview>
          <Menu>
            <MenuTrigger render={<Button variant="outline">Actions</Button>} />
            <MenuPortal>
              <MenuPositioner>
                <MenuPopup>
                  <MenuItem>Edit</MenuItem>
                  <MenuItem>Duplicate</MenuItem>
                  <MenuItem>Archive</MenuItem>
                  <MenuSeparator />
                  <MenuItem>Delete</MenuItem>
                </MenuPopup>
              </MenuPositioner>
            </MenuPortal>
          </Menu>
        </ComponentPreview>
      </Section>

      <Section title="With Groups" description="Organize items into labeled groups.">
        <ComponentPreview>
          <Menu>
            <MenuTrigger render={<Button variant="outline">Options</Button>} />
            <MenuPortal>
              <MenuPositioner>
                <MenuPopup>
                  <MenuGroupLabel>File</MenuGroupLabel>
                  <MenuItem>New</MenuItem>
                  <MenuItem>Open</MenuItem>
                  <MenuItem>Save</MenuItem>
                  <MenuSeparator />
                  <MenuGroupLabel>Edit</MenuGroupLabel>
                  <MenuItem>Undo</MenuItem>
                  <MenuItem>Redo</MenuItem>
                </MenuPopup>
              </MenuPositioner>
            </MenuPortal>
          </Menu>
        </ComponentPreview>
      </Section>

      <Section title="API Reference">
        <PropsTable props={[
          { name: 'Menu', type: 'Root', default: '-', description: 'Root component.' },
          { name: 'MenuTrigger', type: 'Trigger', default: '-', description: 'Button that opens the menu.' },
          { name: 'MenuPopup', type: 'Popup', default: '-', description: 'The menu container.' },
          { name: 'MenuItem', type: 'Item', default: '-', description: 'An actionable menu item.' },
          { name: 'MenuGroupLabel', type: 'GroupLabel', default: '-', description: 'Non-interactive group heading.' },
          { name: 'MenuSeparator', type: 'Separator', default: '-', description: 'Visual divider.' },
        ]} />
      </Section>

      <Section title="Accessibility">
        <div className="border-2 border-[var(--color-border)] rounded-lg p-4 space-y-2">
          <p className="text-sm"><strong>Keyboard:</strong> Arrow keys navigate. Enter activates. Escape closes.</p>
          <p className="text-sm"><strong>Type-ahead:</strong> Type to jump to matching items.</p>
          <p className="text-sm"><strong>ARIA:</strong> Uses menu and menuitem roles.</p>
        </div>
      </Section>
    </div>
  );
}
