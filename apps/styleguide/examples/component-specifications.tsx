'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import * as UI from '@mobtranslate/ui';

type Preset = keyof typeof UI.componentPresets;
const names = Object.keys(UI.componentPresets) as Preset[];

function ToastPreview() {
  const manager = UI.useToastManager();
  return <>
    <UI.Button type="button" onClick={() => manager.add({ title: 'Local specification notice', description: 'Inspect the real notification and its viewport.', timeout: 0 })}>Show specification notice</UI.Button>
    <UI.ToastPortal><UI.ToastViewport>{manager.toasts.map((toast) => <UI.Toast key={toast.id} toast={toast}><UI.ToastContent><UI.ToastTitle /><UI.ToastDescription /></UI.ToastContent><UI.ToastClose /></UI.Toast>)}</UI.ToastViewport></UI.ToastPortal>
  </>;
}

function Fixtures({ preset, long }: { preset: Preset; long: boolean }) {
  const [action, setAction] = useState('');
  const label = long ? 'A longer English interface label demonstrates wrapping and content-driven geometry.' : 'First local choice';
  const choices = [{ value: 'first', label }, { value: 'second', label: 'Second local choice' }];
  const previews: Record<Preset, ReactNode> = {
    buttonTokens: <div className="flex flex-wrap gap-3">{(['sm', 'md', 'lg', 'icon'] as const).map(size => <UI.Button key={size} type="button" size={size} aria-label={`Inspect ${size} button`} onClick={() => setAction(`Activated the ${size} local specimen.`)}>{size === 'icon' ? <span aria-hidden="true">+</span> : size}</UI.Button>)}</div>,
    inputTokens: <div className="space-y-3">{(['sm', 'md', 'lg'] as const).map(size => <label key={size} className="block">{size} input<UI.Input size={size} defaultValue="Local editable text" /></label>)}</div>,
    dialogTokens: <div className="flex flex-wrap gap-3">{(['sm', 'md', 'lg', 'xl'] as const).map(size => <UI.Dialog key={size}><UI.DialogTrigger render={<UI.Button type="button" />}>Open {size} specimen</UI.DialogTrigger><UI.DialogPortal><UI.DialogBackdrop /><UI.DialogPopup size={size}><UI.DialogTitle>{size} local dialog</UI.DialogTitle><UI.DialogDescription>Viewport bounds and content can constrain this surface.</UI.DialogDescription><UI.DialogClose render={<UI.Button type="button" />}>Close specimen</UI.DialogClose></UI.DialogPopup></UI.DialogPortal></UI.Dialog>)}</div>,
    selectTokens: <UI.Select defaultValue="first" items={choices}><UI.SelectTrigger aria-label="Specification choice"><UI.SelectValue /></UI.SelectTrigger><UI.SelectPortal><UI.SelectPositioner sideOffset={8} collisionPadding={8} alignItemWithTrigger={false}><UI.SelectPopup><UI.SelectList>{choices.map(choice => <UI.SelectItem key={choice.value} value={choice.value}>{choice.label}</UI.SelectItem>)}</UI.SelectList></UI.SelectPopup></UI.SelectPositioner></UI.SelectPortal></UI.Select>,
    tabsTokens: <UI.Tabs defaultValue="first"><UI.TabsList aria-label="Specification sections"><UI.TabsTrigger value="first">{label}</UI.TabsTrigger><UI.TabsTrigger value="second">Second section</UI.TabsTrigger></UI.TabsList><UI.TabsContent value="first">First local panel</UI.TabsContent><UI.TabsContent value="second">Second local panel</UI.TabsContent></UI.Tabs>,
    tooltipTokens: <UI.TooltipProvider delay={0}><UI.Tooltip><UI.TooltipTrigger render={<UI.Button type="button" />}>Focus for size hint</UI.TooltipTrigger><UI.TooltipPortal><UI.TooltipPositioner sideOffset={8} collisionPadding={8}><UI.TooltipPopup>Supplemental English size hint. Move focus or press Escape to dismiss.</UI.TooltipPopup></UI.TooltipPositioner></UI.TooltipPortal></UI.Tooltip></UI.TooltipProvider>,
    popoverTokens: <UI.Popover><UI.PopoverTrigger render={<UI.Button type="button" />}>Open size surface</UI.PopoverTrigger><UI.PopoverPortal><UI.PopoverPositioner sideOffset={8} collisionPadding={8}><UI.PopoverPopup><UI.PopoverTitle>Local size surface</UI.PopoverTitle><UI.PopoverDescription>{label}</UI.PopoverDescription><UI.PopoverClose render={<UI.Button type="button" />}>Close size surface</UI.PopoverClose></UI.PopoverPopup></UI.PopoverPositioner></UI.PopoverPortal></UI.Popover>,
    toastTokens: <UI.ToastProvider><ToastPreview /></UI.ToastProvider>,
    checkboxTokens: <UI.Checkbox label={label} defaultChecked />,
    switchTokens: <UI.Switch label={label} defaultChecked />,
    radioTokens: <UI.RadioGroup defaultValue="first" aria-label="Specification radio choices"><UI.RadioItem value="first" label={label} /><UI.RadioItem value="second" label="Second local choice" /></UI.RadioGroup>,
    sliderTokens: <UI.Slider defaultValue={50} aria-label="Specification range" />,
    progressTokens: <UI.Progress value={50} aria-label="Local specification progress" />,
    menuTokens: <UI.Menu><UI.MenuTrigger render={<UI.Button type="button" />}>Open size menu</UI.MenuTrigger><UI.MenuPortal><UI.MenuPositioner sideOffset={8} collisionPadding={8}><UI.MenuPopup><UI.MenuItem onClick={() => setAction('Activated the first local command.')}>{label}</UI.MenuItem><UI.MenuItem onClick={() => setAction('Activated the second local command.')}>Second local command</UI.MenuItem></UI.MenuPopup></UI.MenuPositioner></UI.MenuPortal></UI.Menu>,
    accordionTokens: <UI.Accordion defaultValue={['first']}><UI.AccordionItem value="first"><UI.AccordionHeader><UI.AccordionTrigger>{label}</UI.AccordionTrigger></UI.AccordionHeader><UI.AccordionPanel><p>This panel has no default padding. Its content controls its own spacing.</p></UI.AccordionPanel></UI.AccordionItem></UI.Accordion>,
    avatarTokens: <div className="flex flex-wrap gap-3">{(['sm', 'md', 'lg', 'xl'] as const).map(size => <UI.Avatar key={size} size={size} alt={`Local ${size} avatar placeholder`} fallback="A" />)}</div>,
    separatorTokens: <UI.Separator aria-hidden="true" />,
    meterTokens: <UI.Meter value={50} min={0} max={100} aria-label="Local specification quantity" />,
    scrollAreaTokens: <UI.ScrollArea style={{ height: 180 }} viewportProps={{ 'aria-label': 'Specification scrolling records', tabIndex: 0 }}><div style={{ width: 'max(1600px, 200vw)' }}>{Array.from({ length: 20 }, (_, index) => <p key={index}>Local English record {index + 1}. Native scrolling exposes both authored tracks.</p>)}</div></UI.ScrollArea>,
  };
  return <>{previews[preset]}{action && <p role="status">{action}</p>}</>;
}

interface Measurement { binding: string; available: boolean; computed: string; width: number; height: number }
interface Capture { measurement: Measurement; theme: string; viewport: number; scoped: boolean; long: boolean; capturedAt: string }
export function ComponentSpecificationsExample() {
  const [ready, setReady] = useState(false);
  const [preset, setPreset] = useState<Preset>('inputTokens');
  const [path, setPath] = useState('sm.paddingX');
  const [long, setLong] = useState(false);
  const [scoped, setScoped] = useState(false);
  const [measurement, setMeasurement] = useState<Measurement>({ binding: '', available: false, computed: '', width: 0, height: 0 });
  const [captures, setCaptures] = useState<Record<string, Capture>>({});
  const stage = useRef<HTMLDivElement>(null);
  const rows = UI.componentTokenSpecifications.filter(row => row.exportName === preset);
  const specification = rows.find(row => row.path === path) ?? rows[0];
  const binding = `${specification.exportName}.${specification.path}`;
  const available = measurement.binding === binding && measurement.available;
  const capture = captures[binding];
  useEffect(() => { setReady(true); }, []);
  useEffect(() => {
    let frame = 0;
    let observed: Element | null = null;
    const sizes = new ResizeObserver(schedule);
    function read() {
      const pseudo = specification.selector.endsWith('::after') ? '::after' : null;
      const selector = pseudo ? specification.selector.slice(0, -pseudo.length) : specification.selector;
      // Only one fixture family is mounted. Portals intentionally live outside the stage.
      const candidates = [...(stage.current?.querySelectorAll(selector) ?? []), ...document.querySelectorAll(selector)];
      const target = candidates.find(element => element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden') ?? null;
      if (target !== observed) { sizes.disconnect(); if (target) sizes.observe(target); observed = target; }
      const bounds = target?.getBoundingClientRect();
      const next = target && bounds ? { binding, available: true, computed: getComputedStyle(target, pseudo).getPropertyValue(specification.computedProperty).trim(), width: bounds.width, height: bounds.height } : { binding, available: false, computed: '', width: 0, height: 0 };
      setMeasurement(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
      if (next.available) {
        const observation = { measurement: next, theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light', viewport: innerWidth, scoped, long };
        setCaptures(previous => {
          const old = previous[binding];
          if (old && JSON.stringify({ measurement: old.measurement, theme: old.theme, viewport: old.viewport, scoped: old.scoped, long: old.long }) === JSON.stringify(observation)) return previous;
          return { ...previous, [binding]: { ...observation, capturedAt: new Date().toISOString() } };
        });
      }
      if (target?.getAnimations().some(animation => animation.playState === 'running')) schedule();
    }
    function schedule() { cancelAnimationFrame(frame); frame = requestAnimationFrame(read); }
    const changes = new MutationObserver(schedule);
    changes.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'data-open', 'data-closed', 'data-checked', 'data-starting-style', 'data-ending-style'] });
    changes.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    const animationEvents = ['animationstart', 'animationend', 'animationcancel', 'transitionrun', 'transitionend', 'transitioncancel'];
    for (const event of animationEvents) document.addEventListener(event, schedule, true);
    window.addEventListener('resize', schedule); schedule();
    return () => { changes.disconnect(); sizes.disconnect(); cancelAnimationFrame(frame); window.removeEventListener('resize', schedule); for (const event of animationEvents) document.removeEventListener(event, schedule, true); };
  }, [specification, binding, preset, scoped, long]);
  const scopeStyle = scoped ? { '--radius-md': '20px', fontSize: '24px' } as CSSProperties : undefined;
  return <div data-component-specifications data-current-specification={binding} data-inspector-ready={ready} className="space-y-4">
    {!ready && <p role="status">Loading the component inspector…</p>}
    <label className="block" htmlFor="component-preset">Component preset</label>
    <select id="component-preset" className="mt-input w-full" disabled={!ready} value={preset} onChange={event => { const next = event.target.value as Preset; setPreset(next); setPath(UI.componentTokenSpecifications.find(row => row.exportName === next)!.path); }}>
      {names.map(name => <option key={name} value={name}>{name}</option>)}
    </select>
    <label className="block" htmlFor="component-field">Specification field</label>
    <select id="component-field" className="mt-input w-full" disabled={!ready} value={specification.path} onChange={event => setPath(event.target.value)}>{rows.map(row => <option key={row.path} value={row.path} data-specification={JSON.stringify(row)}>{row.path}</option>)}</select>
    <div className="space-y-2"><label className="flex items-center gap-2 min-h-11"><input type="checkbox" disabled={!ready} checked={long} onChange={event => setLong(event.target.checked)} />Use longer English labels</label><label className="flex items-center gap-2 min-h-11"><input type="checkbox" disabled={!ready} checked={scoped} onChange={event => setScoped(event.target.checked)} />Override stage radius and inherited font size</label></div>
    <div key={preset} ref={stage} data-component-spec-stage className="p-4 border border-[var(--color-border)] rounded-lg" style={scopeStyle}><Fixtures preset={preset} long={long} /></div>
    <dl className="space-y-2" style={{ overflowWrap: 'anywhere' }}>
      <div><dt>Authored specification</dt><dd><code data-component-authored>{specification.value}</code></dd></div>
      <div><dt>Source binding</dt><dd><code>{specification.selector} → {specification.property}</code><br />{specification.origin === 'declaration' ? `${specification.source}:${specification.line}` : `${specification.origin} value; no component declaration`}</dd></div>
      <div><dt>Browser resolved {specification.computedProperty}</dt><dd data-component-computed>{available ? measurement.computed : measurement.binding !== binding ? 'Reading selected specimen…' : 'Not rendered; open this specimen’s surface to inspect it.'}</dd></div>
      <div><dt>Host bounding rectangle, CSS pixels</dt><dd>{available ? `${measurement.width.toFixed(2)} × ${measurement.height.toFixed(2)}` : 'Unavailable'}</dd></div>
    </dl>
    {specification.note && <p>{specification.note}</p>}
    <p role="status" data-component-measurement data-measurement={JSON.stringify(measurement)}>{available ? 'Rendered specimen measured.' : measurement.binding !== binding ? 'Reading selected specimen…' : 'No visible matching part. Open the selected surface or choose a rendered field.'}</p>
    <div data-component-capture data-capture={JSON.stringify(capture ?? null)} style={{ overflowWrap: 'anywhere' }}><p className="font-semibold">Last captured observation for this field</p>{capture ? <p>{capture.measurement.computed}; host {capture.measurement.width.toFixed(2)} × {capture.measurement.height.toFixed(2)} CSS px. {capture.theme} theme, {capture.viewport}px viewport, stage override {capture.scoped ? 'on' : 'off'}, long labels {capture.long ? 'on' : 'off'}. Captured {capture.capturedAt}. This remains readable after closing a modal; it is an observation from that context, not a current measurement of a closed part.</p> : <p>No observation yet. Open the selected part to capture it.</p>}</div>
    <p>Open menus and surfaces with the specimen’s own controls; dismiss with their normal keyboard actions. Portals use the page viewport and do not inherit the stage override. A pseudo-element measurement reports its computed property and the host element’s rectangle separately.</p>
  </div>;
}
