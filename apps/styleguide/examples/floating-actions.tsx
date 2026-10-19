'use client';
import { useState, useRef } from 'react';
import { FloatingActionButton, TooltipProvider, Tooltip, TooltipTrigger, TooltipPortal, TooltipPositioner, TooltipPopup } from '@mobtranslate/ui';

export function FloatingActionsExample() {
  const portalContainer=useRef<HTMLDivElement>(null);
  const [count, setCount] = useState(0);
  const [extended, setExtended] = useState(true);
  const [size, setSize] = useState<'sm' | 'md' | 'lg'>('md');
  const action=<FloatingActionButton size={size} extended={extended} aria-label="Add example draft" onClick={() => setCount(count + 1)}>
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12h14M12 5v14" stroke="currentColor" strokeWidth="2" fill="none" /></svg>{extended && 'Add example draft'}
  </FloatingActionButton>;
  return <div ref={portalContainer} data-fab-lab className="space-y-4">
    <label className="block">Floating action size<select className="mt-input mt-2" value={size} onChange={event => setSize(event.target.value as typeof size)}>{(['sm', 'md', 'lg'] as const).map(value => <option key={value}>{value}</option>)}</select></label>
    <label className="flex items-center gap-3 min-h-11"><input type="checkbox" checked={extended} onChange={event => setExtended(event.target.checked)} />Show extended action label</label>
    <div className="relative border border-[var(--color-border)] rounded-lg p-4 space-y-6">
      <p>Local example workspace. The action sits in flow here; application placement must preserve content and focus clearance.</p>
      <div className="flex justify-end"><TooltipProvider><Tooltip disabled={extended}><TooltipTrigger render={action} /><TooltipPortal container={portalContainer}><TooltipPositioner sideOffset={8}><TooltipPopup>Create an example draft locally.</TooltipPopup></TooltipPositioner></TooltipPortal></Tooltip></TooltipProvider></div>
    </div>
    <p role="status">{count} example {count === 1 ? 'draft' : 'drafts'} created locally. Nothing was saved or published.</p>
  </div>;
}
