'use client';
import { Suspense, useEffect, useRef, useState, type MouseEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button, Drawer, DrawerBackdrop, DrawerClose, DrawerDescription, DrawerPopup, DrawerPortal, DrawerTitle, DrawerTrigger, Input } from '@mobtranslate/ui';
import './adaptive-navigation.css';

const destinations = [
  { id:'overview', label:'Overview', title:'Local workspace overview', icon:<path d="m3 10 9-7 9 7v10H3Z M9 20v-7h6v7" /> },
  { id:'reading', label:'Reading', title:'Local reading settings', icon:<path d="M3 4h7a2 2 0 0 1 2 2v15a3 3 0 0 0-3-2H3Z M21 4h-7a2 2 0 0 0-2 2v15a3 3 0 0 1 3-2h6Z" /> },
  { id:'saved', label:'Saved', title:'Local saved examples', icon:<path d="M6 3h12v18l-6-4-6 4Z" /> },
] as const;
type Destination = typeof destinations[number]['id'];
type Layout = 'drawer' | 'bar' | 'rail';
type Phase = 'idle' | 'held' | 'routing';

function AdaptiveWorkspace() {
  const search = useSearchParams();
  const raw = search.get('demoDestination');
  const matched = destinations.find(item => item.id === raw);
  const invalid = raw !== null && !matched;
  const current = matched ?? destinations[0];
  const [layout, setLayout] = useState<Layout>('drawer');
  const [width, setWidth] = useState(0);
  const [cap, setCap] = useState('available');
  const [compactBar, setCompactBar] = useState(false);
  const [rtl, setRtl] = useState(false);
  const [open, setOpen] = useState(false);
  const [hold, setHold] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [requested, setRequested] = useState<Destination | null>(null);
  const [failed, setFailed] = useState(false);
  const [draft, setDraft] = useState('English-only adaptive workspace draft');
  const [compact, setCompact] = useState(false);
  const [saved, setSaved] = useState(false);
  const [message, setMessage] = useState('Local workspace ready. No remote request or save has occurred.');
  const shell = useRef<HTMLDivElement>(null);
  const persistentNav = useRef<HTMLElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const drawerTitle = useRef<HTMLHeadingElement>(null);
  const previousQuery = useRef(raw);
  const closeTarget = useRef<'opener' | 'arrival' | 'adaptation'>('opener');
  const focusOpenerAfterResize = useRef(false);
  const focusLinkAfterResize = useRef<string | true | null>(null);
  const measuredLayout = useRef<Layout>('drawer');
  const pending = phase !== 'idle';

  function focusArrival() {
    heading.current?.scrollIntoView({block:'start'});
    heading.current?.focus({preventScroll:true});
  }
  function href(target: Destination) {
    const query = new URLSearchParams(search.toString());
    query.set('demoDestination',target);
    return `/patterns/navigation?${query.toString()}#adaptive-workspace-arrival`;
  }
  function commit(target: Destination) {
    setRequested(target);setPhase('routing');setFailed(false);
    try { window.history.pushState(null,'',href(target)); }
    catch { setPhase('idle');setFailed(true);setMessage('The local URL could not be changed. Loaded context and draft remain; retry is available.'); }
  }
  function request(target: Destination) {
    if (pending || (target === current.id && !invalid)) return;
    setRequested(target);setFailed(false);
    if (hold) { setPhase('held');setMessage(`Local ${target} requested; loaded ${current.id} remains visible. Choose an explicit outcome.`); }
    else commit(target);
  }
  function follow(event: MouseEvent<HTMLAnchorElement>, target: Destination) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.defaultPrevented) return;
    event.preventDefault();request(target);
  }
  function outcome(result: 'complete' | 'fail' | 'cancel') {
    if (phase !== 'held' || !requested) return;
    if (result === 'complete') { commit(requested);return; }
    setPhase('idle');setFailed(result === 'fail');
    setMessage(result === 'fail' ? `Local ${requested} failed. Loaded ${current.id} and its draft remain; retry is available.` : `Local destination request cancelled. Loaded ${current.id} remains.`);
    if (result === 'cancel') setRequested(null);
    if (open) drawerTitle.current?.focus();else focusArrival();
  }

  useEffect(() => {
    if (previousQuery.current === raw) return;
    previousQuery.current = raw;
    setRequested(null);setPhase('idle');setFailed(false);
    setMessage(`Local ${current.id} loaded from the actual URL. Page-local task values remain; no remote write occurred.`);
    if (open) { closeTarget.current='arrival';setOpen(false); }
    else {
      // Native history can restore fragment focus after React's commit.
      // Let that settle, then focus the actual arriving task; cancel stale frames.
      let second: number | undefined;
      const first=requestAnimationFrame(()=>{
        second=requestAnimationFrame(()=>{
          if (new URLSearchParams(window.location.search).get('demoDestination') === raw) focusArrival();
        });
      });
      return ()=>{cancelAnimationFrame(first);if(second !== undefined)cancelAnimationFrame(second);};
    }
  },[raw,current.id,open]);

  useEffect(() => {
    const node = shell.current;
    if (!node) return;
    const observer = new ResizeObserver(entries => {
      const measured = entries[0]?.contentRect.width ?? 0;
      const next: Layout = measured < 480 && !compactBar ? 'drawer' : measured < 720 ? 'bar' : 'rail';
      setWidth(Math.round(measured));
      if (next !== measuredLayout.current) {
        if (persistentNav.current?.contains(document.activeElement)) {
          if (next === 'drawer') focusOpenerAfterResize.current=true;
          else focusLinkAfterResize.current=document.activeElement?.getAttribute('data-adaptive-destination') ?? true;
        }
        if (next !== 'drawer' && opener.current === document.activeElement) focusLinkAfterResize.current=true;
      }
      measuredLayout.current=next;
      setLayout(next);
    });
    observer.observe(node);
    return () => observer.disconnect();
  },[compactBar]);

  useEffect(() => {
    if (layout !== 'drawer' && open) { closeTarget.current='adaptation';setOpen(false); }
    if (layout === 'drawer' && focusOpenerAfterResize.current) {
      focusOpenerAfterResize.current=false;opener.current?.focus();
    }
    if (layout !== 'drawer' && focusLinkAfterResize.current) {
      const target=focusLinkAfterResize.current;
      focusLinkAfterResize.current=null;
      const link=target === true ? persistentNav.current?.querySelector<HTMLAnchorElement>('[aria-current=page]') : [...(persistentNav.current?.querySelectorAll<HTMLAnchorElement>('a') ?? [])].find(node=>node.dataset.adaptiveDestination === target);
      link?.focus();
    }
  },[layout,open]);

  function navigation(drawer: boolean) {
    return <nav ref={drawer ? undefined : persistentNav} aria-label="Local workspace destinations" data-adaptive-nav data-adaptive-persistent-nav={drawer ? undefined : ''} className="adaptive-local-nav" data-presentation={drawer ? 'drawer' : layout}>
      <ul>{destinations.map(item => <li key={item.id}><a href={href(item.id)} data-adaptive-destination={item.id} aria-current={current.id === item.id ? 'page' : undefined} aria-disabled={pending || undefined} onClick={event => follow(event,item.id)}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true">{item.icon}</svg><span>{item.label}</span></a></li>)}<li><span className="adaptive-local-unavailable" aria-disabled="true"><span aria-hidden="true">—</span> Remote sources unavailable</span></li></ul>
    </nav>;
  }
  function outcomes() {
    return <div data-adaptive-outcomes className="adaptive-local-actions">
      {phase === 'held' && <><Button type="button" onClick={()=>outcome('complete')}>Complete local destination</Button><Button type="button" variant="outline" onClick={()=>outcome('fail')}>Fail local destination</Button><Button type="button" variant="outline" onClick={()=>outcome('cancel')}>Cancel local destination</Button></>}
      {failed && requested && <Button type="button" variant="outline" onClick={()=>request(requested)}>Retry local destination</Button>}
    </div>;
  }
  return <div data-adaptive-lab className="space-y-4">
    <div className="adaptive-local-settings">
      <label>Workspace width cap<select aria-label="Workspace width cap" className="mt-input" value={cap} onChange={event=>setCap(event.target.value)}><option value="available">Available width</option><option value="320">320px cap</option><option value="640">640px cap</option><option value="960">960px cap</option></select></label>
      <Button type="button" variant="outline" aria-pressed={rtl} onClick={()=>setRtl(value=>!value)}>Use RTL local workspace</Button>
      <Button type="button" variant="outline" aria-pressed={compactBar} onClick={()=>setCompactBar(value=>!value)}>Use compact destination bar</Button>
      <Button type="button" variant="outline" disabled={pending} aria-pressed={hold} onClick={()=>setHold(value=>!value)}>Hold local destination requests</Button>
    </div>
    <p data-adaptive-layout>Measured local width: {width}px. Presentation: {layout}. A cap cannot create space wider than its container.</p>
    {invalid && <p role="status">The requested destination is invalid; the loaded local fallback is Overview. Choose a valid destination to correct the URL.</p>}
    <div ref={shell} className="adaptive-local-shell" dir={rtl ? 'rtl' : 'ltr'} data-layout={layout} style={{maxWidth:cap === 'available' ? undefined : `${cap}px`}}>
      <Drawer open={open} onOpenChange={next => {
        if (next) closeTarget.current='opener';
        if (!next && phase === 'held') { setPhase('idle');setRequested(null);setFailed(false);setMessage('Closing the local drawer cancelled its held request; loaded context remains.'); }
        setOpen(next);
      }} onOpenChangeComplete={next=>{
        if (next) return;
        if (closeTarget.current === 'arrival') focusArrival();
        if (closeTarget.current === 'adaptation') persistentNav.current?.querySelector<HTMLAnchorElement>('[aria-current=page]')?.focus();
      }}>
        {layout === 'drawer' && <DrawerTrigger ref={opener} render={<Button type="button" variant="outline" />}>Open local workspace navigation</DrawerTrigger>}
        <DrawerPortal><DrawerBackdrop /><DrawerPopup side={rtl ? 'right' : 'left'} dir={rtl ? 'rtl' : 'ltr'} initialFocus={drawerTitle} finalFocus={()=>closeTarget.current === 'arrival' ? heading.current : layout !== 'drawer' ? persistentNav.current?.querySelector<HTMLAnchorElement>('[aria-current=page]') : opener.current} className="adaptive-local-drawer">
          <DrawerTitle ref={drawerTitle} tabIndex={-1}>Local workspace navigation</DrawerTitle><DrawerDescription>Real local destinations. Selecting an arriving destination closes this drawer; Escape or close cancels a held request.</DrawerDescription>
          {navigation(true)}{outcomes()}<p role="status">{message}</p>
          <DrawerClose render={<Button type="button" variant="outline" />}>Close local workspace navigation</DrawerClose>
        </DrawerPopup></DrawerPortal>
      </Drawer>
      {layout === 'rail' && navigation(false)}
      <div className="adaptive-local-content">
        <h3 ref={heading} id="adaptive-local-heading" tabIndex={-1} data-adaptive-heading className="font-semibold">{current.title}</h3>
        <div className="adaptive-local-result" aria-busy={pending}>
        {current.id === 'overview' && <><label htmlFor="adaptive-local-draft">Retained local workspace draft</label><Input id="adaptive-local-draft" value={draft} onChange={event=>setDraft(event.target.value)} /><p>No automatic save occurs. The mounted workspace owns this text across local destinations.</p></>}
        {current.id === 'reading' && <><Button type="button" variant="outline" aria-pressed={compact} onClick={()=>setCompact(value=>!value)}>Use compact local reading</Button><ol data-adaptive-records className="guidance-list" style={{lineHeight:compact ? 1.4 : 1.8}}>{[1,2,3].map(index=><li key={index}>English-only local reading example {index}</li>)}</ol></>}
        {current.id === 'saved' && <><Button type="button" variant="outline" aria-pressed={saved} onClick={()=>setSaved(value=>!value)}>Bookmark local overview</Button>{saved ? <ul data-adaptive-saved><li>Local overview bookmark</li></ul> : <p>No local bookmarks. Use the bookmark control to save this example in page memory.</p>}</>}
        <p data-adaptive-retained>Retained draft: {draft || '(empty)'}. Reading spacing: {compact ? 'compact' : 'roomy'}. Local bookmarks: {saved ? 1 : 0}.</p>
        </div>
        {outcomes()}<p role="status" data-adaptive-status>{message}</p>
        <p>Modified clicks, a reload or leaving this page create a separate page lifecycle; this example does not promise durable task storage or remote access.</p>
      </div>
      {layout === 'bar' && navigation(false)}
    </div>
  </div>;
}

export function AdaptiveNavigationExample() {
  return <section id="adaptive-workspace-arrival" tabIndex={-1} aria-label="Adaptive local workspace"><Suspense fallback={<p>Loading the local adaptive workspace…</p>}><AdaptiveWorkspace /></Suspense></section>;
}
