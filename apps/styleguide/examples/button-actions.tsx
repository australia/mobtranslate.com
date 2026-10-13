'use client';
import { useEffect, useRef, useState } from 'react';
import { Button, type ButtonProps } from '@mobtranslate/ui';

export function ButtonActionsExample() {
  const [variant, setVariant] = useState<NonNullable<ButtonProps['variant']>>('primary');
  const [size, setSize] = useState<NonNullable<ButtonProps['size']>>('md');
  const [disabled, setDisabled] = useState(false);
  const [fullWidth, setFullWidth] = useState(false);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState('');
  const action = useRef<HTMLElement>(null);
  useEffect(() => { if (!pending && status && !disabled) action.current?.focus(); }, [pending, status, disabled]);
  return <div data-button-lab className="space-y-4">
    <div className="grid gap-4 sm:grid-cols-2">
      <label>Action variant<select className="mt-input mt-2" value={variant} onChange={event => setVariant(event.target.value as typeof variant)}>{(['primary', 'secondary', 'destructive', 'ghost', 'outline', 'error', 'success', 'warning', 'link'] as const).map(value => <option key={value}>{value}</option>)}</select></label>
      <label>Action size<select className="mt-input mt-2" value={size} onChange={event => setSize(event.target.value as typeof size)}>{(['sm', 'md', 'lg', 'icon'] as const).map(value => <option key={value}>{value}</option>)}</select></label>
    </div>
    <label className="flex items-center gap-3 min-h-11"><input type="checkbox" checked={disabled} onChange={event => setDisabled(event.target.checked)} />Disable example action</label>
    <label className="flex items-center gap-3 min-h-11"><input type="checkbox" checked={fullWidth} onChange={event => setFullWidth(event.target.checked)} />Fill available width</label>
    <Button ref={action} data-action-button variant={variant} size={size} type="button" disabled={disabled} loading={pending} loadingText={size === 'icon' ? undefined : 'Working…'} fullWidth={fullWidth} aria-label="Run example action" onClick={() => { setPending(true); setStatus('Example pending. Choose completion or cancellation; no request was sent.'); }}>
      {size === 'icon' ? <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12h14M12 5v14" fill="none" stroke="currentColor" strokeWidth="2" /></svg> : 'Run example action'}
    </Button>
    {pending && <div className="flex flex-wrap gap-3"><Button type="button" onClick={() => { setPending(false); setStatus('Example completed locally. No record was published.'); }}>Complete example action</Button><Button variant="secondary" type="button" onClick={() => { setPending(false); setStatus('Example cancelled. No record was changed.'); }}>Cancel example action</Button></div>}
    <p role="status">{status}</p>
  </div>;
}

export function NativeButtonTypesExample() {
  const [submissions, setSubmissions] = useState(0);
  const [localActions, setLocalActions] = useState(0);
  return <form data-native-types className="space-y-3" onSubmit={event => { event.preventDefault(); setSubmissions(submissions + 1); }}>
    <div className="flex flex-wrap gap-3"><Button>Default native submit</Button><Button type="button" variant="secondary" onClick={() => setLocalActions(localActions + 1)}>Explicit non-submit</Button></div>
    <p role="status">{submissions} local form submissions; {localActions} non-submit actions. No request was sent.</p>
  </form>;
}
