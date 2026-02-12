import { Section } from '../../../components/section';

export default function DesignPrinciplesPage() {
  const principles = [
    {
      title: 'Token-Driven',
      description: 'Every visual property references a design token. No hardcoded colors, sizes, or spacings. This ensures consistency and makes theming trivial.',
    },
    {
      title: 'Accessible by Default',
      description: 'All components include proper ARIA attributes, keyboard navigation, focus management, and screen reader support. Accessibility is a feature, not an afterthought.',
    },
    {
      title: 'Composable',
      description: 'Components are building blocks. They can be combined, nested, and extended. Compound components (like Dialog, AlertDialog) expose their sub-parts for maximum flexibility.',
    },
    {
      title: 'Unstyled Foundation',
      description: 'Built on Base UI primitives, which handle behavior and accessibility. Our styling layer is separate and overridable, giving you full control.',
    },
    {
      title: 'Progressive Disclosure',
      description: 'Sensible defaults for every prop. Components work with zero configuration but expose granular control when you need it.',
    },
    {
      title: 'Consistent API',
      description: 'All components follow the same patterns: forwardRef, className merging via cn(), typed props, and predictable naming conventions.',
    },
  ];

  return (
    <div>
      <h1 className="text-4xl font-bold mb-2">Design Principles</h1>
      <p className="text-lg text-[var(--color-muted-foreground)] mb-8">
        The guiding principles behind every design decision in the system.
      </p>

      <Section title="Core Principles">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {principles.map((p) => (
            <div key={p.title} className="border-2 border-[var(--color-border)] rounded-lg p-5">
              <h3 className="font-bold text-lg mb-2">{p.title}</h3>
              <p className="text-sm text-[var(--color-muted-foreground)]">{p.description}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Three-Layer Token Architecture" description="Our token system has three layers, each building on the previous.">
        <div className="space-y-4">
          <div className="border-2 border-[var(--color-border)] rounded-lg p-4">
            <h3 className="font-bold mb-1">Layer 1: Primitives</h3>
            <p className="text-sm text-[var(--color-muted-foreground)]">
              Raw values with no semantic meaning. Color palettes (blue-50 through blue-950), spacing scale (0-24), type scale (xs-6xl), shadows (xs-2xl). These never appear directly in component code.
            </p>
          </div>
          <div className="border-2 border-[var(--color-border)] rounded-lg p-4">
            <h3 className="font-bold mb-1">Layer 2: Semantic</h3>
            <p className="text-sm text-[var(--color-muted-foreground)]">
              Role-based tokens that map to primitives. <code className="font-mono bg-[var(--color-muted)] px-1 rounded">--color-primary</code> maps to blue-600, <code className="font-mono bg-[var(--color-muted)] px-1 rounded">--color-destructive</code> maps to red-500. These are what components reference.
            </p>
          </div>
          <div className="border-2 border-[var(--color-border)] rounded-lg p-4">
            <h3 className="font-bold mb-1">Layer 3: Component</h3>
            <p className="text-sm text-[var(--color-muted-foreground)]">
              Per-component overrides for fine-grained control. Button padding, dialog max-width, input height. These reference semantic tokens and can be overridden per-instance.
            </p>
          </div>
        </div>
      </Section>

      <Section title="Naming Conventions">
        <div className="border-2 border-[var(--color-border)] rounded-lg p-4 space-y-3">
          <div>
            <h4 className="font-bold text-sm">CSS Classes</h4>
            <p className="text-sm text-[var(--color-muted-foreground)]">
              All component classes are prefixed with <code className="font-mono bg-[var(--color-muted)] px-1 rounded">mt-</code> (mobtranslate). Format: <code className="font-mono bg-[var(--color-muted)] px-1 rounded">mt-component-element-modifier</code>.
            </p>
          </div>
          <div>
            <h4 className="font-bold text-sm">CSS Variables</h4>
            <p className="text-sm text-[var(--color-muted-foreground)]">
              Tokens follow the pattern <code className="font-mono bg-[var(--color-muted)] px-1 rounded">--category-name</code>. Colors: <code className="font-mono bg-[var(--color-muted)] px-1 rounded">--color-primary</code>. Spacing: <code className="font-mono bg-[var(--color-muted)] px-1 rounded">--spacing-4</code>. Radius: <code className="font-mono bg-[var(--color-muted)] px-1 rounded">--radius-md</code>.
            </p>
          </div>
          <div>
            <h4 className="font-bold text-sm">Component Props</h4>
            <p className="text-sm text-[var(--color-muted-foreground)]">
              Consistent props across components: <code className="font-mono bg-[var(--color-muted)] px-1 rounded">variant</code> for visual style, <code className="font-mono bg-[var(--color-muted)] px-1 rounded">size</code> for dimensions, <code className="font-mono bg-[var(--color-muted)] px-1 rounded">className</code> for overrides.
            </p>
          </div>
        </div>
      </Section>
    </div>
  );
}
