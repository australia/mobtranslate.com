'use client';
import { useRef, useState } from 'react';
import { Alert, Badge, Button, VisuallyHidden, type AlertProps, type BadgeProps } from '@mobtranslate/ui';

const alertVariants: NonNullable<AlertProps['variant']>[] = ['default', 'info', 'success', 'warning', 'error', 'destructive'];
const badgeVariants: NonNullable<BadgeProps['variant']>[] = ['default', 'primary', 'secondary', 'destructive', 'error', 'outline', 'success', 'warning'];

export function AlertCommunicationExample() {
  const [visible, setVisible] = useState(false);
  const restore = useRef<HTMLElement>(null);
  const [result, setResult] = useState('');
  const [headingLevel, setHeadingLevel] = useState<AlertProps['headingLevel']>();
  return <div data-alert-lab className="space-y-4">
    <p>These specimens describe local examples. Their color does not establish review, consent or publication.</p>
    <label className="block" htmlFor="alert-title-structure">Alert title structure</label>
    <select id="alert-title-structure" className="mt-input" value={headingLevel ?? 'paragraph'} onChange={event => setHeadingLevel(event.target.value === 'paragraph' ? undefined : 3)}><option value="paragraph">Paragraph lead</option><option value="3">Level 3 heading under this section</option></select>
    <div className="space-y-3">{alertVariants.map(variant => <Alert key={variant} variant={variant} role="note" title={`${variant} example`} headingLevel={headingLevel} description="Keep the source and the next step understandable." data-tone={variant} />)}</div>
    <Button ref={restore} type="button" onClick={() => { setVisible(true); setResult(''); }}>Show recoverable alert</Button>
    {visible && <Alert role="status" variant="warning" title="Local task paused" description="Your example input is retained." dismissible dismissLabel="Dismiss local task message"
      onDismiss={() => { setVisible(false); setResult('Message dismissed; the local task remains paused.'); restore.current?.focus(); }}
      action={<Button type="button" variant="secondary" onClick={() => { setVisible(false); setResult('Local task resumed. No request was sent.'); restore.current?.focus(); }}>Resume local task</Button>}>
      <p className="text-sm">Additional child content stays visible beside shorthand title and description.</p>
    </Alert>}
    <p role="status">{result}</p>
  </div>;
}

export function BadgeCommunicationExample() {
  const [count, setCount] = useState(1);
  const [messages, setMessages] = useState<{id:number;subject:string}[]>([]);
  const [unread, setUnread] = useState(0);
  const [inboxOpen, setInboxOpen] = useState(false);
  const inboxTrigger=useRef<HTMLElement>(null);
  const messageId=useRef(0);
  const [shape, setShape] = useState<NonNullable<BadgeProps['shape']>>('pill');
  return <div data-badge-lab className="space-y-4">
    <label className="block">Badge shape <select value={shape} onChange={event => setShape(event.target.value as NonNullable<BadgeProps['shape']>)} className="mt-input"><option value="pill">Pill</option><option value="rounded">Rounded</option></select></label>
    <div className="flex flex-wrap gap-3">{badgeVariants.map(variant => <Badge key={variant} variant={variant} shape={shape} data-tone={variant}>{variant} example</Badge>)}</div>

    <label className="block">Local task count <input type="range" min="0" max="120" value={count} onChange={event => setCount(Number(event.target.value))} className="block w-full" /></label>
    <p role="status" aria-atomic="true">{count === 0 ? 'No local tasks.' : <>Local tasks: <Badge data-count-badge shape={shape}><span aria-hidden="true">{count > 99 ? '99+' : count}</span><VisuallyHidden>{count} {count === 1 ? 'task' : 'tasks'}</VisuallyHidden></Badge></>}</p>
    <p className="text-sm">The compact count caps at 99+ visually; its text alternative retains the actual count. This badge is read-only, not a filter or a review credential.</p>
    <h3>Local inbox and unread ownership</h3>
    <div className="flex flex-wrap gap-3">
      <Button type="button" variant="outline" onClick={()=>{const id=++messageId.current;setMessages(items=>[...items,{id,subject:`Local example notification ${id}`}]);setUnread(current=>inboxOpen?0:current+1);}}>Add local inbox notification</Button>
      <Button ref={inboxTrigger} data-inbox-trigger type="button" variant="outline" aria-label={`Open local inbox, ${unread?`${unread} unread ${unread===1?'notification':'notifications'}`:'no unread notifications'}`} aria-expanded={inboxOpen} aria-controls="badge-local-inbox" onClick={()=>{setInboxOpen(true);setUnread(0);}}>
        <span aria-hidden="true" data-inbox-icon style={{position:'relative',display:'inline-block',width:24,height:24,flexShrink:0}}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{position:'absolute',insetInlineStart:0,insetBlockEnd:0}}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/></svg>
          {unread>0&&<span data-inbox-dot style={{position:'absolute',insetBlockStart:0,insetInlineEnd:0,width:6,height:6,borderRadius:'50%',background:'var(--color-error)'}}/>}
        </span>Open local inbox
      </Button>
    </div>
    <section id="badge-local-inbox" aria-label="Local inbox" hidden={!inboxOpen}>
      <p>{messages.length?`${messages.length} retained local notifications. Opening marks them read; it does not delete them.`:'No local notifications yet.'}</p>
      <ul>{messages.map(message=><li key={message.id}>{message.subject}</li>)}</ul>
      <Button type="button" variant="outline" onClick={()=>{setInboxOpen(false);inboxTrigger.current?.focus();}}>Close local inbox</Button>
    </section>
  </div>;
}
