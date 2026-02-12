import { Section } from '../../../components/section';

const elevations = [
  { level: 0, name: 'Level 0', shadow: 'none', css: '--shadow-none' },
  { level: 1, name: 'Level 1 (xs)', shadow: '0 1px 2px 0 rgb(0 0 0 / 0.05)', css: '--shadow-xs' },
  { level: 2, name: 'Level 2 (sm)', shadow: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)', css: '--shadow-sm' },
  { level: 3, name: 'Level 3 (md)', shadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)', css: '--shadow-md' },
  { level: 4, name: 'Level 4 (lg)', shadow: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)', css: '--shadow-lg' },
  { level: 5, name: 'Level 5 (xl)', shadow: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)', css: '--shadow-xl' },
];

export default function ElevationPage() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-2">Elevation</h1>
      <p className="text-lg text-[var(--color-muted-foreground)] mb-8">Shadow levels for depth and hierarchy.</p>

      <Section title="Elevation Levels">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-8">
          {elevations.map((e) => (
            <div key={e.level} className="flex flex-col items-center gap-3">
              <div className="w-32 h-24 rounded-lg bg-[var(--color-card)] border border-[var(--color-border)]" style={{ boxShadow: e.shadow }} />
              <span className="text-sm font-semibold">{e.name}</span>
              <span className="text-xs font-mono text-[var(--color-muted-foreground)]">{e.css}</span>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
