'use client';
import { useState } from 'react';
import { Button, CircularProgress, Meter, Progress } from '@mobtranslate/ui';

export function ProgressCommunicationExample() {
  const [value, setValue] = useState<number | null>(null);
  const [size, setSize] = useState<'sm' | 'md' | 'lg'>('md');
  const text = value === null ? 'Local task underway; total unknown.' : `${value} of 10 local steps complete.`;
  return <div data-progress-lab className="space-y-4">
    <p>No timer invents progress. Choose measured local steps or an unknown total explicitly.</p>
    <label>Circular size <select value={size} onChange={event => setSize(event.target.value as typeof size)} className="mt-input"><option value="sm">Small — 20px</option><option value="md">Medium — 32px</option><option value="lg">Large — 48px</option></select></label>
    <Progress className={state => `lab-progress-${state.status}`} value={value} min={0} max={10} aria-label="Local task progress" getAriaValueText={() => text} />
    <CircularProgress className={state => `lab-circular-${state.status}`} size={size} value={value} min={0} max={10} aria-label="Circular local task progress" getAriaValueText={() => text} />
    <div className="flex flex-wrap gap-3">
      <Button type="button" variant="secondary" onClick={() => setValue(current => Math.min(10, (current ?? 0) + 1))}>Complete one local step</Button>
      <Button type="button" variant="outline" onClick={() => setValue(0)}>Reset measured progress</Button>
      <Button type="button" variant="ghost" onClick={() => setValue(null)}>Use unknown total</Button>
    </div>
    <p role="status" aria-atomic="true">{text}</p>
  </div>;
}

export function MeterCommunicationExample() {
  const [value, setValue] = useState(4);
  return <div data-meter-lab className="space-y-4">
    <label className="block">Local storage sample <input type="range" min="0" max="20" value={value} onChange={event => setValue(Number(event.target.value))} className="block w-full" /></label>
    <Meter value={value} min={0} max={20} aria-label="Local storage sample" getAriaValueText={() => `${value} of 20 sample units used`} />
    <p>{value} of 20 sample units used. This scalar measurement is not task progress, confidence or language proficiency.</p>
  </div>;
}
