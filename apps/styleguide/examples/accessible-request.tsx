'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Button, Input } from '@mobtranslate/ui';

const actionStyle = {minHeight:44,height:"auto",minWidth:0,maxWidth:"100%",whiteSpace:"normal",overflowWrap:"anywhere",paddingInline:".5rem"} as const;

export function AccessibleRequestExample() {
  const id = useId();
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [phase, setPhase] = useState<'editing' | 'pending' | 'failed' | 'complete'>('editing');
  const [announcement, setAnnouncement] = useState('');
  const [invalidAttempt, setInvalidAttempt] = useState(0);
  const summary = useRef<HTMLDivElement>(null);
  const submit = useRef<HTMLElement>(null);
  useEffect(() => { if (invalidAttempt) summary.current?.focus(); }, [invalidAttempt]);
  const pending = phase === 'pending';
  function edit() { setPhase('editing'); setAnnouncement(''); }
  function finish(next: 'editing' | 'failed' | 'complete', message: string) {
    setPhase(next);
    setAnnouncement(message);
    submit.current?.focus();
  }
  return <div data-accessibility-lab className="space-y-4">
    <p>This local request never contacts a service. Choose a simulated outcome; there is no countdown.</p>
    <form noValidate className="space-y-3" onSubmit={event => {
      event.preventDefault();
      if (pending) return;
      const invalid = [!title.trim() && 'title', !note.trim() && 'note'].filter((field): field is string => Boolean(field));
      setErrors(invalid);
      if (invalid.length) {
        setAnnouncement('');
        setPhase('editing');
        setInvalidAttempt(attempt => attempt + 1);
        return;
      }
      setPhase('pending');
      setAnnouncement('Local request pending. Choose an outcome or cancel below.');
    }}>
      {errors.length > 0 && <div ref={summary} tabIndex={-1} aria-labelledby={`${id}-summary`} className="border-2 border-[var(--color-destructive)] rounded-lg p-4">
        <h3 id={`${id}-summary`} className="font-bold">Check {errors.length} {errors.length === 1 ? 'field' : 'fields'}</h3>
        <ul className="guidance-list">{errors.map(field => <li key={field}><a href={`#${id}-${field}`} onClick={event => {
          event.preventDefault();
          document.getElementById(`${id}-${field}`)?.focus();
        }}>{field === 'title' ? 'Title: enter a title.' : 'Note: enter a note.'}</a></li>)}</ul>
      </div>}
      <label htmlFor={`${id}-title`} className="block font-medium">Title (required)</label>
      <Input id={`${id}-title`} name="title" required readOnly={pending} value={title} state={errors.includes('title') ? 'error' : 'default'}
        aria-describedby={`${id}-help${errors.includes('title') ? ` ${id}-title-error` : ''}`} onChange={event => {
          setTitle(event.target.value); setErrors(current => current.filter(field => field !== 'title')); edit();
        }} />
      <p id={`${id}-help`} className="text-sm">Use your own English text to try the interaction.</p>
      {errors.includes('title') && <p id={`${id}-title-error`}>Enter a title.</p>}
      <label htmlFor={`${id}-note`} className="block font-medium">Note (required)</label>
      <textarea id={`${id}-note`} name="note" className="mt-textarea w-full" required readOnly={pending} value={note}
        aria-invalid={errors.includes('note') || undefined} aria-describedby={errors.includes('note') ? `${id}-note-error` : undefined}
        onChange={event => { setNote(event.target.value); setErrors(current => current.filter(field => field !== 'note')); edit(); }} />
      {errors.includes('note') && <p id={`${id}-note-error`}>Enter a note.</p>}
      <Button style={actionStyle} ref={submit} type="submit" aria-disabled={pending || undefined} aria-busy={pending || undefined}>Try accessible request</Button>
    </form>
    <div className="flex flex-wrap gap-3">
      <Button style={actionStyle} type="button" variant="secondary" disabled={!pending} onClick={() => finish('complete', 'Local example complete. Your text is retained; nothing was sent.')}>Simulate completion</Button>
      <Button style={actionStyle} type="button" variant="outline" disabled={!pending} onClick={() => finish('failed', 'Simulated connection failure. Your text is retained. Try accessible request again to retry.')}>Simulate failure</Button>
      <Button style={actionStyle} type="button" variant="ghost" disabled={!pending} onClick={() => finish('editing', 'Local request cancelled. Your text is retained.')}>Cancel local request</Button>
    </div>
    <p role="status" aria-atomic="true" className="min-h-6">{announcement}</p>
  </div>;
}
