import { Section } from '../../../components/section';
import { CodeBlock } from '../../../components/code-block';

export default function ThemingPage() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-2">Theming & Customization</h1>
      <p className="text-lg text-[var(--color-muted-foreground)] mb-8">
        How to customize the design system for your brand.
      </p>

      <Section title="Override Semantic Tokens" description="Change the look of everything by updating semantic tokens.">
        <p className="text-sm text-[var(--color-muted-foreground)] mb-4">
          Override CSS custom properties in your own stylesheet to change the entire theme. All components automatically pick up the new values.
        </p>
        <CodeBlock language="css" code={`:root {
  --color-primary: #8b5cf6;         /* Change primary to purple */
  --color-primary-hover: #7c3aed;
  --color-primary-foreground: #fff;
  --radius-md: 0.25rem;             /* Sharper corners */
  --font-sans: 'Geist', sans-serif; /* Different font */
}`} />
      </Section>

      <Section title="Dark Mode" description="Full dark mode support via CSS custom properties.">
        <p className="text-sm text-[var(--color-muted-foreground)] mb-4">
          Add the <code className="font-mono bg-[var(--color-muted)] px-1 rounded">dark</code> class to <code className="font-mono bg-[var(--color-muted)] px-1 rounded">&lt;html&gt;</code>. Every semantic token has a dark variant that activates automatically.
        </p>
        <CodeBlock code={`// Detect system preference
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

// Toggle dark mode
document.documentElement.classList.toggle('dark', prefersDark);

// Persist choice
localStorage.setItem('theme', prefersDark ? 'dark' : 'light');`} />
      </Section>

      <Section title="Override Dark Mode Colors" description="Customize dark theme separately from light.">
        <CodeBlock language="css" code={`.dark {
  --color-primary: #a78bfa;
  --color-background: #1a1a2e;
  --color-card: #16213e;
  --color-border: #2a3b5c;
}`} />
      </Section>

      <Section title="Component-Level Overrides" description="Override tokens for specific component instances.">
        <p className="text-sm text-[var(--color-muted-foreground)] mb-4">
          Use inline styles or CSS to override tokens on specific components.
        </p>
        <CodeBlock code={`// Override via className
<Button className="bg-green-600 hover:bg-green-700">
  Custom Button
</Button>

// Override via CSS custom properties on a wrapper
<div style={{ '--color-primary': '#16a34a' }}>
  <Button variant="primary">Green Primary</Button>
</div>`} />
      </Section>

      <Section title="Creating Custom Components" description="Build new components that integrate with the token system.">
        <CodeBlock code={`import { cn } from '@mobtranslate/ui';

interface CustomCardProps extends React.HTMLAttributes<HTMLDivElement> {
  elevated?: boolean;
}

export function CustomCard({ className, elevated, ...props }: CustomCardProps) {
  return (
    <div
      className={cn(
        'rounded-[var(--radius-lg)]',
        'border-2 border-[var(--color-border)]',
        'bg-[var(--color-card)]',
        'p-[var(--spacing-4)]',
        elevated && 'shadow-[var(--shadow-lg)]',
        className
      )}
      {...props}
    />
  );
}`} />
      </Section>

      <Section title="Token Reference">
        <div className="border-2 border-[var(--color-border)] rounded-lg p-4 space-y-2">
          <p className="text-sm"><strong>Colors:</strong> --color-primary, --color-secondary, --color-accent, --color-destructive, --color-error, --color-warning, --color-success, --color-info, --color-muted, --color-background, --color-foreground, --color-card, --color-popover, --color-border, --color-ring</p>
          <p className="text-sm"><strong>Spacing:</strong> --spacing-0 through --spacing-24 (4px grid)</p>
          <p className="text-sm"><strong>Typography:</strong> --text-xs through --text-6xl, --font-sans, --font-display, --font-mono</p>
          <p className="text-sm"><strong>Radius:</strong> --radius-none through --radius-full</p>
          <p className="text-sm"><strong>Shadows:</strong> --shadow-xs through --shadow-2xl</p>
          <p className="text-sm"><strong>Motion:</strong> --duration-instant through --duration-slower, --ease-default through --ease-bounce</p>
          <p className="text-sm"><strong>Z-index:</strong> --z-dropdown through --z-toast</p>
        </div>
      </Section>
    </div>
  );
}
