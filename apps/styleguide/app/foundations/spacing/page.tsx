import { Section } from '../../../components/section';

const spacings = [
  { name: '0', value: '0px' },
  { name: '0.5', value: '0.125rem' },
  { name: '1', value: '0.25rem' },
  { name: '1.5', value: '0.375rem' },
  { name: '2', value: '0.5rem' },
  { name: '2.5', value: '0.625rem' },
  { name: '3', value: '0.75rem' },
  { name: '4', value: '1rem' },
  { name: '5', value: '1.25rem' },
  { name: '6', value: '1.5rem' },
  { name: '8', value: '2rem' },
  { name: '10', value: '2.5rem' },
  { name: '12', value: '3rem' },
  { name: '16', value: '4rem' },
  { name: '20', value: '5rem' },
  { name: '24', value: '6rem' },
];

export default function SpacingPage() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-2">Spacing</h1>
      <p className="text-lg text-[var(--color-muted-foreground)] mb-8">4px base grid spacing scale.</p>

      <Section title="Spacing Scale">
        <div className="space-y-3">
          {spacings.map((s) => (
            <div key={s.name} className="flex items-center gap-4">
              <span className="text-xs font-mono w-12 text-right text-[var(--color-muted-foreground)]">{s.name}</span>
              <span className="text-xs font-mono w-20 text-[var(--color-muted-foreground)]">{s.value}</span>
              <div className="h-4 bg-[var(--color-primary)] rounded" style={{ width: s.value }} />
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
