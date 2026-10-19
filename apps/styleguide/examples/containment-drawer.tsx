'use client';
import { useRef, useState } from 'react';
import { Button, Drawer, DrawerBackdrop, DrawerClose, DrawerDescription, DrawerPopup, DrawerPortal, DrawerTitle, DrawerTrigger, type DrawerSide } from '@mobtranslate/ui';

export function DrawerContainmentExample() {
  const [side, setSide] = useState<DrawerSide>('right');
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(false);
  const [applied, setApplied] = useState(false);
  const [long, setLong] = useState(false);
  const title = useRef<HTMLHeadingElement>(null);
  return <div data-drawer-lab className="space-y-4">
    <label>Physical drawer side <select className="mt-input" value={side} onChange={event => setSide(event.target.value as DrawerSide)}>{['left','right','top','bottom'].map(item => <option key={item}>{item}</option>)}</select></label>
    <label className="flex gap-3 min-h-11 items-center"><input type="checkbox" checked={long} onChange={event => setLong(event.target.checked)} />Include long content to test scrolling</label>
    <Drawer open={open} onOpenChange={next => { setOpen(next); if (next) setDraft(applied); }}>
      <DrawerTrigger render={<Button type="button" />}>Open local filters</DrawerTrigger>
      <DrawerPortal><DrawerBackdrop /><DrawerPopup side={side} initialFocus={title} className={state => state.open ? 'local-drawer-open' : ''}>
        <DrawerTitle ref={title} tabIndex={-1}>Local collection filters</DrawerTitle><DrawerDescription>Apply a local preference or cancel to keep the current selection.</DrawerDescription>
        <label className="flex gap-3 min-h-11 items-center my-4"><input type="checkbox" checked={draft} onChange={event => setDraft(event.target.checked)} />Show locally bookmarked examples</label>
        {long && <div className="space-y-4">{Array.from({length:16}, (_, index) => <p key={index}>Local context paragraph {index + 1}. This English-only placeholder tests viewport scrolling, not language data or source authority.</p>)}</div>}
        <div className="flex flex-wrap gap-3 mt-4"><Button type="button" onClick={() => { setApplied(draft); setOpen(false); }}>Apply local filters</Button><DrawerClose render={<Button type="button" variant="outline" />}>Cancel local filters</DrawerClose></div>
      </DrawerPopup></DrawerPortal>
    </Drawer>
    <p role="status">Applied local filter: {applied ? 'bookmarked examples' : 'all examples'}.</p>
  </div>;
}
