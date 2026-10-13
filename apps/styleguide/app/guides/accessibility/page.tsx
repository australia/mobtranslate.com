import { Section } from '../../../components/section';
import { CodeBlock } from '../../../components/code-block';

export default function AccessibilityPage() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-2">Accessibility</h1>
      <p className="text-lg text-[var(--color-muted-foreground)] mb-8">
        Accessibility requirements for composing, documenting and testing Mobtranslate UI.
      </p>

      <Section title="Built-in Support" description="Base UI primitives provide a foundation. Authors still need to supply names, meaningful content and verified composition.">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border-2 border-[var(--color-border)] rounded-lg p-4">
            <h3 className="font-bold mb-1">ARIA Attributes</h3>
            <p className="text-sm text-[var(--color-muted-foreground)]">Correct roles, states, and properties are applied automatically. Dialogs use role=dialog, alerts use role=alert, etc.</p>
          </div>
          <div className="border-2 border-[var(--color-border)] rounded-lg p-4">
            <h3 className="font-bold mb-1">Keyboard Navigation</h3>
            <p className="text-sm text-[var(--color-muted-foreground)]">Arrow keys, Enter, Escape, Tab, and Space all work as expected. Focus trapping in modals, roving tabindex in groups.</p>
          </div>
          <div className="border-2 border-[var(--color-border)] rounded-lg p-4">
            <h3 className="font-bold mb-1">Focus Management</h3>
            <p className="text-sm text-[var(--color-muted-foreground)]">Visible focus indicators on all interactive elements via :focus-visible. Focus is trapped in dialogs and returned on close.</p>
          </div>
          <div className="border-2 border-[var(--color-border)] rounded-lg p-4">
            <h3 className="font-bold mb-1">Reduced Motion</h3>
            <p className="text-sm text-[var(--color-muted-foreground)]">All animations respect prefers-reduced-motion. A global media query disables transitions when the user prefers reduced motion.</p>
          </div>
        </div>
      </Section>

      <Section title="Color Contrast" description="Check the actual rendered combinations against WCAG 2.2 AA. A token or a component name does not guarantee compliance.">
        <div className="border-2 border-[var(--color-border)] rounded-lg p-4 space-y-3">
          <p className="text-sm"><strong>Text on background:</strong> Require at least 4.5:1 contrast for normal text and 3:1 for large text. Measure both themes and every relevant state.</p>
          <p className="text-sm"><strong>UI components:</strong> Required visual information identifying controls and states needs at least 3:1 contrast against adjacent colors. Inspect borders, icons and focus indicators in context.</p>
          <p className="text-sm"><strong>Don{"'"}t rely on color alone:</strong> Always supplement color with text, icons, or patterns to convey information.</p>
        </div>
      </Section>

      <Section title="Screen Reader Best Practices">
        <div className="border-2 border-[var(--color-border)] rounded-lg p-4 space-y-3">
          <p className="text-sm"><strong>VisuallyHidden:</strong> Use the VisuallyHidden component to add screen-reader-only text.</p>
          <p className="text-sm"><strong>aria-label:</strong> Icon-only buttons should always have an aria-label.</p>
          <p className="text-sm"><strong>Live regions:</strong> Toast and Alert components announce content to screen readers automatically.</p>
        </div>
        <CodeBlock code={`import { VisuallyHidden, Button } from '@mobtranslate/ui';

// Icon-only button with accessible label
<Button variant="ghost" size="icon" aria-label="Close">
  <CloseIcon />
</Button>

// Visually hidden text for screen readers
<VisuallyHidden>Loading 5 of 10 items</VisuallyHidden>`} />
      </Section>

      <Section title="Testing Checklist">
        <div className="border-2 border-[var(--color-border)] rounded-lg p-4">
          <ul className="space-y-2 text-sm">
            <li className="flex items-start gap-2"><span className="text-[var(--color-success)] font-bold">1.</span> Navigate with Tab/Shift+Tab only. Can you reach all interactive elements?</li>
            <li className="flex items-start gap-2"><span className="text-[var(--color-success)] font-bold">2.</span> Activate controls with Enter/Space. Do they all respond correctly?</li>
            <li className="flex items-start gap-2"><span className="text-[var(--color-success)] font-bold">3.</span> Use arrow keys in lists, tabs, radio groups. Is navigation intuitive?</li>
            <li className="flex items-start gap-2"><span className="text-[var(--color-success)] font-bold">4.</span> Open a dialog. Is focus trapped? Does Escape close it?</li>
            <li className="flex items-start gap-2"><span className="text-[var(--color-success)] font-bold">5.</span> Enable a screen reader (VoiceOver, NVDA). Are all elements announced clearly?</li>
            <li className="flex items-start gap-2"><span className="text-[var(--color-success)] font-bold">6.</span> Enable prefers-reduced-motion. Are animations disabled?</li>
            <li className="flex items-start gap-2"><span className="text-[var(--color-success)] font-bold">7.</span> Zoom to 200%. Does the layout remain usable?</li>
          </ul>
        </div>
      </Section>
    </div>
  );
}
