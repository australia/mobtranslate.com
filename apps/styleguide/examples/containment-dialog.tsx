'use client';
import { useLayoutEffect, useRef, useState } from 'react';
import { Button, Dialog, DialogBackdrop, DialogClose, DialogDescription, DialogPopup, DialogPortal, DialogTitle, DialogTrigger, Input } from '@mobtranslate/ui';

export function DialogContainmentExample() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('Local collection');
  const [saved, setSaved] = useState('Local collection');
  const [phase, setPhase] = useState<'editing'|'pending'|'failed'>('editing');
  const [error, setError] = useState('');
  const [size, setSize] = useState<'sm'|'md'|'lg'|'xl'>('md');
  const [mode, setMode] = useState<'modal'|'non-modal'|'trap-focus'>('modal');
  const [protect,setProtect]=useState(false);
  const [discard,setDiscard]=useState(false);
  const keepEditing=useRef<HTMLElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const save = useRef<HTMLElement>(null);
  const restoreEditing=useRef(false);
  // Focus the newly visible control during commit, before the popup’s removed-focus fallback.
  useLayoutEffect(()=>{if(discard)keepEditing.current?.focus();else if(restoreEditing.current){restoreEditing.current=false;input.current?.focus();}},[discard]);
  return <div data-dialog-lab className="space-y-4">
    <label>Dialog size <select data-dialog-size className="mt-input" value={size} onChange={event => setSize(event.target.value as typeof size)}>{['sm','md','lg','xl'].map(item => <option key={item}>{item}</option>)}</select></label>
    <label>Dialog interaction mode <select data-dialog-mode className="mt-input" value={mode} onChange={event => setMode(event.target.value as typeof mode)}>{['modal','non-modal','trap-focus'].map(item => <option key={item}>{item}</option>)}</select></label>
    <label className="flex items-center gap-3" style={{minHeight:44}}><input data-dialog-protect type="checkbox" checked={protect} onChange={event=>setProtect(event.target.checked)} style={{width:24,height:24,flexShrink:0}} />Confirm discarding local edits</label>
    <Dialog modal={mode === 'modal' ? true : mode === 'non-modal' ? false : 'trap-focus'} open={open} onOpenChange={(next, details) => {
      if (!next && phase === 'pending') { details.cancel(); return; }
      if(!next&&protect&&draft!==saved){details.cancel();if(discard){restoreEditing.current=true;setDiscard(false);}else setDiscard(true);return;}
      setOpen(next);
      if (next) { setDraft(saved); setPhase('editing'); setError(''); setDiscard(false); }
    }}>
      <DialogTrigger render={<Button type="button" />}>Edit local collection</DialogTrigger>
      <DialogPortal>{mode === 'modal' && <DialogBackdrop />}<DialogPopup size={size} initialFocus={input} className={state => state.open ? 'local-dialog-open' : ''}>
        <DialogTitle>Edit local collection</DialogTitle><DialogDescription>Changes apply to this example only after you confirm a simulated outcome.</DialogDescription>
        <form hidden={discard} className="mt-form mt-4" onSubmit={event => {
          event.preventDefault();
          if (phase === 'pending') return;
          if (!draft.trim()) { setError('Enter a collection name.'); input.current?.focus(); return; }
          setError(''); setPhase('pending');
        }}>
          <label>Collection name<Input ref={input} value={draft} readOnly={phase === 'pending'} aria-invalid={!!error || undefined} aria-describedby={error ? 'local-dialog-error' : undefined} onChange={event => { setDraft(event.target.value); setError(''); }} /></label>
          {error && <p id="local-dialog-error" role="alert">{error}</p>}
          <p role="status">{phase === 'pending' ? 'Local save pending. Choose success or failure below.' : phase === 'failed' ? 'Simulated failure. Your text remains available for retry.' : 'Editing local example; no request will be sent.'}</p>
          <div className="flex flex-wrap justify-end gap-3"><DialogClose disabled={phase === 'pending'} render={<Button type="button" variant="outline" />}>Cancel collection edit</DialogClose><Button ref={save} type="submit" aria-disabled={phase === 'pending' || undefined}>Save local collection</Button></div>
          {phase === 'pending' && <div className="flex flex-wrap gap-3"><Button type="button" onClick={() => { setSaved(draft.trim()); setPhase('editing'); setOpen(false); }}>Simulate save success</Button><Button type="button" variant="secondary" onClick={() => { setPhase('failed'); save.current?.focus(); }}>Simulate save failure</Button><Button type="button" variant="ghost" onClick={() => { setPhase('editing'); save.current?.focus(); }}>Cancel pending local save</Button></div>}
        </form>
        {discard&&<div data-dialog-discard className="mt-4 space-y-4"><p role="status">Discard the unsaved local name “{draft}”? The current collection remains “{saved}”.</p><div className="flex flex-wrap gap-3"><Button ref={keepEditing} type="button" style={{paddingInline:12}} onClick={()=>{restoreEditing.current=true;setDiscard(false);}}>Keep editing</Button><Button type="button" style={{paddingInline:12}} variant="outline" onClick={()=>{setDraft(saved);setDiscard(false);setOpen(false);}}>Discard edits</Button></div></div>}
      </DialogPopup></DialogPortal>
    </Dialog>
    <p role="status">Current local collection: {saved}</p>
  </div>;
}
