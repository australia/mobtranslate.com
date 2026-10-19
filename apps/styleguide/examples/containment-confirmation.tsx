'use client';
import { useRef, useState } from 'react';
import { AlertDialog, AlertDialogBackdrop, AlertDialogClose, AlertDialogDescription, AlertDialogPopup, AlertDialogPortal, AlertDialogTitle, AlertDialogTrigger, Button } from '@mobtranslate/ui';

export function ConfirmationContainmentExample() {
  const [open, setOpen] = useState(false);
  const [exists, setExists] = useState(true);
  const [result, setResult] = useState('Local example draft is present.');
  const cancel = useRef<HTMLButtonElement>(null);
  const restore = useRef<HTMLElement>(null);
  return <div data-confirmation-lab className="space-y-4">
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger disabled={!exists} render={<Button type="button" variant="destructive" />}>Remove local example</AlertDialogTrigger>
      <AlertDialogPortal><AlertDialogBackdrop /><AlertDialogPopup initialFocus={cancel} finalFocus={() => exists ? true : restore.current} className={state => state.open ? 'local-confirmation-open' : ''}>
        <AlertDialogTitle>Remove this local example?</AlertDialogTitle><AlertDialogDescription>This changes only the example on this page. A separate restore action remains available. No source, recording or database row will be deleted.</AlertDialogDescription>
        <div className="flex flex-wrap gap-3 mt-6"><AlertDialogClose ref={cancel} render={<Button type="button" variant="outline" />}>Keep local example</AlertDialogClose><Button type="button" variant="destructive" onClick={() => { setExists(false); setResult('Local example removed. Use Restore local example to recover.'); setOpen(false); }}>Confirm local removal</Button></div>
      </AlertDialogPopup></AlertDialogPortal>
    </AlertDialog>
    <Button ref={restore} type="button" variant="outline" aria-disabled={exists || undefined} onClick={() => { if (!exists) { setExists(true); setResult('Local example restored.'); } }}>Restore local example</Button>
    <p role="status">{result}</p>
  </div>;
}
