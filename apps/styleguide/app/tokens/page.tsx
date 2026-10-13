import Link from 'next/link';
import { Section } from '../../components/section';
import { CodeBlock } from '../../components/code-block';
import { TokenExplorer } from '../../components/token-explorer';
import catalogue from '../../content/tokens.json';

export default function TokensPage() {
  return <div>
    <h1 className="text-4xl font-bold mb-2">Design tokens</h1>
    <p className="text-lg text-[var(--color-muted-foreground)] mb-8">{catalogue.tokens.length} named decisions from the actual component stylesheet. Search declarations, compare themes, inspect live values and export the tokens you need.</p>
    <Section title="Token architecture">
      <p className="mb-4">Primitive tokens hold raw values such as a palette shade or spacing step. Semantic tokens describe a role such as primary action, error or foreground. Component tokens control a particular component’s dimensions. Prefer the narrowest meaningful role: a primary button uses a primary action token rather than a raw shade.</p>
      <p>The rendered web system is defined in <code>{catalogue.source}</code>. The catalogue below is generated with PostCSS before development and production builds. The exported TypeScript palette currently includes legacy values that differ from the CSS theme; use this CSS catalogue when matching the rendered components.</p>
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
      <p className="mt-4">Copying a token declaration preserves any <code>var(...)</code> references. Those references still need the shared stylesheet. A token is a styling decision, not proof that every foreground/background combination is accessible.</p>
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
    <Section title="Related guidance"><div className="doc-links"><Link href="/foundations/colors">Color roles</Link><Link href="/foundations/spacing">Spacing</Link><Link href="/foundations/shape">Shape</Link><Link href="/guides/theming">Theming</Link><a href="https://m3.material.io/foundations/design-tokens/overview">Material token reference</a><a href="https://tailwindcss.com/docs/theme#generating-all-css-variables">Tailwind theme variables</a></div></Section>
  </div>;
}
