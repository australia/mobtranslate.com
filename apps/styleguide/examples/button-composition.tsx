'use client';
import { useId, useRef, useState } from 'react';
import { Button } from '@mobtranslate/ui';

export function ButtonCompositionExample() {
  const id = useId();
  const outer = useRef<HTMLElement>(null);
  const inner = useRef<HTMLAnchorElement>(null);
  const [disabled, setDisabled] = useState(false);
  const [events, setEvents] = useState<string[]>([]);
  return <div data-button-composition className="space-y-4">
    <label className="flex items-center gap-3 min-h-11"><input type="checkbox" checked={disabled} onChange={event => setDisabled(event.target.checked)} />Disable composed link</label>
    <Button asChild ref={outer} variant="secondary" disabled={disabled} aria-describedby={`${id}-help`} style={{ letterSpacing: '0.02em' }} onClickCapture={() => setEvents(current => [...current, 'wrapper capture'])} onClick={() => setEvents(current => [...current, 'wrapper'])}>
      <a ref={inner} href={`#${id}-destination`} style={{ textDecoration: 'underline' }} onClickCapture={() => setEvents(current => [...current, 'child capture'])} onClick={event => { event.preventDefault(); setEvents(current => [...current, 'child']); }}>Composed example link</a>
    </Button>
    <p id={`${id}-help`}>The link keeps link semantics. Its browser navigation is prevented for this local demonstration.</p>
    <p id={`${id}-destination`} role="status">{events.length ? `Handlers: ${events.join(', ')}. Both refs target the link: ${outer.current === inner.current}.` : 'No link activation yet.'}</p>
    <Button variant="ghost" type="button" onClick={() => setEvents([])}>Reset handler log</Button>
  </div>;
}
