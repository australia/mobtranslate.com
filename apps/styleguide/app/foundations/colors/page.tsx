import { Section } from '../../../components/section';
import { ColorPaletteRow } from '../../../components/color-swatch';

const palettes: Record<string, Record<string, string>> = {
  blue: { '50': '#eff6ff', '100': '#dbeafe', '200': '#bfdbfe', '300': '#93c5fd', '400': '#60a5fa', '500': '#3b82f6', '600': '#2563eb', '700': '#1d4ed8', '800': '#1e40af', '900': '#1e3a8a', '950': '#172554' },
  red: { '50': '#fef2f2', '100': '#fee2e2', '200': '#fecaca', '300': '#fca5a5', '400': '#f87171', '500': '#ef4444', '600': '#dc2626', '700': '#b91c1c', '800': '#991b1b', '900': '#7f1d1d', '950': '#450a0a' },
  green: { '50': '#f0fdf4', '100': '#dcfce7', '200': '#bbf7d0', '300': '#86efac', '400': '#4ade80', '500': '#22c55e', '600': '#16a34a', '700': '#15803d', '800': '#166534', '900': '#14532d', '950': '#052e16' },
  amber: { '50': '#fffbeb', '100': '#fef3c7', '200': '#fde68a', '300': '#fcd34d', '400': '#fbbf24', '500': '#f59e0b', '600': '#d97706', '700': '#b45309', '800': '#92400e', '900': '#78350f', '950': '#451a03' },
  gray: { '50': '#f9fafb', '100': '#f3f4f6', '200': '#e5e7eb', '300': '#d1d5db', '400': '#9ca3af', '500': '#6b7280', '600': '#4b5563', '700': '#374151', '800': '#1f2937', '900': '#111827', '950': '#030712' },
  purple: { '50': '#faf5ff', '100': '#f3e8ff', '200': '#e9d5ff', '300': '#d8b4fe', '400': '#c084fc', '500': '#a855f7', '600': '#9333ea', '700': '#7e22ce', '800': '#6b21a8', '900': '#581c87', '950': '#3b0764' },
  pink: { '50': '#fdf2f8', '100': '#fce7f3', '200': '#fbcfe8', '300': '#f9a8d4', '400': '#f472b6', '500': '#ec4899', '600': '#db2777', '700': '#be185d', '800': '#9d174d', '900': '#831843', '950': '#500724' },
  teal: { '50': '#f0fdfa', '100': '#ccfbf1', '200': '#99f6e4', '300': '#5eead4', '400': '#2dd4bf', '500': '#14b8a6', '600': '#0d9488', '700': '#0f766e', '800': '#115e59', '900': '#134e4a', '950': '#042f2e' },
  cyan: { '50': '#ecfeff', '100': '#cffafe', '200': '#a5f3fc', '300': '#67e8f9', '400': '#22d3ee', '500': '#06b6d4', '600': '#0891b2', '700': '#0e7490', '800': '#155e75', '900': '#164e63', '950': '#083344' },
  orange: { '50': '#fff7ed', '100': '#ffedd5', '200': '#fed7aa', '300': '#fdba74', '400': '#fb923c', '500': '#f97316', '600': '#ea580c', '700': '#c2410c', '800': '#9a3412', '900': '#7c2d12', '950': '#431407' },
};

const semanticColors = [
  { name: 'primary', value: '#2563eb' },
  { name: 'secondary', value: '#ef4444' },
  { name: 'accent', value: '#f59e0b' },
  { name: 'destructive', value: '#ef4444' },
  { name: 'success', value: '#16a34a' },
  { name: 'warning', value: '#f59e0b' },
  { name: 'info', value: '#3b82f6' },
  { name: 'muted', value: '#f3f4f6' },
  { name: 'background', value: '#ffffff' },
  { name: 'foreground', value: '#000000' },
];

export default function ColorsPage() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-2">Colors</h1>
      <p className="text-lg text-[var(--color-muted-foreground)] mb-8">Full color palettes and semantic color tokens.</p>

      <Section title="Semantic Colors" description="Role-based color assignments.">
        <div className="flex flex-wrap gap-3">
          {semanticColors.map((c) => (
            <div key={c.name} className="flex flex-col items-center gap-1.5">
              <div className="w-16 h-16 rounded-lg border-2 border-[var(--color-border)]" style={{ backgroundColor: c.value }} />
              <span className="text-xs font-mono">{c.name}</span>
              <span className="text-xs font-mono text-[var(--color-muted-foreground)]">{c.value}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Color Palettes" description="Full primitive color palettes with shades 50-950.">
        {Object.entries(palettes).map(([name, shades]) => (
          <ColorPaletteRow key={name} name={name} shades={shades} />
        ))}
      </Section>
    </div>
  );
}
