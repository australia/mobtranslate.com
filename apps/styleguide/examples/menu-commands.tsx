'use client';
import { useRef, useState } from 'react';
import { Button, Menu, MenuCheckboxItem, MenuCheckboxItemIndicator, MenuGroup, MenuGroupLabel, MenuItem, MenuPopup, MenuPortal, MenuPositioner, MenuRadioGroup, MenuRadioItem, MenuRadioItemIndicator, MenuSeparator, MenuSubmenuRoot, MenuSubmenuTrigger, MenuTrigger } from '@mobtranslate/ui';

export function MenuCommandsExample() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('Local reading record');
  const [copies, setCopies] = useState(0);
  const [notes, setNotes] = useState(true);
  const [layout, setLayout] = useState('compact');
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState('No local command run.');
  const context = useRef<HTMLDivElement>(null);
  const submenu = useRef<HTMLElement>(null);
  function resolve(outcome: 'complete' | 'fail' | 'cancel') {
    if (!pending) return;
    if (outcome === 'complete') { setTitle('Updated local reading record'); setResult('Local title changed. No server write occurred.'); }
    if (outcome === 'fail') setResult('Local rename failed. The original title remains; retry is available.');
    if (outcome === 'cancel') setResult('Local rename cancelled. The original title remains.');
    setPending(false); context.current?.focus();
  }
  return <div data-menu-lab className="space-y-4">
    <div ref={context} tabIndex={-1} role="region" aria-label="Local command context" data-menu-record style={{lineHeight:layout === 'compact' ? 1.5 : 1.75, padding:layout === 'compact' ? 8 : 16}}>
      <p>{title}</p>{notes && <p data-command-notes>English-only local notes are visible.</p>}<p data-command-copies>Local copies: {copies}.</p>
    </div>
    <Menu open={open} onOpenChange={setOpen} disabled={pending}>
      <MenuTrigger data-command-trigger render={<Button variant="outline" disabled={pending}>Local record commands</Button>} />
      <MenuPortal><MenuPositioner sideOffset={8} align="start"><MenuPopup aria-label="Local record commands" finalFocus={context}>
        <MenuGroup><MenuGroupLabel>Local commands</MenuGroupLabel>
          <MenuItem onClick={() => { setCopies(count => count+1); setResult('Local copy added. No source was duplicated remotely.'); }}>Duplicate local record</MenuItem>
          <MenuItem onClick={() => { setPending(true); setResult('Local rename pending. Choose an explicit outcome below.'); }}>Rename local record…</MenuItem>
          <MenuItem disabled onClick={() => setResult('Unexpected unavailable command activation.')}>Publish to server (unavailable)</MenuItem>
        </MenuGroup><MenuSeparator />
        <MenuCheckboxItem checked={notes} onCheckedChange={setNotes} className={state => state.checked ? 'local-notes-checked' : undefined}><MenuCheckboxItemIndicator keepMounted aria-hidden="true">✓</MenuCheckboxItemIndicator>Show local notes</MenuCheckboxItem>
        <MenuSubmenuRoot closeParentOnEsc={false} onOpenChangeComplete={childOpen => { if (!childOpen && open) submenu.current?.focus(); }}><MenuSubmenuTrigger ref={submenu} label="Reading layout">Reading layout <span aria-hidden="true">›</span></MenuSubmenuTrigger>
          <MenuPortal><MenuPositioner side="right" align="start" sideOffset={4}><MenuPopup aria-label="Reading layout choices" finalFocus={submenu}>
            <MenuRadioGroup value={layout} onValueChange={setLayout} aria-label="Local reading density">
              <MenuRadioItem value="compact"><MenuRadioItemIndicator keepMounted aria-hidden="true">●</MenuRadioItemIndicator>Compact layout</MenuRadioItem>
              <MenuRadioItem value="comfortable"><MenuRadioItemIndicator keepMounted aria-hidden="true">●</MenuRadioItemIndicator>Comfortable layout</MenuRadioItem>
            </MenuRadioGroup>
          </MenuPopup></MenuPositioner></MenuPortal>
        </MenuSubmenuRoot>
      </MenuPopup></MenuPositioner></MenuPortal>
    </Menu>
    {pending && <div className="flex flex-wrap gap-3"><Button type="button" onClick={() => resolve('complete')}>Complete local rename</Button><Button type="button" variant="outline" onClick={() => resolve('fail')}>Fail local rename</Button><Button type="button" variant="outline" onClick={() => resolve('cancel')}>Cancel local rename</Button></div>}
    <Button type="button" variant="outline" disabled={pending} onClick={() => { setTitle('Local reading record'); setCopies(0); setResult('Restored the local record and cleared local copies.'); }}>Restore local command context</Button>
    <p role="status">{result} Reading layout: {layout}. Menus do not prove authority or permission.</p>
  </div>;
}
