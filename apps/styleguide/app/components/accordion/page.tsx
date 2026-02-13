'use client';
import { Accordion, AccordionItem, AccordionHeader, AccordionTrigger, AccordionPanel } from '@mobtranslate/ui';
import { Section } from '../../../components/section';
import { ComponentPreview } from '../../../components/component-preview';
import { PropsTable } from '../../../components/props-table';
import { CodeBlock } from '../../../components/code-block';

const faqItems = [
  { q: 'What is Mobtranslate?', a: 'Mobtranslate is a platform for Indigenous Australian language preservation and translation. It provides tools for communities to document, teach, and share their languages.' },
  { q: 'How does the design system work?', a: 'Built on Base UI primitives with a three-layer token system: primitives, semantic, and component tokens. This approach provides consistent styling with full customizability.' },
  { q: 'Can I customize the components?', a: 'Yes! All components accept className for overrides and use CSS custom properties for theming. You can modify any token at the primitive, semantic, or component level.' },
  { q: 'Is it accessible?', a: 'All components are built on Base UI which provides WAI-ARIA compliant primitives with full keyboard navigation, screen reader support, and focus management.' },
];

const settingsItems = [
  { title: 'Account Settings', content: 'Manage your account details including your display name, email address, and profile picture. You can also change your password and enable two-factor authentication.' },
  { title: 'Notification Preferences', content: 'Control which notifications you receive via email, push notifications, and in-app alerts. You can set preferences for each type of activity.' },
  { title: 'Privacy & Security', content: 'Review your privacy settings, manage connected devices, and view your login history. You can also download your data or request account deletion.' },
  { title: 'Billing & Plans', content: 'View your current plan, update payment methods, and access billing history. Upgrade or downgrade your subscription at any time.' },
];

export default function AccordionPage() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-2">Accordion</h1>
      <p className="text-lg text-[var(--color-muted-foreground)] mb-8">
        Vertically stacked sections of content that expand and collapse to show or hide
        information. Accordions reduce visual clutter by letting users focus on one section at a time.
      </p>

      <Section title="Basic Accordion" description="A single-expand accordion where only one panel can be open at a time. Clicking a new header closes the previously open panel.">
        <ComponentPreview>
          <Accordion>
            {faqItems.map((item, i) => (
              <AccordionItem key={i} value={`item-${i}`}>
                <AccordionHeader>
                  <AccordionTrigger>{item.q}</AccordionTrigger>
                </AccordionHeader>
                <AccordionPanel>
                  <div className="p-4 text-sm text-[var(--color-muted-foreground)]">{item.a}</div>
                </AccordionPanel>
              </AccordionItem>
            ))}
          </Accordion>
        </ComponentPreview>
        <CodeBlock code={`<Accordion>
  <AccordionItem value="item-1">
    <AccordionHeader>
      <AccordionTrigger>Question?</AccordionTrigger>
    </AccordionHeader>
    <AccordionPanel>
      <div className="p-4">Answer content</div>
    </AccordionPanel>
  </AccordionItem>
  <AccordionItem value="item-2">
    <AccordionHeader>
      <AccordionTrigger>Another question?</AccordionTrigger>
    </AccordionHeader>
    <AccordionPanel>
      <div className="p-4">Another answer</div>
    </AccordionPanel>
  </AccordionItem>
</Accordion>`} />
      </Section>

      <Section title="Default Open" description="Use defaultValue to specify which panels should be expanded when the accordion first renders. Pass an array of value strings.">
        <ComponentPreview>
          <Accordion defaultValue={['item-0']}>
            {faqItems.slice(0, 3).map((item, i) => (
              <AccordionItem key={i} value={`item-${i}`}>
                <AccordionHeader>
                  <AccordionTrigger>{item.q}</AccordionTrigger>
                </AccordionHeader>
                <AccordionPanel>
                  <div className="p-4 text-sm text-[var(--color-muted-foreground)]">{item.a}</div>
                </AccordionPanel>
              </AccordionItem>
            ))}
          </Accordion>
        </ComponentPreview>
        <CodeBlock code={`<Accordion defaultValue={['item-0']}>
  <AccordionItem value="item-0">
    {/* This panel will be open by default */}
  </AccordionItem>
</Accordion>`} />
      </Section>

      <Section title="Multiple Open Panels" description="By default, the accordion allows multiple panels to be open simultaneously. Users can expand any number of sections at once.">
        <ComponentPreview>
          <Accordion defaultValue={['settings-0', 'settings-2']}>
            {settingsItems.map((item, i) => (
              <AccordionItem key={i} value={`settings-${i}`}>
                <AccordionHeader>
                  <AccordionTrigger>{item.title}</AccordionTrigger>
                </AccordionHeader>
                <AccordionPanel>
                  <div className="p-4 text-sm text-[var(--color-muted-foreground)]">{item.content}</div>
                </AccordionPanel>
              </AccordionItem>
            ))}
          </Accordion>
        </ComponentPreview>
        <CodeBlock code={`{/* Multiple panels open by default */}
<Accordion defaultValue={['settings-0', 'settings-2']}>
  <AccordionItem value="settings-0">...</AccordionItem>
  <AccordionItem value="settings-1">...</AccordionItem>
  <AccordionItem value="settings-2">...</AccordionItem>
</Accordion>`} />
      </Section>

      <Section title="Disabled Items" description="Individual accordion items can be disabled to prevent user interaction. Disabled items show reduced opacity and cannot be expanded or collapsed.">
        <ComponentPreview>
          <Accordion>
            <AccordionItem value="enabled-1">
              <AccordionHeader>
                <AccordionTrigger>Available Feature</AccordionTrigger>
              </AccordionHeader>
              <AccordionPanel>
                <div className="p-4 text-sm text-[var(--color-muted-foreground)]">This feature is available and can be expanded normally.</div>
              </AccordionPanel>
            </AccordionItem>
            <AccordionItem value="disabled-1" disabled>
              <AccordionHeader>
                <AccordionTrigger>Locked Feature (Upgrade Required)</AccordionTrigger>
              </AccordionHeader>
              <AccordionPanel>
                <div className="p-4 text-sm text-[var(--color-muted-foreground)]">This content is not accessible.</div>
              </AccordionPanel>
            </AccordionItem>
            <AccordionItem value="enabled-2">
              <AccordionHeader>
                <AccordionTrigger>Another Available Feature</AccordionTrigger>
              </AccordionHeader>
              <AccordionPanel>
                <div className="p-4 text-sm text-[var(--color-muted-foreground)]">This feature is also available and fully interactive.</div>
              </AccordionPanel>
            </AccordionItem>
            <AccordionItem value="disabled-2" disabled>
              <AccordionHeader>
                <AccordionTrigger>Coming Soon</AccordionTrigger>
              </AccordionHeader>
              <AccordionPanel>
                <div className="p-4 text-sm text-[var(--color-muted-foreground)]">This feature is not yet available.</div>
              </AccordionPanel>
            </AccordionItem>
          </Accordion>
        </ComponentPreview>
        <CodeBlock code={`<AccordionItem value="locked" disabled>
  <AccordionHeader>
    <AccordionTrigger>Locked Feature</AccordionTrigger>
  </AccordionHeader>
  <AccordionPanel>
    <div className="p-4">Not accessible</div>
  </AccordionPanel>
</AccordionItem>`} />
      </Section>

      <Section title="Rich Content" description="Accordion panels can contain any content, including nested components, images, lists, and interactive elements.">
        <ComponentPreview>
          <Accordion>
            <AccordionItem value="details">
              <AccordionHeader>
                <AccordionTrigger>Project Details</AccordionTrigger>
              </AccordionHeader>
              <AccordionPanel>
                <div className="p-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Status</span>
                    <span className="mt-badge mt-badge-success">Active</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Members</span>
                    <span className="text-sm text-[var(--color-muted-foreground)]">12 contributors</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Last Updated</span>
                    <span className="text-sm text-[var(--color-muted-foreground)]">2 hours ago</span>
                  </div>
                </div>
              </AccordionPanel>
            </AccordionItem>
            <AccordionItem value="changelog">
              <AccordionHeader>
                <AccordionTrigger>Recent Changes</AccordionTrigger>
              </AccordionHeader>
              <AccordionPanel>
                <div className="p-4">
                  <ul className="space-y-2 text-sm text-[var(--color-muted-foreground)]">
                    <li className="flex gap-2"><span className="font-mono text-xs bg-[var(--color-muted)] px-1.5 py-0.5 rounded">v2.1</span> Added dark mode support</li>
                    <li className="flex gap-2"><span className="font-mono text-xs bg-[var(--color-muted)] px-1.5 py-0.5 rounded">v2.0</span> Complete design system overhaul</li>
                    <li className="flex gap-2"><span className="font-mono text-xs bg-[var(--color-muted)] px-1.5 py-0.5 rounded">v1.5</span> New accordion component</li>
                  </ul>
                </div>
              </AccordionPanel>
            </AccordionItem>
            <AccordionItem value="resources">
              <AccordionHeader>
                <AccordionTrigger>Resources & Links</AccordionTrigger>
              </AccordionHeader>
              <AccordionPanel>
                <div className="p-4 grid grid-cols-2 gap-2">
                  <div className="border border-[var(--color-border)] rounded p-3 text-sm">
                    <p className="font-medium">Documentation</p>
                    <p className="text-xs text-[var(--color-muted-foreground)]">Component guides and API reference</p>
                  </div>
                  <div className="border border-[var(--color-border)] rounded p-3 text-sm">
                    <p className="font-medium">Source Code</p>
                    <p className="text-xs text-[var(--color-muted-foreground)]">View on GitHub</p>
                  </div>
                </div>
              </AccordionPanel>
            </AccordionItem>
          </Accordion>
        </ComponentPreview>
      </Section>

      <Section title="FAQ Pattern" description="A common use case for accordions is a Frequently Asked Questions section. Each question is a trigger and the answer is the collapsible panel.">
        <ComponentPreview>
          <div className="max-w-2xl">
            <h3 className="text-lg font-semibold mb-4">Frequently Asked Questions</h3>
            <Accordion>
              {faqItems.map((item, i) => (
                <AccordionItem key={i} value={`faq-${i}`}>
                  <AccordionHeader>
                    <AccordionTrigger>{item.q}</AccordionTrigger>
                  </AccordionHeader>
                  <AccordionPanel>
                    <div className="p-4 text-sm text-[var(--color-muted-foreground)]">{item.a}</div>
                  </AccordionPanel>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </ComponentPreview>
      </Section>

      <Section title="API Reference">
        <h3 className="font-semibold mt-4 mb-2">Accordion (Root)</h3>
        <PropsTable props={[
          { name: 'defaultValue', type: 'string[]', default: '[]', description: 'The values of items that are expanded by default (uncontrolled).' },
          { name: 'value', type: 'string[]', default: '-', description: 'The controlled expanded item values. Use with onValueChange.' },
          { name: 'onValueChange', type: '(value: string[]) => void', default: '-', description: 'Callback fired when expanded items change.' },
          { name: 'className', type: 'string', default: '-', description: 'Additional CSS classes merged via cn().' },
          { name: 'children', type: 'React.ReactNode', default: '-', description: 'AccordionItem elements.' },
        ]} />

        <h3 className="font-semibold mt-6 mb-2">AccordionItem</h3>
        <PropsTable props={[
          { name: 'value', type: 'string', default: '-', description: 'Unique identifier for this item (required). Must be unique within the accordion.' },
          { name: 'disabled', type: 'boolean', default: 'false', description: 'When true, prevents the item from being expanded or collapsed.' },
          { name: 'className', type: 'string', default: '-', description: 'Additional CSS classes for the item container.' },
        ]} />

        <h3 className="font-semibold mt-6 mb-2">AccordionHeader</h3>
        <PropsTable props={[
          { name: 'className', type: 'string', default: '-', description: 'Additional CSS classes for the header wrapper element.' },
        ]} />

        <h3 className="font-semibold mt-6 mb-2">AccordionTrigger</h3>
        <PropsTable props={[
          { name: 'className', type: 'string', default: '-', description: 'Additional CSS classes for the clickable trigger button.' },
          { name: 'children', type: 'React.ReactNode', default: '-', description: 'The trigger label text. A chevron icon is automatically appended.' },
        ]} />

        <h3 className="font-semibold mt-6 mb-2">AccordionPanel</h3>
        <PropsTable props={[
          { name: 'className', type: 'string', default: '-', description: 'Additional CSS classes for the collapsible content panel.' },
          { name: 'children', type: 'React.ReactNode', default: '-', description: 'The collapsible content. Wrap in a div with padding for spacing.' },
        ]} />
      </Section>

      <Section title="Accessibility" description="The Accordion component implements the WAI-ARIA Accordion pattern.">
        <div className="border-2 border-[var(--color-border)] rounded-lg p-4 space-y-2">
          <p className="text-sm"><strong>Keyboard navigation:</strong> Enter or Space toggles the focused panel. Up/Down arrow keys move focus between accordion headers. Home moves to the first header, End moves to the last.</p>
          <p className="text-sm"><strong>ARIA attributes:</strong> Each trigger has aria-expanded indicating its state. aria-controls links the trigger to its panel. The panel has aria-labelledby linking back to the trigger.</p>
          <p className="text-sm"><strong>Focus management:</strong> Only accordion triggers are focusable. Panel content is accessible via Tab once the panel is expanded.</p>
          <p className="text-sm"><strong>Animation:</strong> Panels animate open and close with a smooth height transition. Animations respect the prefers-reduced-motion media query.</p>
          <p className="text-sm"><strong>Disabled state:</strong> Disabled items are removed from the tab order and cannot be activated via keyboard or pointer.</p>
        </div>
      </Section>

      <Section title="Best Practices">
        <div className="border-2 border-[var(--color-border)] rounded-lg p-4 space-y-3">
          <div>
            <p className="text-sm font-semibold text-[var(--color-success)]">Do</p>
            <ul className="text-sm list-disc list-inside space-y-1 mt-1 text-[var(--color-muted-foreground)]">
              <li>Use concise, descriptive trigger labels so users can scan content quickly.</li>
              <li>Order items by importance or frequency of use.</li>
              <li>Use defaultValue to pre-expand the most relevant section.</li>
              <li>Keep panel content focused and relevant to the trigger label.</li>
              <li>Provide unique value props to each AccordionItem.</li>
            </ul>
          </div>
          <div>
            <p className="text-sm font-semibold text-[var(--color-error)]">Don&apos;t</p>
            <ul className="text-sm list-disc list-inside space-y-1 mt-1 text-[var(--color-muted-foreground)]">
              <li>Nest accordions within accordions &mdash; it creates confusing navigation.</li>
              <li>Use an accordion for just one or two items &mdash; consider showing content directly instead.</li>
              <li>Place critical information that all users need inside a collapsed panel.</li>
              <li>Use overly long or vague trigger labels.</li>
            </ul>
          </div>
        </div>
      </Section>
    </div>
  );
}
