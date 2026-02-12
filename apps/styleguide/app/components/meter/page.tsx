'use client';
import { Meter } from '@mobtranslate/ui';
import { Section } from '../../../components/section';
import { ComponentPreview } from '../../../components/component-preview';
import { PropsTable } from '../../../components/props-table';

export default function MeterPage() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-2">Meter</h1>
      <p className="text-lg text-[var(--color-muted-foreground)] mb-8">
        Displays a scalar value within a known range (e.g., disk usage, battery level).
      </p>

      <Section title="Values" description="Meter at various fill levels.">
        <ComponentPreview>
          <div className="max-w-md space-y-4">
            <div><p className="text-sm mb-1">Low (20%)</p><Meter value={20} /></div>
            <div><p className="text-sm mb-1">Medium (50%)</p><Meter value={50} /></div>
            <div><p className="text-sm mb-1">High (80%)</p><Meter value={80} /></div>
            <div><p className="text-sm mb-1">Full (100%)</p><Meter value={100} /></div>
          </div>
        </ComponentPreview>
      </Section>

      <Section title="Storage Usage" description="A real-world meter pattern.">
        <ComponentPreview>
          <div className="max-w-sm border-2 border-[var(--color-border)] rounded-lg p-4">
            <div className="flex justify-between mb-2">
              <span className="text-sm font-medium">Storage</span>
              <span className="text-sm text-[var(--color-muted-foreground)]">7.5 GB / 10 GB</span>
            </div>
            <Meter value={75} />
          </div>
        </ComponentPreview>
      </Section>

      <Section title="API Reference">
        <PropsTable props={[
          { name: 'value', type: 'number', default: '0', description: 'Current value (between min and max).' },
          { name: 'min', type: 'number', default: '0', description: 'Minimum value.' },
          { name: 'max', type: 'number', default: '100', description: 'Maximum value.' },
          { name: 'low', type: 'number', default: '-', description: 'Low threshold.' },
          { name: 'high', type: 'number', default: '-', description: 'High threshold.' },
          { name: 'optimum', type: 'number', default: '-', description: 'Optimal value.' },
          { name: 'className', type: 'string', default: '-', description: 'Additional CSS classes.' },
        ]} />
      </Section>

      <Section title="Accessibility">
        <div className="border-2 border-[var(--color-border)] rounded-lg p-4 space-y-2">
          <p className="text-sm"><strong>Role:</strong> Uses role=meter with aria-valuenow, aria-valuemin, aria-valuemax.</p>
          <p className="text-sm"><strong>Meter vs Progress:</strong> Meter is for static scalar values (disk space), Progress is for task completion.</p>
        </div>
      </Section>
    </div>
  );
}
