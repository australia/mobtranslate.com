import { Section } from '../components/section';

export default function HomePage() {
  const stats = [
    { label: 'Components', value: '50' },
    { label: 'Design Tokens', value: '200+' },
    { label: 'Color Palettes', value: '12' },
    { label: 'Foundation Layers', value: '3' },
  ];

  return (
    <div>
      <h1 className="text-4xl font-bold mb-2">Mobtranslate Design System</h1>
      <p className="text-lg text-[var(--color-muted-foreground)] mb-8">
        A comprehensive, token-driven component library built on Base UI primitives.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
        {stats.map((stat) => (
          <div key={stat.label} className="border-2 border-[var(--color-border)] rounded-lg p-4 text-center">
            <div className="text-3xl font-bold text-[var(--color-primary)]">{stat.value}</div>
            <div className="text-sm text-[var(--color-muted-foreground)] mt-1">{stat.label}</div>
          </div>
        ))}
      </div>

      <Section title="Architecture" description="Three-layer design token system with CSS custom properties.">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="border-2 border-[var(--color-border)] rounded-lg p-4">
            <h3 className="font-bold mb-1">Layer 1: Primitives</h3>
            <p className="text-sm text-[var(--color-muted-foreground)]">Raw color palettes, spacing scale, type scale, shadows. No semantic meaning.</p>
          </div>
          <div className="border-2 border-[var(--color-border)] rounded-lg p-4">
            <h3 className="font-bold mb-1">Layer 2: Semantic</h3>
            <p className="text-sm text-[var(--color-muted-foreground)]">Role-based tokens: primary, destructive, background, foreground. Maps to primitives.</p>
          </div>
          <div className="border-2 border-[var(--color-border)] rounded-lg p-4">
            <h3 className="font-bold mb-1">Layer 3: Component</h3>
            <p className="text-sm text-[var(--color-muted-foreground)]">Per-component overrides: button padding, dialog max-width, input height.</p>
          </div>
        </div>
      </Section>

      <Section title="Getting Started" description="Import from @mobtranslate/ui to use components.">
        <pre className="bg-[var(--color-foreground)] text-[var(--color-background)] p-4 rounded-lg text-sm font-mono overflow-x-auto">
{`import { Button, Input, Dialog } from '@mobtranslate/ui';

// Import the token CSS in your globals.css:
// @import "@mobtranslate/ui/tokens/tokens.css";
// @import "@mobtranslate/ui/components/components.css";`}
        </pre>
      </Section>
    </div>
  );
}
