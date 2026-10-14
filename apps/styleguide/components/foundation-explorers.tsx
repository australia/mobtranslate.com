'use client';

import { useEffect, useId, useMemo, useReducer, useRef, useState } from 'react';
import { Button } from '@mobtranslate/ui';
import catalogue from '../content/tokens.json';

const spacingTokens = catalogue.tokens.filter((token) => token.name.startsWith('--spacing-')).sort((a, b) => parseFloat(a.value) - parseFloat(b.value));
const shadows = catalogue.tokens.filter((token) => token.name.startsWith('--shadow-'));
const durations = catalogue.tokens.filter((token) => token.name.startsWith('--duration-'));
const easings = catalogue.tokens.filter((token) => token.name.startsWith('--ease-'));

export function IconographyExplorer() {
  const [size, setSize] = useState('24');
  const [saved, setSaved] = useState(false);
  const [rtl, setRtl] = useState(false);
  const [status, setStatus] = useState('');
  return <div className="space-y-4">
    <label className="block">Icon size<select className="mt-input w-full max-w-sm mt-2" value={size} onChange={event => setSize(event.target.value)}>{[16, 20, 24, 32].map(value => <option key={value} value={value}>{value}px</option>)}</select></label>
    <label className="flex items-center gap-3 min-h-11"><input type="checkbox" checked={rtl} onChange={event => setRtl(event.target.checked)} />Right-to-left navigation</label>
    <div data-icon-preview dir={rtl ? 'rtl' : 'ltr'} className="flex flex-wrap items-center gap-6 p-4 border border-[var(--color-border)] rounded-lg">
      <button type="button" aria-label="Save entry" aria-pressed={saved} className="min-h-11 min-w-11 p-2 border border-[var(--color-border)] rounded-md flex items-center justify-center" onClick={() => { setSaved(!saved); setStatus(saved ? 'Example entry removed from saved items.' : 'Example entry saved.'); }}>
        <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false" fill={saved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 4h12v16l-6-4-6 4z" /></svg>
      </button>
      <span className="inline-flex items-center gap-2"><svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14m-6-6 6 6-6 6" transform={rtl ? 'translate(24 0) scale(-1 1)' : undefined} /></svg>Next page (direction specimen)</span>
    </div>
    <p role="status" className="text-sm">{status}</p>
    <p className="text-sm">Save entry toggles local example state only. The arrow is a decorative direction specimen beside text, not a navigation control.</p>
  </div>;
}

export { TypographyExplorer } from './typography-explorer';

export function SpacingExplorer() {
  const [gap, setGap] = useState('--spacing-4');
  return <div className="space-y-4">
    <label className="block">Spacing token<select className="mt-input w-full max-w-sm mt-2" value={gap} onChange={(event) => setGap(event.target.value)}>{spacingTokens.map((token) => <option key={token.name} value={token.name}>{token.name} · {token.value}</option>)}</select></label>
    <div data-spacing-preview className="flex flex-wrap p-4 bg-[var(--color-muted)] rounded-lg" style={{ gap: `var(${gap})` }}>
      <span className="p-3 border border-[var(--color-border)] rounded">Entry text</span><span className="p-3 border border-[var(--color-border)] rounded">Source record</span><span className="p-3 border border-[var(--color-border)] rounded">Review state</span>
    </div>
    <p className="text-sm">The gap changes; the individual hit areas and content padding stay independent.</p>
  </div>;
}

export function ElevationExplorer() {
  const [shadow, setShadow] = useState('--shadow-md');
  const [surface, setSurface] = useState('card');
  const surfacePairs = {
    card: ['--color-card', '--color-card-foreground'],
    popover: ['--color-popover', '--color-popover-foreground'],
    muted: ['--color-muted', '--color-muted-foreground'],
  };
  const pair = surfacePairs[surface as keyof typeof surfacePairs];
  return <div className="space-y-4" data-elevation-lab>
    <label className="block">Shadow token<select data-elevation-shadow className="mt-input w-full max-w-sm mt-2" value={shadow} onChange={(event) => setShadow(event.target.value)}><option value="none">None · flat surface</option>{shadows.map((token) => <option key={token.name} value={token.name}>{token.name}</option>)}</select></label>
    <label className="block">Surface pair<select data-elevation-surface className="mt-input w-full max-w-sm mt-2" value={surface} onChange={(event) => setSurface(event.target.value)}>{Object.keys(surfacePairs).map(name => <option key={name} value={name}>{name} / {name}-foreground</option>)}</select></label>
    <div className="p-3 rounded-lg" style={{background: 'var(--color-background)'}}><div data-elevation-preview className="p-3 max-w-sm border border-[var(--color-border)] rounded-lg" style={{ boxShadow: shadow === 'none' ? 'none' : `var(${shadow})`, background: `var(${pair[0]})`, color: `var(${pair[1]})` }}><h3 className="font-semibold mb-2" style={{color: 'inherit'}}>Source details</h3><p>The foreground follows this surface pair. The border preserves the boundary when shadows are reduced or unavailable.</p></div></div>
    <p data-elevation-values className="font-mono text-sm" style={{overflowWrap: 'anywhere'}}>box-shadow: {shadow === 'none' ? 'none' : `var(${shadow})`}; background: var({pair[0]}); color: var({pair[1]});</p>
    <p className="text-sm">Presentation only: these controls do not change stacking order, focus, semantic roles or modality. A different fill may resolve to the same value in a theme. Inspect actual colors and context.</p>
  </div>;
}

export function MotionExplorer() {
  const [duration, setDuration] = useState('--duration-normal');
  const [easing, setEasing] = useState('--ease-out');
  const [status, setStatus] = useState('Ready to replay the example.');
  const element = useRef<HTMLDivElement>(null);
  const animation = useRef<Animation | null>(null);
  useEffect(() => () => animation.current?.cancel(), []);
  const play = () => {
    if (!element.current) return;
    animation.current?.cancel();
    element.current.style.transform = 'translateX(0px)';
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      element.current.style.transform = 'translateX(160px)';
      setStatus('Reduced motion: the example moved instantly.');
      return;
    }
    const style = getComputedStyle(document.documentElement);
    const current = element.current.animate([{ transform: 'translateX(0px)' }, { transform: 'translateX(160px)' }], {
      duration: parseFloat(style.getPropertyValue(duration)), easing: style.getPropertyValue(easing).trim(), fill: 'forwards',
    });
    animation.current = current;
    setStatus('Example transition playing.');
    current.finished.then(() => { if (animation.current === current) setStatus('Example transition complete.'); }).catch(() => { /* Cancellation is intentional. */ });
  };
  const reset = () => { animation.current?.cancel(); animation.current = null; if (element.current) element.current.style.transform = 'translateX(0px)'; setStatus('Example reset.'); };
  return <div className="space-y-4">
    <div className="grid gap-4 sm:grid-cols-2">
      <label>Duration<select className="mt-input w-full mt-2" value={duration} onChange={(event) => setDuration(event.target.value)}>{durations.map((token) => <option key={token.name} value={token.name}>{token.name} · {token.value}</option>)}</select></label>
      <label>Easing<select className="mt-input w-full mt-2" value={easing} onChange={(event) => setEasing(event.target.value)}>{easings.map((token) => <option key={token.name} value={token.name}>{token.name}</option>)}</select></label>
    </div>
    <div className="p-4 bg-[var(--color-muted)] rounded-lg overflow-hidden"><div ref={element} data-motion-preview className="size-10 rounded-md bg-[var(--color-primary)]" /></div>
    <div className="flex flex-wrap gap-3"><Button onClick={play}>Replay transition</Button><Button variant="outline" onClick={reset}>Reset transition</Button></div>
    <p role="status" className="text-sm">{status}</p>
  </div>;
}

export function WritingExplorer() {
  const [title, setTitle] = useState('Search did not finish');
  const [body, setBody] = useState('Your search text is still here. Check your connection and try again.');
  const [action, setAction] = useState('Try again');
  const [status, setStatus] = useState('');
  return <div className="space-y-4">
    <label className="block">Message heading<input className="mt-input w-full mt-2" value={title} onChange={(event) => setTitle(event.target.value)} /></label>
    <label className="block">Message body<textarea className="mt-textarea mt-textarea-resize-vertical w-full mt-2 h-24" value={body} onChange={(event) => setBody(event.target.value)} /></label>
    <label className="block">Action label<input className="mt-input w-full mt-2" value={action} onChange={(event) => setAction(event.target.value)} /></label>
    <div data-writing-preview className="p-5 border border-[var(--color-border)] rounded-lg space-y-3"><h3 className="font-semibold break-words">{title || 'Add a message heading'}</h3><p className="break-words whitespace-pre-wrap">{body || 'Add an explanation and recovery step.'}</p><Button onClick={() => setStatus('Example action activated. No request was sent.')} disabled={!action.trim()}>{action || 'Add an action label'}</Button></div>
    <p role="status" className="text-sm">{status}</p>
    <p className="text-sm">Edit and assess the copy yourself. This is a layout preview, not automated language review or an actual failed request.</p>
  </div>;
}

export function InternationalizationExplorer() {
  const [locale, setLocale] = useState('en-AU');
  const [timeZone, setTimeZone] = useState('UTC');
  const [rtl, setRtl] = useState(false);
  const [text, setText] = useState('Source details remain attached to this result.');
  const id = useId();
  const result = useMemo(() => {
    try {
      Intl.getCanonicalLocales(locale);
      const date = new Intl.DateTimeFormat(locale, { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
      return { number: new Intl.NumberFormat(locale).format(12345.67), date: date.format(new Date('2026-10-13T13:15:00Z')), resolved: date.resolvedOptions().locale, error: null };
    } catch { return { number: '', date: '', resolved: '', error: 'Enter a valid locale and supported time zone. Formatting is paused until the values are valid.' }; }
  }, [locale, timeZone]);
  return <div className="space-y-4">
    <div className="grid gap-4 sm:grid-cols-2"><label>Requested locale<input className="mt-input w-full mt-2" value={locale} onChange={(event) => setLocale(event.target.value)} spellCheck={false} aria-describedby={id} aria-invalid={Boolean(result.error)} /></label><label>Time zone<input className="mt-input w-full mt-2" value={timeZone} onChange={(event) => setTimeZone(event.target.value)} spellCheck={false} aria-describedby={id} aria-invalid={Boolean(result.error)} /></label></div>
    <label className="block">Text to inspect<textarea className="mt-textarea mt-textarea-resize-vertical mt-2 w-full h-24" value={text} onChange={(event) => setText(event.target.value)} /></label>
    <label className="flex items-center gap-3 min-h-11"><input type="checkbox" checked={rtl} onChange={(event) => setRtl(event.target.checked)} />Right-to-left preview</label>
    <p id={id} role="status" className="text-sm">{result.error || `Requested ${locale}; resolved ${result.resolved}. The example instant is 2026-10-13 at 13:15 UTC.`}</p>
    {!result.error && <div data-internationalization-preview dir={rtl ? 'rtl' : 'ltr'} className="p-5 border border-[var(--color-border)] rounded-lg space-y-3"><p className="break-words whitespace-pre-wrap">{text}</p><dl className="space-y-2"><div><dt className="font-semibold">Formatted number</dt><dd><bdi>{result.number}</bdi></dd></div><div><dt className="font-semibold">Formatted date and time</dt><dd><bdi>{result.date}</bdi></dd></div></dl></div>}
    <p className="text-sm">Locale formatting changes numbers and dates. It does not translate the interface or verify your text. Direction is selected explicitly so you can inspect bidirectional content without changing the whole page.</p>
  </div>;
}

const initialItems = [{ id: 'entry', label: 'Entry text' }, { id: 'source', label: 'Source record' }, { id: 'review', label: 'Review state' }];
type OrderAction = { type: 'step'; id: string; delta: number } | { type: 'drop'; id: string; targetId: string } | { type: 'reset' };
function orderReducer(state: { items: typeof initialItems; announcement: string }, action: OrderAction) {
  if (action.type === 'reset') return { items: initialItems, announcement: 'Example order reset.' };
  const from = state.items.findIndex((item) => item.id === action.id);
  const to = action.type === 'step' ? from + action.delta : state.items.findIndex((item) => item.id === action.targetId);
  if (from < 0 || to < 0 || to >= state.items.length || from === to) return state;
  const items = [...state.items];
  const [item] = items.splice(from, 1);
  items.splice(to, 0, item);
  return { items, announcement: `${item.label} moved to position ${to + 1} of ${items.length}.` };
}
export function InputGesturesExplorer() {
  const [state, dispatch] = useReducer(orderReducer, { items: initialItems, announcement: 'Drag an item or use its move buttons.' });
  const dragged = useRef<string | null>(null);
  const list = useRef<HTMLOListElement>(null);
  const pendingFocus = useRef<string | null>(null);
  useEffect(() => {
    if (!pendingFocus.current) return;
    const item = Array.from(list.current?.children ?? []).find(node => node.getAttribute('data-item-id') === pendingFocus.current);
    item?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    pendingFocus.current = null;
  }, [state.items]);
  const step = (id: string, delta: number) => { pendingFocus.current = id; dispatch({ type: 'step', id, delta }); };
  return <div className="space-y-4">
    <p className="text-sm">Reorder this example list using drag, pointer, touch or keyboard controls. This does not change dictionary records.</p>
    <ol ref={list} data-order-preview className="space-y-3">{state.items.map((item, index) => <li key={item.id} data-item-id={item.id} draggable onDragStart={(event) => { dragged.current = item.id; event.dataTransfer.setData('text/plain', item.id); event.dataTransfer.effectAllowed = 'move'; }} onDragEnd={() => { dragged.current = null; }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (dragged.current) dispatch({ type: 'drop', id: dragged.current, targetId: item.id }); dragged.current = null; }} className="flex flex-wrap items-center justify-between gap-3 p-3 border border-[var(--color-border)] rounded-lg">
      <span>{index + 1}. {item.label}</span><div className="flex gap-2"><Button variant="outline" disabled={index === 0} aria-label={`Move ${item.label} up`} onClick={() => step(item.id, -1)}>Up</Button><Button variant="outline" disabled={index === state.items.length - 1} aria-label={`Move ${item.label} down`} onClick={() => step(item.id, 1)}>Down</Button></div>
    </li>)}</ol>
    <p role="status" className="text-sm">{state.announcement}</p>
    <Button variant="ghost" onClick={() => dispatch({ type: 'reset' })}>Reset order</Button>
  </div>;
}
