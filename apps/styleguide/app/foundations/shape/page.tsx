import Link from 'next/link';
import { Section } from '../../../components/section';
import { ComponentPreview } from '../../../components/component-preview';
import { CodeBlock } from '../../../components/code-block';
import { ShapeLab } from '../../../components/foundation-labs';

const radii = [['none', '0px', 'Flush surfaces and joins'], ['sm', '4px', 'Small controls and indicators'], ['md', '8px', 'Inputs and ordinary controls'], ['lg', '16px', 'Cards and dialogs'], ['xl', '24px', 'Large standalone containers'], ['2xl', '32px', 'Exceptional large containers'], ['full', '9999px', 'Circular avatars and pill-shaped indicators']];

export default function ShapePage() {
  return <div>
    <h1 className="text-4xl font-bold mb-2">Shape</h1>
    <p className="text-lg text-[var(--color-muted-foreground)] mb-8">Use corners and outlines to group content and make familiar controls recognisable. Shape expresses hierarchy while leaving language and evidence in the foreground.</p>
    <Section title="Shape anatomy">
      <p className="mb-4">A shape consists of its boundary, corner treatment and interior content area. The boundary must remain legible on its surface; the corner must not clip content or focus; padding must give labels and icons room independently of the radius.</p>
      <ul className="guidance-list"><li>Use the same corner treatment for the same component family across pages.</li><li>Use pills for compact tags and status, not for every container.</li><li>A larger container may have a larger radius, but nested elements keep their own component roles.</li><li>Do not borrow cultural motifs as decorative masks. Community-contributed artwork is attributed content, not a default UI shape.</li></ul>
    </Section>
    <Section title="Radius specifications" description="The live specimens read the committed CSS custom properties; these values are shared across light and dark themes.">
      <div className="doc-table" role="region" aria-label="Radius specifications table" tabIndex={0}><table><thead><tr><th scope="col">Token</th><th scope="col">Value</th><th scope="col">Example role</th><th scope="col">Specimen</th></tr></thead><tbody>{radii.map(([name, value, role]) => <tr key={name}><td className="font-mono">--radius-{name}</td><td>{value}</td><td>{role}</td><td><div className="w-14 h-10 border-2 border-[var(--color-primary)] bg-[var(--color-muted)]" style={{ borderRadius: `var(--radius-${name})` }} /></td></tr>)}</tbody></table></div>
      <p className="mt-4">These are MobTranslate radii. Material’s shape vocabulary is a reference for expressing hierarchy; it does not mean this library ships Material’s expanded shape collection or morphing APIs.</p>
    </Section>
    <Section title="Shape explorer" description="Change the container radius. Observe that padding and button geometry remain stable."><ComponentPreview><ShapeLab /></ComponentPreview></Section>
    <Section title="Applying shape">
      <CodeBlock language="css" code={`.source-surface {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--spacing-6);
  background: var(--color-card);
  color: var(--color-card-foreground);
}
/* Clip media locally, not the container's focusable children. */
.source-thumbnail {
  border-start-start-radius: var(--radius-lg);
  border-start-end-radius: var(--radius-lg);
  overflow: hidden;
}`} />
      <p className="mt-4">Use a semantic component token when it exists; override a radius only to serve a documented role. A pill must not imply clickability if it is merely a status label. Interactive shape still needs a real button or link.</p>
    </Section>
    <Section title="Behavior and accessibility">
      <ul className="guidance-list"><li>Decorative shape adds no ARIA role. Announce the function and state of the contained control.</li><li>Keep at least a 44px hit area for primary actions even when the visible shape is smaller.</li><li>Do not clip focus outlines with <code>overflow: hidden</code> on an interactive ancestor. Put media clipping on a separate inner element.</li><li>In forced-colors mode, preserve a visible border. A shadow-only shape may disappear.</li><li>A rounded container does not define a reading group by itself. Use a heading, fieldset or named region where grouping has meaning.</li></ul>
    </Section>
    <Section title="Do and avoid">
      <div className="doc-table" role="region" aria-label="Shape decisions table" tabIndex={0}><table><thead><tr><th scope="col">Do</th><th scope="col">Avoid</th></tr></thead><tbody><tr><td>Keep a family’s shape consistent across variants.</td><td>Changing corners to signal error or selection without a label.</td></tr><tr><td>Give text adequate padding within highly rounded edges.</td><td>Pill-shaped multiline panels that waste space or cut off labels.</td></tr><tr><td>Use a token and explain intentional exceptions.</td><td>Unrelated custom radii on every screen.</td></tr></tbody></table></div>
    </Section>
    <Section title="Verification and related guidance">
      <p className="mb-4">Inspect long labels, larger text, keyboard focus and forced colors. Compare the same component in both themes. Shape is complete only when its content, hit area and focus indicator remain usable.</p>
      <div className="doc-links"><Link href="/foundations/elevation">Elevation</Link><Link href="/components/card">Card</Link><Link href="/components/chip">Chip</Link><a href="https://m3.material.io/styles/shape/overview">Material shape reference</a></div>
    </Section>
  </div>;
}
