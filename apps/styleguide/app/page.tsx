import { Section } from '../components/section';
import { CodeBlock } from '../components/code-block';
import Link from 'next/link';
import { sections } from '../content/navigation';
import catalogue from '../content/tokens.json';

export default function HomePage() {
  const stats = [
    { label: 'Component topics', value: sections.find(section => section.title === 'Components')?.items.length ?? 0 },
    { label: 'CSS tokens', value: catalogue.tokens.length },
    { label: 'Foundation topics', value: sections.find(section => section.title === 'Foundations')?.items.length ?? 0 },
    { label: 'Developer guides', value: sections.find(section => section.title === 'Guides')?.items.length ?? 0 },
  ];

  return (
    <div>
      <h1 className="text-4xl font-bold mb-2">Mobtranslate Design System</h1>
      <p className="text-lg text-[var(--color-muted-foreground)] mb-8">
        Foundations, components and task patterns for MobTranslate’s React web interface.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
        {stats.map((stat) => (
          <div key={stat.label} className="border-2 border-[var(--color-border)] rounded-lg p-4 text-center">
            <div className="text-3xl font-bold text-[var(--color-primary)]">{stat.value}</div>
            <div className="text-sm text-[var(--color-muted-foreground)] mt-1">{stat.label}</div>
          </div>
        ))}
      </div>

      <Section title="Architecture" description="Rendered CSS roles, component specifications and explicit behavior contracts.">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="border-2 border-[var(--color-border)] rounded-lg p-4">
            <h3 className="font-bold mb-1">Layer 1: Primitives</h3>
            <p className="text-sm text-[var(--color-muted-foreground)]">Raw color palettes, spacing scale, type scale, shadows. No semantic meaning.</p>
          </div>
          <div className="border-2 border-[var(--color-border)] rounded-lg p-4">
            <h3 className="font-bold mb-1">Layer 2: Semantic</h3>
            <p className="text-sm text-[var(--color-muted-foreground)]">Role-based CSS values: primary, destructive, background and foreground. Pair text with its intended surface.</p>
          </div>
          <div className="border-2 border-[var(--color-border)] rounded-lg p-4">
            <h3 className="font-bold mb-1">Component specifications</h3>
            <p className="text-sm text-[var(--color-muted-foreground)]">Sizes, states and behavior in the shared wrappers and stylesheet. Legacy JavaScript presets still need reconciliation with rendered CSS.</p>
          </div>
        </div>
      </Section>

      <Section title="Getting Started" description="Use the private workspace package and its actual stylesheets.">
        <CodeBlock language="css" code={'@import "tailwindcss";\n@import "@mobtranslate/ui/src/tokens/tokens.css";\n@import "@mobtranslate/ui/src/components/components.css";'} />
        <div className="doc-links mt-4"><Link href="/guides/getting-started">Install and run</Link><Link href="/guides/composition">Compose controls</Link><Link href="/guides/theming">Theme the interface</Link></div>
      </Section>
      <Section title="Coverage and verification">
        <p>The foundations and developer examples include live controls and checked source. Component depth, task patterns and the broader accessibility audit are still being expanded. Topic counts describe documentation routes, not conformance certification.</p>
        <div className="doc-links mt-4"><Link href="/guides/contribution">Verification requirements</Link><Link href="/guides/migration">Current migration limits</Link></div>
      </Section>
    </div>
  );
}
