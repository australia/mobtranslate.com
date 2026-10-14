import Link from 'next/link';
import { Section } from '../../../components/section';
import { ComponentPreview } from '../../../components/component-preview';
import { CodeBlock } from '../../../components/code-block';
import { LayoutLab } from '../../../components/foundation-labs';

export default function LayoutPage() {
  return <div>
    <h1 className="text-4xl font-bold mb-2">Layout</h1>
    <p className="text-lg text-[var(--color-muted-foreground)] mb-8">Arrange content around the task, then adapt the structure to the space available. A small screen needs a different composition, not a scaled-down desktop.</p>
    <Section title="Anatomy and hierarchy">
      <p className="mb-4">A product screen has navigation, a task region, supporting context and feedback. Give the task the most space. Keep source and review information attached to dictionary results; moving it into a distant sidebar can make unsupported text look authoritative.</p>
      <ul className="guidance-list">
        <li><strong>Navigation:</strong> tells people where they are and how to change destination. Use a sidebar on wide screens and an accessible menu on compact screens.</li>
        <li><strong>Task region:</strong> holds lookup, learning or review. Place the page heading before its controls in both visual and DOM order.</li>
        <li><strong>Supporting context:</strong> sits beside the task when there is room, and follows it in reading order when there is not.</li>
        <li><strong>Feedback:</strong> appears next to the affected control. A network error must not replace all previously loaded content.</li>
      </ul>
    </Section>
    <Section title="Responsive specifications" description="These are the committed web breakpoints in the token CSS. They are CSS pixels, not native-device dp or device categories.">
      <div className="doc-table" role="region" aria-label="Responsive layout specifications table" tabIndex={0}><table><thead><tr><th scope="col">Token</th><th scope="col">Minimum width</th><th scope="col">Recommended decision</th></tr></thead><tbody>
        <tr><td>Below sm</td><td>0px</td><td>One task column. Stack fields and actions when labels no longer fit.</td></tr>
        <tr><td>--breakpoint-sm</td><td>640px</td><td>Allow two short fields on one row only if their content fits.</td></tr>
        <tr><td>--breakpoint-md</td><td>768px</td><td>Persistent navigation where enough task space remains.</td></tr>
        <tr><td>--breakpoint-lg</td><td>1024px</td><td>Optional supporting pane; preserve readable text measure.</td></tr>
        <tr><td>--breakpoint-xl</td><td>1280px</td><td>Increase margins before stretching prose.</td></tr>
        <tr><td>--breakpoint-2xl</td><td>1536px</td><td>Use extra width for reference context and data, not oversized controls.</td></tr>
      </tbody></table></div>
      <p className="mt-4">Breakpoints are starting points. Resize with real labels and long entries to find where the composition fails. A component in a narrow dashboard pane should respond to its container even on a large monitor.</p>
    </Section>
    <Section title="Layout explorer" description="Move the width control to inspect structural changes. Turn on right-to-left to check the reading order and use of logical positioning.">
      <ComponentPreview><LayoutLab /></ComponentPreview>
    </Section>
    <Section title="Grid, spacing and reading measure">
      <p className="mb-4">Use flexbox for a single line of actions; use grid for columns that share alignment. Use a 4px spacing rhythm, with 16px compact page padding and 32px where space allows. Limit long prose to about 65–75 characters per line. Data tables can be wider when the column relationships need it.</p>
      <CodeBlock language="css" code={`.task-layout {
  display: grid;
  gap: var(--spacing-4);
  grid-template-columns: minmax(0, 1fr);
}
.reading-column { max-inline-size: 72ch; }
.supporting-pane { min-inline-size: 0; }
@media (min-width: 1024px) {
  .task-layout { grid-template-columns: minmax(0, 1fr) 18rem; }
}`} />
      <p className="mt-4">A CSS custom property cannot be used directly as a media-query breakpoint. Keep the literal media value aligned with the breakpoint token, or use the corresponding generated Tailwind variant.</p>
    </Section>
    <Section title="Overflow, zoom and touch">
      <ul className="guidance-list">
        <li>Use <code>min-width: 0</code> on flexible content so long words and code do not stretch the entire page. Wrap prose; provide deliberate local scrolling for code and data tables.</li>
        <li>Make scrollable regions keyboard reachable and name them when their purpose is not clear. Never clip the only way to reach an action.</li>
        <li>Keep primary actions at least 44×44 CSS pixels. Visual icons can be smaller than their hit areas.</li>
        <li>At 400% zoom, reflow ordinary content into one column. Two-dimensional data may scroll, but the page navigation and actions must remain usable.</li>
        <li>Use logical properties such as <code>padding-inline</code> and <code>margin-inline-start</code>. Do not reorder fields with CSS in a way that changes the visible order but leaves keyboard order behind.</li>
      </ul>
    </Section>
    <Section title="Do and avoid">
      <div className="doc-table" role="region" aria-label="Layout decisions table" tabIndex={0}><table><thead><tr><th scope="col">Do</th><th scope="col">Avoid</th></tr></thead><tbody>
        <tr><td>Let long labels wrap and grow the row.</td><td>Fixed-height rows that cut off translated labels.</td></tr>
        <tr><td>Keep sources beneath their corresponding result.</td><td>One detached source block for several results.</td></tr>
        <tr><td>Move secondary controls into a menu with a clear label.</td><td>Hide important controls at small widths.</td></tr>
        <tr><td>Keep the same DOM reading order at every breakpoint.</td><td>Visual reordering that causes focus to jump across the screen.</td></tr>
      </tbody></table></div>
    </Section>
    <Section title="Verification and related guidance">
      <p className="mb-4">Check 320px, 768px and 1440px widths; repeat at 200% text size and 400% browser zoom. Check keyboard order, long labels, empty results, open overlays and right-to-left content. A screenshot alone does not establish keyboard or zoom behavior.</p>
      <div className="doc-links"><Link href="/foundations/layout-compositions">Scaffolds and canonical layouts</Link><Link href="/foundations/spacing">Spacing</Link><Link href="/patterns/navigation">Navigation patterns</Link><Link href="/guides/accessibility">Accessibility</Link><a href="https://m3.material.io/foundations/layout/layout-overview/overview">Material layout reference</a></div>
    </Section>
  </div>;
}
