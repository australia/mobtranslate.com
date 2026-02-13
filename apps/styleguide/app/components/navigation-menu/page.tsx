'use client';
import { Section } from '../../../components/section';
import { ComponentPreview } from '../../../components/component-preview';
import { PropsTable } from '../../../components/props-table';
import { CodeBlock } from '../../../components/code-block';

export default function NavigationMenuPage() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-2">Navigation Menu</h1>
      <p className="text-lg text-[var(--color-muted-foreground)] mb-8">
        Site navigation with dropdown content panels for complex navigation structures.
      </p>

      <Section title="Default" description="A horizontal navigation bar with dropdown menus.">
        <ComponentPreview>
          <nav className="mt-navigation-menu">
            <ul className="mt-navigation-menu-list">
              <li>
                <button className="mt-navigation-menu-trigger">
                  Getting Started
                  <svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 4l3 3 3-3" stroke="currentColor" strokeWidth="1.5" fill="none"/></svg>
                </button>
              </li>
              <li>
                <button className="mt-navigation-menu-trigger">
                  Components
                  <svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 4l3 3 3-3" stroke="currentColor" strokeWidth="1.5" fill="none"/></svg>
                </button>
              </li>
              <li>
                <a href="#" className="mt-navigation-menu-trigger">Documentation</a>
              </li>
            </ul>
          </nav>
        </ComponentPreview>
        <CodeBlock code={`import { NavigationMenu } from '@mobtranslate/ui';

<NavigationMenu>
  <NavigationMenuItem>
    <NavigationMenuTrigger>Getting Started</NavigationMenuTrigger>
    <NavigationMenuContent>
      <NavigationMenuLink href="/docs">Documentation</NavigationMenuLink>
      <NavigationMenuLink href="/guides">Guides</NavigationMenuLink>
    </NavigationMenuContent>
  </NavigationMenuItem>
</NavigationMenu>`} />
      </Section>

      <Section title="API Reference">
        <PropsTable props={[
          { name: 'NavigationMenu', type: 'Root', default: '-', description: 'Root container for the navigation.' },
          { name: 'NavigationMenuItem', type: 'Item', default: '-', description: 'A single navigation item.' },
          { name: 'NavigationMenuTrigger', type: 'Trigger', default: '-', description: 'Button that opens a content panel.' },
          { name: 'NavigationMenuContent', type: 'Content', default: '-', description: 'Dropdown content panel.' },
          { name: 'NavigationMenuLink', type: 'Link', default: '-', description: 'A navigation link.' },
        ]} />
      </Section>

      <Section title="Accessibility">
        <div className="border border-[var(--color-border)] rounded-lg p-4 space-y-2">
          <p className="text-sm"><strong>ARIA:</strong> Uses navigation landmark with proper menu roles for dropdown content.</p>
          <p className="text-sm"><strong>Keyboard:</strong> Arrow keys navigate between top-level items. Enter/Space opens content panels. Escape closes them.</p>
          <p className="text-sm"><strong>Focus:</strong> Focus is managed between trigger and content panel. Tab moves through links within the content.</p>
        </div>
      </Section>
    </div>
  );
}
