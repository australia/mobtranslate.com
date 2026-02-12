import { Section } from '../../components/section';

const tokenCategories = [
  { name: 'Colors', count: '12 palettes, 130+ values', description: 'Full color palettes from blue to orange, each with 50-950 shades.' },
  { name: 'Spacing', count: '16 values', description: '4px base grid: 0, 0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24.' },
  { name: 'Typography', count: '10 sizes', description: 'xs through 6xl with matching line heights.' },
  { name: 'Border Radius', count: '7 values', description: 'none, sm, md, lg, xl, 2xl, full.' },
  { name: 'Shadows', count: '6 levels', description: 'xs through 2xl for elevation effects.' },
  { name: 'Motion', count: '10 values', description: '5 durations + 5 easing curves.' },
  { name: 'Z-Index', count: '8 layers', description: 'dropdown, sticky, fixed, modal-backdrop, modal, popover, tooltip, toast.' },
];

export default function TokensPage() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-2">Design Tokens</h1>
      <p className="text-lg text-[var(--color-muted-foreground)] mb-8">
        The complete token reference for the Mobtranslate design system.
      </p>
      <Section title="Token Categories">
        <div className="grid gap-4">
          {tokenCategories.map((cat) => (
            <div key={cat.name} className="border-2 border-[var(--color-border)] rounded-lg p-4 flex items-start gap-4">
              <div className="flex-1">
                <h3 className="font-bold">{cat.name}</h3>
                <p className="text-sm text-[var(--color-muted-foreground)]">{cat.description}</p>
              </div>
              <span className="text-xs font-mono bg-[var(--color-muted)] px-2 py-1 rounded whitespace-nowrap">{cat.count}</span>
            </div>
          ))}
        </div>
      </Section>
      <Section title="CSS Custom Properties" description="All tokens are available as CSS custom properties via the @theme directive.">
        <pre className="bg-[var(--color-foreground)] text-[var(--color-background)] p-4 rounded-lg text-sm font-mono overflow-x-auto">
{`/* Usage in CSS */
.my-element {
  color: var(--color-primary);
  padding: var(--spacing-4);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  transition: all var(--duration-normal) var(--ease-default);
}`}
        </pre>
      </Section>
    </div>
  );
}
