import Link from 'next/link';
import { Section } from '../../../components/section';
import { ComponentPreview } from '../../../components/component-preview';
import { CodeBlock } from '../../../components/code-block';
import { ColorRoles, ContrastChecker } from '../../../components/color-tools';

export default function ColorsPage() {
  return <div>
    <h1 className="text-4xl font-bold mb-2">Color</h1>
    <p className="text-lg text-[var(--color-muted-foreground)] mb-8">Color gives actions and surfaces a consistent role. The rendered palette uses ochre for primary actions, eucalyptus for secondary emphasis, and neutral surfaces to foreground language.</p>
    <Section title="Color roles and hierarchy">
      <p className="mb-4">Choose a role before choosing a shade. Primary identifies the most important action or current destination. Secondary supports another action. Background and foreground form the reading surface; card and popover roles describe contained surfaces. Error, warning, success and info describe feedback rather than brand emphasis.</p>
      <ul className="guidance-list"><li>Pair each surface with its matching foreground. A color that works on the page background may fail on a filled button.</li><li>Use primary sparingly, for actions, focus and current location. A page full of equally prominent actions loses hierarchy.</li><li>Keep text, icon or shape alongside semantic color. Red alone cannot explain why an input failed.</li><li>A source citation, an internal review flag and community approval are distinct evidence states. Never make a green label stand in for missing authority.</li></ul>
    </Section>
    <Section title="Live role pairs" description="These specimens use the actual CSS roles and change with the page theme. Measured text contrast is reported honestly, including failures; a token name is not an accessibility guarantee."><ColorRoles /></Section>
    <Section title="Contrast checker" description="Explore an opaque color pair and its text contrast. Use text labels to read results independently of the preview colors."><ComponentPreview><ContrastChecker /></ComponentPreview></Section>
    <Section title="Contrast specifications">
      <div className="doc-table" role="region" aria-label="Contrast specifications table" tabIndex={0}><table><thead><tr><th scope="col">Content</th><th scope="col">Minimum</th><th scope="col">How to apply it</th></tr></thead><tbody><tr><td>Normal text, WCAG AA</td><td>4.5:1</td><td>Body text, labels, placeholders and ordinary button text.</td></tr><tr><td>Large text, WCAG AA</td><td>3:1</td><td>At least 24px regular or about 18.67px bold at the browser’s default CSS pixel conversion.</td></tr><tr><td>Normal text, WCAG AAA</td><td>7:1</td><td>A useful higher target for important reading content.</td></tr><tr><td>Required non-text visual information</td><td>3:1</td><td>Identify controls and states against adjacent colors; assess the actual boundary or indicator.</td></tr></tbody></table></div>
      <p className="mt-4">Evaluate the final foreground against its actual adjacent background, including hover and focus. Do not round a result into compliance. Disabled controls have an exception under the text-contrast criterion, but unexplained or unreadable disabled actions still create usability problems.</p>
    </Section>
    <Section title="Applying roles">
      <CodeBlock language="css" code={`.source-details {
  background: var(--color-card);
  color: var(--color-card-foreground);
  border: 1px solid var(--color-border);
}
.source-details a { color: var(--color-primary); }
.source-details a:hover { color: var(--color-primary-hover); }
.source-details a:focus-visible {
  outline: 3px solid var(--color-ring);
  outline-offset: 3px;
}`} />
      <p className="mt-4">Primitive palette values are for defining roles or intentional illustrations. Product components should consume semantic and component tokens. Keep light and dark roles deliberate; dark mode is not a blanket inversion of every color.</p>
    </Section>
    <Section title="Theme, state and cultural context">
      <p className="mb-4">Changing a primary role means checking its foreground, hover, active and focus combinations. Theme overrides must reach portals as well as the local container. A translucent overlay needs contrast measured against the composited background, not just its raw RGB value.</p>
      <p>Language-specific accents require a documented relationship to the material being presented. Do not use one landscape palette as a claim about every Indigenous language. Photographs and contributed artwork remain attributed content; their colors do not grant permission to use cultural motifs in interface decoration.</p>
    </Section>
    <Section title="Do and avoid">
      <div className="doc-table" role="region" aria-label="Color decisions table" tabIndex={0}><table><thead><tr><th scope="col">Do</th><th scope="col">Avoid</th></tr></thead><tbody><tr><td>Use an explicit error message plus a state treatment.</td><td>An error indicated only by a red outline.</td></tr><tr><td>Measure the actual foreground/surface pair in each theme.</td><td>Assuming a semantic token automatically meets contrast.</td></tr><tr><td>Use consistent role tokens across a component family.</td><td>Hardcoded colors that drift from the shared theme.</td></tr><tr><td>Keep evidence and approval statuses separate.</td><td>Coloring a machine suggestion as verified knowledge.</td></tr></tbody></table></div>
    </Section>
    <Section title="Verification and related guidance">
      <p className="mb-4">Inspect both themes, each interactive state, forced colors and color-independent labels. Use the checker for opaque pairs, inspect rendered overlays separately, and test the component with keyboard and screen reader. All raw palette values and theme overrides are searchable in the token explorer.</p>
      <div className="doc-links"><Link href="/foundations/color-schemes">Schemes, tones and customization</Link><Link href="/tokens">Token explorer</Link><Link href="/guides/theming">Theming</Link><Link href="/foundations/interaction-states">Interaction states</Link><a href="https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html">W3C text contrast guidance</a><a href="https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html">W3C non-text contrast guidance</a><a href="https://m3.material.io/styles/color/roles">Material color roles</a></div>
    </Section>
  </div>;
}
