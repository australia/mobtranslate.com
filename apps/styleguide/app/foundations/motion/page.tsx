'use client';
import { useState } from 'react';
import { Section } from '../../../components/section';

const durations = [
  { name: 'instant', value: '0ms', css: '--duration-instant' },
  { name: 'fast', value: '100ms', css: '--duration-fast' },
  { name: 'normal', value: '200ms', css: '--duration-normal' },
  { name: 'slow', value: '300ms', css: '--duration-slow' },
  { name: 'slower', value: '500ms', css: '--duration-slower' },
];

const easings = [
  { name: 'default', value: 'cubic-bezier(0.4, 0, 0.2, 1)', css: '--ease-default' },
  { name: 'in', value: 'cubic-bezier(0.4, 0, 1, 1)', css: '--ease-in' },
  { name: 'out', value: 'cubic-bezier(0, 0, 0.2, 1)', css: '--ease-out' },
  { name: 'in-out', value: 'cubic-bezier(0.4, 0, 0.2, 1)', css: '--ease-in-out' },
  { name: 'bounce', value: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)', css: '--ease-bounce' },
];

export default function MotionPage() {
  const [playing, setPlaying] = useState<string | null>(null);

  return (
    <div>
      <h1 className="text-4xl font-bold mb-2">Motion</h1>
      <p className="text-lg text-[var(--color-muted-foreground)] mb-8">Animation durations and easing curves.</p>

      <Section title="Durations">
        <div className="space-y-4">
          {durations.map((d) => (
            <div key={d.name} className="flex items-center gap-4">
              <span className="text-xs font-mono w-20 text-[var(--color-muted-foreground)]">{d.name}</span>
              <span className="text-xs font-mono w-16 text-[var(--color-muted-foreground)]">{d.value}</span>
              <div className="flex-1 h-8 bg-[var(--color-muted)] rounded relative overflow-hidden">
                <div
                  className="absolute left-0 top-0 h-full bg-[var(--color-primary)] rounded"
                  style={{
                    width: playing === d.name ? '100%' : '0%',
                    transition: `width ${d.value} ease`,
                  }}
                />
              </div>
              <button className="mt-btn mt-btn-outline mt-btn-sm" onClick={() => { setPlaying(null); setTimeout(() => setPlaying(d.name), 10); }}>
                Play
              </button>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Easing Curves">
        <div className="space-y-3">
          {easings.map((e) => (
            <div key={e.name} className="flex items-center gap-4 border-b border-[var(--color-border)] pb-2">
              <span className="text-xs font-mono w-20">{e.name}</span>
              <span className="text-xs font-mono flex-1 text-[var(--color-muted-foreground)]">{e.value}</span>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
