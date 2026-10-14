'use client';
import { useRef, useState } from 'react';
import { Button, Toast, ToastAction, ToastClose, ToastContent, ToastDescription, ToastProvider, ToastTitle, ToastViewport, useToastManager } from '@mobtranslate/ui';

type Variant = 'default' | 'success' | 'warning' | 'error';
interface LocalToastData { variant: Variant; undo?: () => void }

function NotificationFlow({single,onSingleChange}:{single:boolean;onSingleChange:(value:boolean)=>void}) {
  const manager = useToastManager();
  const [variant, setVariant] = useState<Variant>('default');
  const [timed, setTimed] = useState(false);
  const [exists, setExists] = useState(true);
  const [outcome, setOutcome] = useState('Local example draft is present.');
  const [feedback,setFeedback]=useState('No ordinary notification yet.');
  const sequence = useRef(0);
  const latest = useRef<string | null>(null);
  const pending = useRef<{ resolve: (value: string) => void; reject: (error: Error) => void } | null>(null);
  const [inFlight, setInFlight] = useState(false);
  const startPromise = useRef<HTMLElement>(null);
  return <div data-toast-lab className="space-y-4">
    <p>These are real provider-managed notifications for local examples. The viewport is in the document so it cannot cover reading content.</p>
    <label className="block">Notification variant <select className="mt-input" value={variant} onChange={event => setVariant(event.target.value as Variant)}>{(['default', 'success', 'warning', 'error'] as const).map(item => <option key={item}>{item}</option>)}</select></label>
    <label className="flex gap-3 items-center min-h-11"><input type="checkbox" checked={timed} onChange={event => setTimed(event.target.checked)} />Expire ordinary examples after 5 seconds</label>
    <label className="flex flex-wrap gap-3 items-center min-h-11"><input data-toast-delivery type="checkbox" checked={single} disabled={manager.toasts.length>0} aria-describedby="toast-delivery-help" onChange={event=>onSingleChange(event.target.checked)}/>One visible notification</label>
    <p id="toast-delivery-help">Dismiss notifications before changing delivery. Existing task state stays retained.</p>
    <div className="flex flex-wrap gap-3">
      <Button type="button" onClick={() => { const title=`Local notification ${++sequence.current}`;setFeedback(`${title}. A local example outcome; no request was sent.`);latest.current = manager.add({ title, description: 'A local example outcome; no request was sent.', timeout: timed ? 5000 : 0, data: { variant } satisfies LocalToastData }); }}>Add local notification</Button>
      <Button type="button" variant="outline" onClick={() => { if (latest.current&&manager.toasts.some(item=>item.id===latest.current&&item.transitionStatus!=='ending')) {manager.update(latest.current, { title: 'Local notification updated', description: 'The same notification ID was updated.' });setFeedback('Local notification updated. The same notification ID was updated.');} }}>Update latest notification</Button>
      <Button type="button" variant="secondary" aria-disabled={!exists || undefined} onClick={() => {
        if (!exists) return;
        setExists(false); setOutcome('Local example draft removed. Restore is available here or in its notification.');
        const id: string = manager.add({ title: 'Local draft removed', description: 'Undo restores only this local example.', timeout: 0, data: {
          variant: 'default', undo: () => { setExists(true); setOutcome('Local example draft restored.'); manager.close(id); },
        } satisfies LocalToastData });
      }}>Remove example draft</Button>
      <Button type="button" variant="outline" aria-disabled={exists || undefined} onClick={() => { if (!exists) { setExists(true); setOutcome('Local example draft restored from the persistent recovery action.'); } }}>Restore example draft</Button>
    </div>
    <div className="flex flex-wrap gap-3">
      <Button ref={startPromise} type="button" variant="secondary" aria-disabled={inFlight || undefined} onClick={() => {
        if (inFlight) return;
        setInFlight(true);
        const task = new Promise<string>((resolve, reject) => { pending.current = { resolve, reject }; });
        void manager.promise(task, { loading: { title: 'Local task pending', timeout: 0 }, success: { title: 'Local task complete', description: 'Only the controlled local promise completed.', timeout: 0 }, error: { title: 'Local task failed', description: 'No request was sent; retry the local example.', timeout: 0 } }).catch(() => undefined);
      }}>Start local promise</Button>
      <Button type="button" variant="outline" disabled={!inFlight} onClick={() => { pending.current?.resolve('local result'); pending.current = null; setInFlight(false); startPromise.current?.focus(); }}>Resolve local promise</Button>
      <Button type="button" variant="ghost" disabled={!inFlight} onClick={() => { pending.current?.reject(new Error('Simulated failure')); pending.current = null; setInFlight(false); startPromise.current?.focus(); }}>Reject local promise</Button>
    </div>
    <p data-notification-feedback>{feedback}</p>
    <p role="status" aria-atomic="true">{outcome}</p>
    <ToastViewport style={{ position: 'relative', inset: 'auto', width: '100%', maxHeight: '24rem' }} aria-label="Local example notifications">
      {manager.toasts.map(item => {
        const data = item.data as LocalToastData | undefined;
        return <Toast key={item.id} toast={item} variant={data?.variant} swipeDirection={[]}>
          <ToastContent><ToastTitle>{item.title}</ToastTitle><ToastDescription>{item.description}</ToastDescription>
            {data?.undo && <ToastAction onClick={data.undo}>Undo local removal</ToastAction>}
            <ToastClose aria-label={`Dismiss ${typeof item.title === 'string' ? item.title : 'local notification'}`} />
          </ToastContent>
        </Toast>;
      })}
    </ToastViewport>
    <p className="text-sm">Provider limit: {single?1:3}. The one-visible mode uses the provider’s limit; it does not promise first-in-first-out delivery. Ordinary feedback remains above after expiry. Undo has no expiry and a separate persistent restore control. F6 enters the viewport; Shift+Tab returns from the viewport to the task. Escape dismisses a focused notification. Verify your actual browser and screen reader before release.</p>
  </div>;
}
export function ToastCommunicationExample() {
  const [single,setSingle]=useState(false);
  return <ToastProvider timeout={0} limit={single?1:3}><NotificationFlow single={single} onSingleChange={setSingle}/></ToastProvider>;
}
