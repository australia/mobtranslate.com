import Link from 'next/link';
import { Section } from '../../components/section';
import { CodeBlock } from '../../components/code-block';
import { TokenExplorer } from '../../components/token-explorer';
import catalogue from '../../content/tokens.json';
import snippets from '../../content/examples.json';

export default function TokensPage() {
  return <div>
    <h1 className="text-4xl font-bold mb-2">Design tokens</h1>
    <p className="text-lg text-[var(--color-muted-foreground)] mb-8">{catalogue.tokens.length} named decisions from the actual component stylesheet. Search declarations, compare themes, inspect live values and export the tokens you need.</p>
    <Section title="Token architecture">
      <p className="mb-4">Primitive tokens hold raw values such as a palette shade or spacing step. Semantic tokens describe a role such as primary action, error or foreground. Component specifications record a particular recipe and its source bindings; the current JavaScript presets are not automatically overridable CSS custom properties. Prefer the narrowest meaningful role: a primary button uses a primary action token rather than a raw shade.</p>
      <p>The rendered web system is defined in <code>{catalogue.source}</code>. The catalogue below is generated with PostCSS before development and production builds. The TypeScript declarations, semantic palettes and source-bound component presets are now generated and checked against the same stylesheet. Imported objects remain authored snapshots; theme selection and local inherited overrides are read through live CSS. See Theming for the compiled-versus-rendered inspector.</p>
    </Section>
    <Section title="A named decision and its adoption cost">
      <p className="mb-4">A token pairs a stable name with a value or reference. It is most useful when a decision is reused, reviewed or expected to vary across themes/consumers. A token name does not itself establish that a choice is approved, accessible or appropriate for source content.</p>
      <p>Adopt shared roles where the meaning is shared. Inventory existing overrides and users before introducing a layer; avoid turning every one-off layout measurement into a global public token. Record ownership, purpose, state coverage and migration impact alongside the value.</p>
    </Section>
    <Section title="Names, classes and component specifications">
      <p className="mb-4">Material uses a system prefix, ref/sys/comp class and descriptive purpose. This package uses actual CSS custom-property names and generated TypeScript objects; those namespaces are not automatic aliases for Material IDs. Keep names stable while values change, and treat renaming/removing a public name as an API migration.</p>
      <p className="mb-4">Reference values provide options; system roles assign meaning for a context; component specifications connect parts and states to the chosen recipe. The Component Specifications inspector traces 19 actual presets/90 source-bound fields. Inspect enabled/hover/focus/pressed/disabled behavior and the actual rendered part rather than assuming every style has an independent token.</p>
      <div className="doc-links"><Link href="/guides/component-specifications">Inspect component bindings</Link><Link href="/guides/theming">Compare TypeScript and inherited CSS</Link></div>
    </Section>
    <Section title="Contexts and alias graphs">
      <p className="mb-4">Theme, instance scope, density, direction and device/content constraints can change the decision used by a component. This catalogue records light declarations and explicit dark overrides. It is not a universal catalogue of every media/state/instance rule. CSS inheritance and portal placement determine which context reaches a rendered element.</p>
      <p className="mb-4">The reference disclosure follows parsed var() names conservatively, including fallback branches. Dependency inclusion adds matching declarations transitively and deduplicates them. Missing names may be supplied by another scope or a fallback; cycles need inspection. The graph preserves source relationships instead of inventing a resolved semantic mapping.</p>
      <p>Live custom-property values resolve references through the page cascade but can retain units such as rem. They are not final element geometry or a global snapshot of every local override. Export theme chooses authored values, independently of the page theme.</p>
    </Section>
    <Section title="Design-tool generation, mock-ups and handoff">
      <p className="mb-4">The captured Material workflow starts from baseline tokens or generated theme styles, updates values/styles, applies those styles to mock-ups, swaps a selected design-kit component’s mapped styles and exports a platform format. Record tool/plugin version and format: a design-tool style, DSP package, CSS fragment and this filtered JSON catalogue are different artifacts.</p>
      <p className="mb-4">For this workspace, agree on the existing role names and CSS source first. Map design styles to those roles, keep foreground/background and base/state treatments together, compare both themes, then make a reviewed stylesheet change and regenerate/check exports. No Figma plugin or native platform export runs automatically in this tool.</p>
      <p className="mb-4">The JSON download records requested names, export theme and included source declarations. Dependency inclusion does not provide components, fonts, complete state rules or proof of contrast. Review the captured export at its destination, keep the source/version and mapping scope, and verify the actual consuming interface.</p>
      <div className="doc-links"><a href="https://m3.material.io/foundations/design-tokens/how-to-use-tokens">Material design-tool workflow</a><Link href="/foundations/color-schemes">Generate and inspect color proposals</Link><Link href="/guides/migration">Token migration</Link></div>
    </Section>
    <Section title="Token explorer" description="Light and dark columns show source declarations. Live values come from the current page’s computed stylesheet, so switching the page theme updates them. Changing Export theme changes copied CSS; it does not change the page theme."><TokenExplorer /></Section>
    <Section title="Using tokens in code">
      <CodeBlock language="css" code={`.source-panel {
  color: var(--color-card-foreground);
  background: var(--color-card);
  padding: var(--spacing-6);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
}
.source-panel a {
  color: var(--color-primary);
  transition: color var(--duration-fast) var(--ease-out);
}`} />
      <p className="mt-4">Copying a declaration preserves <code>var(...)</code> references. Enable Include known alias dependencies to add their declared transitive references to CSS/JSON exports; otherwise the filtered fragment still needs the shared stylesheet. Missing external references, fallback branches and cycles require inspection rather than an assumed resolution. A token is a styling decision, not proof that every foreground/background combination is accessible.</p>
    </Section>
    <Section title="Theme boundaries and overrides">
      <p className="mb-4">The explicit <code>.dark</code> class overrides theme-dependent roles. Tokens without a dark override inherit their light declaration. A matching system-preference fallback applies before JavaScript initializes; explicit <code>.light</code> overrides that fallback. The page theme controls live values independently of the export selector.</p>
      <CodeBlock language="css" code={`/* A scoped role override inherits everything else. */
.campaign {
  --color-primary: #964a22;
  --color-primary-hover: #7a3d20;
  --color-primary-foreground: #fffdfb;
}`} />
      <p className="mt-4">Change foreground and background as a pair. Check hover, active and focus states as well as the default. An override on an ordinary element may not reach a popup rendered through a portal; place shared theme overrides on the document root or provide the same scope to the portal.</p>
    </Section>
    <Section title="Keeping the reference current">
      <CodeBlock language="bash" code={`pnpm --filter styleguide tokens:generate
pnpm --filter styleguide tokens:check
pnpm --filter styleguide typecheck
pnpm --filter styleguide build`} />
      <p className="mt-4">Edit the shared stylesheet, then regenerate the catalogue. The check command compares generated content with the current CSS and fails if they drift. Builds generate the catalogue automatically. Review renamed or removed tokens as API changes because consumers may use those custom properties directly.</p>
    </Section>
    <Section title="Compiled explorer and reference parser"><CodeBlock language="tsx" code={snippets['components/token-explorer.tsx']} /><CodeBlock language="ts" code={snippets['lib/token-references.ts']} /></Section>
    <Section title="Related guidance"><div className="doc-links"><Link href="/foundations/colors">Color roles</Link><Link href="/foundations/spacing">Spacing</Link><Link href="/foundations/shape">Shape</Link><Link href="/guides/theming">Theming</Link><a href="https://m3.material.io/foundations/design-tokens/overview">Material token reference</a><a href="https://tailwindcss.com/docs/theme#generating-all-css-variables">Tailwind theme variables</a></div></Section>
  </div>;
}
