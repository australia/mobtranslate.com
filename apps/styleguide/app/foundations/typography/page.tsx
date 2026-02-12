import { Section } from '../../../components/section';

const sizes = [
  { name: 'xs', size: '0.75rem', css: '--text-xs' },
  { name: 'sm', size: '0.875rem', css: '--text-sm' },
  { name: 'base', size: '1rem', css: '--text-base' },
  { name: 'lg', size: '1.125rem', css: '--text-lg' },
  { name: 'xl', size: '1.25rem', css: '--text-xl' },
  { name: '2xl', size: '1.5rem', css: '--text-2xl' },
  { name: '3xl', size: '1.875rem', css: '--text-3xl' },
  { name: '4xl', size: '2.25rem', css: '--text-4xl' },
  { name: '5xl', size: '3rem', css: '--text-5xl' },
  { name: '6xl', size: '3.75rem', css: '--text-6xl' },
];

const weights = [
  { name: 'Thin', value: 100 },
  { name: 'Light', value: 300 },
  { name: 'Normal', value: 400 },
  { name: 'Medium', value: 500 },
  { name: 'Semibold', value: 600 },
  { name: 'Bold', value: 700 },
  { name: 'Extrabold', value: 800 },
  { name: 'Black', value: 900 },
];

export default function TypographyPage() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-2">Typography</h1>
      <p className="text-lg text-[var(--color-muted-foreground)] mb-8">Type scale, weights, and specimens.</p>

      <Section title="Type Scale">
        <div className="space-y-4">
          {sizes.map((s) => (
            <div key={s.name} className="flex items-baseline gap-4 border-b border-[var(--color-border)] pb-2">
              <span className="text-xs font-mono w-16 text-[var(--color-muted-foreground)]">{s.name}</span>
              <span className="text-xs font-mono w-20 text-[var(--color-muted-foreground)]">{s.size}</span>
              <span style={{ fontSize: s.size }}>The quick brown fox jumps over the lazy dog</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Font Weights">
        <div className="space-y-3">
          {weights.map((w) => (
            <div key={w.value} className="flex items-baseline gap-4">
              <span className="text-xs font-mono w-24 text-[var(--color-muted-foreground)]">{w.value}</span>
              <span className="text-xl" style={{ fontWeight: w.value }}>{w.name} — The quick brown fox</span>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
