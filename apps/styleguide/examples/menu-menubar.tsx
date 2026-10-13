'use client';
import { useState } from 'react';
import { Button, DirectionProvider, Menubar, Menu, MenuCheckboxItem, MenuCheckboxItemIndicator, MenuItem, MenuPopup, MenuPortal, MenuPositioner, MenuTrigger } from '@mobtranslate/ui';

export function MenubarCommandsExample() {
  const [notes, setNotes] = useState(true);
  const [count, setCount] = useState(0);
  const [vertical, setVertical] = useState(false);
  const [rtl, setRtl] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [result, setResult] = useState('No local menubar command run.');
  const direction = rtl ? 'rtl' : 'ltr';
  return <div data-menubar-lab className="space-y-4">
    <div className="flex flex-wrap gap-3"><Button type="button" variant="outline" onClick={() => setVertical(current => !current)}>{vertical ? 'Use horizontal command bar' : 'Use vertical command bar'}</Button><Button type="button" variant="outline" onClick={() => setRtl(current => !current)}>{rtl ? 'Use LTR command context' : 'Use RTL command context'}</Button><Button type="button" variant="outline" onClick={() => setDisabled(current => !current)}>{disabled ? 'Enable command bar' : 'Disable command bar'}</Button></div>
    <DirectionProvider direction={direction}><div dir={direction}>
      <Menubar aria-label="Local example commands" orientation={vertical ? 'vertical' : 'horizontal'} disabled={disabled} className={state => state.orientation === 'vertical' ? 'local-menubar-vertical' : undefined}>
        <Menu><MenuTrigger>Record</MenuTrigger><MenuPortal><MenuPositioner sideOffset={8}><MenuPopup aria-label="Local Record commands"><MenuItem onClick={() => { setCount(current => current+1); setResult('Added one local copy.'); }}>Add local copy</MenuItem><MenuItem disabled>Remote save (unavailable)</MenuItem></MenuPopup></MenuPositioner></MenuPortal></Menu>
        <Menu><MenuTrigger>View</MenuTrigger><MenuPortal><MenuPositioner sideOffset={8}><MenuPopup aria-label="Local View commands"><MenuCheckboxItem checked={notes} onCheckedChange={setNotes}><MenuCheckboxItemIndicator keepMounted aria-hidden="true">✓</MenuCheckboxItemIndicator>Show bar notes</MenuCheckboxItem></MenuPopup></MenuPositioner></MenuPortal></Menu>
        <Menu disabled><MenuTrigger>Unavailable</MenuTrigger></Menu>
      </Menubar>
    </div></DirectionProvider>
    <p data-menubar-count>Local copies: {count}.</p>{notes && <p data-menubar-notes>Local command-bar notes are visible.</p>}
    <Button type="button" variant="outline" onClick={() => { setCount(0); setNotes(true); setResult('Restored local command-bar state.'); }}>Restore command-bar state</Button>
    <p role="status">{result} This bar operates this local example, not the site navigation.</p>
  </div>;
}
