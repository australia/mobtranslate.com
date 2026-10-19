'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Button, Input } from '@mobtranslate/ui';
import './foundation-labs.css';

export function LayoutLab() {
  const id = useId();
  const [width, setWidth] = useState(720);
  const [direction, setDirection] = useState<'ltr' | 'rtl'>('ltr');
  const compact = width < 640;
  return (
    <div className="space-y-4">
      <label htmlFor={id} className="block font-medium">Example container width: {width}px</label>
      <input id={id} type="range" min="280" max="960" step="20" value={width} onChange={(event) => setWidth(Number(event.target.value))} className="w-full min-h-11" />
      <label className="flex items-center gap-3 min-h-11"><input type="checkbox" checked={direction === 'rtl'} onChange={(event) => setDirection(event.target.checked ? 'rtl' : 'ltr')} />Right-to-left layout</label>
      <div role="region" className="overflow-x-auto border border-[var(--color-border)] rounded-lg p-3" tabIndex={0} aria-label="Scrollable responsive layout example">
        <div dir={direction} style={{ width, display: 'grid', gridTemplateColumns: compact ? '1fr' : '160px minmax(0, 1fr)', gap: '1rem' }}>
          <div className="bg-[var(--color-muted)] rounded p-4">{compact ? 'Menu in header' : 'Navigation column'}</div>
          <div className="border border-[var(--color-border)] rounded p-4 space-y-3">
            <h3 className="font-semibold">Dictionary search</h3>
            <p className="text-sm">Search and source details stay together. In compact layouts the navigation becomes a menu; the reading column keeps its full width.</p>
            <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: '0.75rem' }}>
              <div className="p-3 bg-[var(--color-muted)] rounded">Entry details</div>
              <div className="p-3 bg-[var(--color-muted)] rounded">Source and review state</div>
            </div>
          </div>
        </div>
      </div>
      <p role="status" className="text-sm">{compact ? 'Compact: one column with header navigation.' : 'Expanded: navigation and content in separate columns.'} This is an intentionally scrollable container demonstration; the page itself reflows.</p>
    </div>
  );
}

export { ShapeLab } from './shape-explorer';

export function StateLab() {
  const id = useId();
  const [value, setValue] = useState('');
  const [state, setState] = useState<'ready' | 'loading' | 'validation' | 'error' | 'success' | 'cancelled'>('ready');
  const [disabled, setDisabled] = useState(false);
  const input=useRef<HTMLInputElement>(null);
  const restoreFocus=useRef(false);
  useEffect(()=>{if(restoreFocus.current&&state!=='loading'){input.current?.focus();restoreFocus.current=false;}},[state]);
  const finish=(outcome:'success'|'error'|'cancelled')=>{restoreFocus.current=true;setState(outcome);};

  const message = state === 'validation' ? 'Enter a search term before continuing.' : state === 'error' ? 'Example request failed. Your term is retained; retry or reset this local example.' : state === 'cancelled' ? 'Example request cancelled. Your term is retained.' : state === 'loading' ? 'Example request is waiting. Choose a result below.' : state === 'success' ? 'Example request completed. No dictionary data was sent.' : 'Enter any English search term for this local demonstration.';
  return (
    <div className="space-y-4 max-w-md" data-state-lab>
      <label htmlFor={id} className="block font-medium">Search term</label>
      <Input ref={input} id={id} value={value} onChange={(event) => { setValue(event.target.value); setState('ready'); }} disabled={disabled || state === 'loading'} aria-invalid={state === 'validation'} aria-describedby={`${id}-status`} />
      <p id={`${id}-status`} role="status" className="text-sm">{message}</p>
      <Button data-state-submit disabled={disabled} loading={state === 'loading'} onClick={() => setState(value.trim() ? 'loading' : 'validation')}>Search example</Button>
      {state === 'loading' && <div className="flex flex-wrap gap-2">
        <Button data-state-outcome="success" variant="outline" onClick={() => finish('success')}>Simulate success</Button>
        <Button data-state-outcome="error" variant="outline" onClick={() => finish('error')}>Simulate error</Button>
        <Button data-state-outcome="cancelled" variant="ghost" onClick={() => finish('cancelled')}>Cancel request</Button>
      </div>}
      <label className="flex gap-3 items-center min-h-11"><input data-state-disable type="checkbox" checked={disabled} onChange={(event) => { setDisabled(event.target.checked); setState('ready'); }} />Disable the example controls</label>
      <Button data-state-reset variant="ghost" onClick={() => { setState('ready'); setValue(''); setDisabled(false); }}>Reset example</Button>
    </div>
  );
}
