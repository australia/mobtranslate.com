'use client';
import {useEffect,useRef,useState} from 'react';
import {Button} from '@mobtranslate/ui';
import {measureNoticeText,choosePlacement,noticePreview,type NoticePriority,type NoticeRecord,type NoticePreferences} from '../lib/notice-content';

export function NoticeContentExample() {
  const [ready,setReady]=useState(false);
  const [title,setTitle]=useState('Draft ready');
  const [body,setBody]=useState('Review the local example before sharing.');
  const [budget,setBudget]=useState('80');
  const [priority,setPriority]=useState<NoticePriority>('routine');
  const [preferences,setPreferences]=useState<NoticePreferences>({enabled:true,defer:false,urgentMayInterrupt:false,redact:true});
  const [records,setRecords]=useState<NoticeRecord[]>([]);
  const [polite,setPolite]=useState(''),[urgent,setUrgent]=useState('');
  const [openedId,setOpenedId]=useState<number|null>(null);
  const [openEpoch,setOpenEpoch]=useState(0);
  const sequence=useRef(0),returnTarget=useRef<HTMLElement|null>(null),detail=useRef<HTMLHeadingElement>(null);
  const captureTarget=useRef<HTMLElement>(null);
  useEffect(()=>setReady(true),[]);
  useEffect(()=>{if(openedId!==null)detail.current?.focus();},[openedId,openEpoch]);
  const message=`${title}\n${body}`;
  const measures=measureNoticeText(message);
  const numericBudget=Number(budget),budgetValid=budget.trim()!==''&&Number.isInteger(numericBudget)&&numericBudget>=1&&numericBudget<=2000;
  const count=measures.graphemes??measures.codePoints;
  const valid=Boolean(title.trim()&&body.trim());
  const latest=records[0],queued=records.filter(record=>record.placement==='queued');
  const opened=records.find(record=>record.id===openedId);
  const preview=latest?noticePreview(latest,preferences.redact):null;
  function publish(record:NoticeRecord) {
    const text=noticePreview(record,preferences.redact);
    const announcement=`Local notice ${record.id}: ${text.title}\n${text.body}`;
    if(record.priority==='time-sensitive'){setPolite('');setUrgent(announcement);}
    else {setUrgent('');setPolite(announcement);}
  }
  function capture() {
    if(!valid)return;
    const record:NoticeRecord={id:++sequence.current,title,body,priority,createdAt:new Date().toISOString(),placement:choosePlacement(priority,preferences),opened:false};
    setRecords(current=>[record,...current]);
    if(record.placement==='live-region')publish(record);
  }
  function release() {
    if(!preferences.enabled||preferences.defer||!queued.length)return;
    const ids=new Set(queued.map(record=>record.id));
    setRecords(current=>current.map(record=>ids.has(record.id)?{...record,placement:'live-region' as const}:record));
    const text=`${queued.length} queued local notices are now available. Open local history for details.`;
    if(queued.some(record=>record.priority==='time-sensitive')){setPolite('');setUrgent(text);}else{setUrgent('');setPolite(text);}
    if(valid)captureTarget.current?.focus();else document.getElementById('notice-title')?.focus();
  }
  function openRecord(id:number,trigger:HTMLElement) {
    returnTarget.current=trigger;setOpenedId(id);setOpenEpoch(current=>current+1);setRecords(current=>current.map(record=>record.id===id?{...record,opened:true}:record));
  }
  return <div data-notice-content-ready={ready} className="space-y-4">
    <p>This English browser model retains local records and requests live-region output. It sends no push, SMS or email and does not prove that a person heard, read or acted on a notice. All example text remains public in this page; redacting a preview is not access control.</p>
    <label htmlFor="notice-title" className="block">Important information first: title</label>
    <input id="notice-title" className="mt-input w-full" disabled={!ready} value={title} onChange={event=>setTitle(event.target.value)} aria-invalid={!title.trim()} aria-describedby="notice-editor-help" />
    <label htmlFor="notice-body" className="block">Context and next action: body</label>
    <textarea id="notice-body" className="mt-textarea w-full" disabled={!ready} value={body} onChange={event=>setBody(event.target.value)} aria-invalid={!body.trim()} aria-describedby="notice-editor-help" />
    <p id="notice-editor-help">Capture requires a nonempty title and body. No wording, relevance, urgency or cultural authority is automatically approved.</p>
    <div className="grid gap-4 sm:grid-cols-2">
      <label htmlFor="notice-budget">Author review target<input id="notice-budget" type="number" min="1" max="2000" step="1" className="mt-input w-full mt-2" disabled={!ready} value={budget} onChange={event=>setBudget(event.target.value)} aria-invalid={!budgetValid} aria-describedby="notice-budget-help" /></label>
      <label htmlFor="notice-priority">Author-assigned attention<select id="notice-priority" className="mt-input w-full mt-2" disabled={!ready} value={priority} onChange={event=>setPriority(event.target.value as NoticePriority)}><option value="routine">Routine</option><option value="time-sensitive">Time-sensitive</option></select></label>
    </div>
    <p id="notice-budget-help">Review target: 1–2000 grapheme clusters when available. It is not a provider limit or SMS segment estimate. Over-target content remains editable and capturable.</p>
    {ready?<><dl className="grid gap-3 sm:grid-cols-3" data-notice-measures>
      <div><dt>UTF-16 code units</dt><dd data-notice-units>{measures.codeUnits}</dd></div>
      <div><dt>Unicode code points</dt><dd data-notice-points>{measures.codePoints}</dd></div>
      <div><dt>Grapheme clusters</dt><dd data-notice-graphemes>{measures.graphemes??'Unavailable in this runtime'}</dd></div>
    </dl>
    <p data-notice-budget-result>{!budgetValid?'Enter a review target from 1 to 2000.':`${count} ${measures.graphemes===null?'code points (fallback)':'grapheme clusters'} including the title/body newline: ${count>numericBudget?'over':'within'} the author target of ${numericBudget}.`}</p></>:<p>Text measurements appear when the controls are ready.</p>}
    <fieldset className="space-y-2"><legend className="font-semibold mb-2">Local attention and preview preferences</legend>
      <label className="flex items-center gap-3 min-h-11"><input id="notice-enabled" type="checkbox" disabled={!ready} checked={preferences.enabled} onChange={event=>setPreferences(current=>({...current,enabled:event.target.checked}))} />Allow new notice announcements</label>
      <label className="flex items-center gap-3 min-h-11"><input id="notice-defer" type="checkbox" disabled={!ready} checked={preferences.defer} onChange={event=>setPreferences(current=>({...current,defer:event.target.checked}))} />Defer while I am busy</label>
      <label className="flex items-center gap-3 min-h-11"><input id="notice-interrupt" type="checkbox" disabled={!ready} checked={preferences.urgentMayInterrupt} onChange={event=>setPreferences(current=>({...current,urgentMayInterrupt:event.target.checked}))} />Allow time-sensitive notices to bypass deferral</label>
      <label className="flex items-center gap-3 min-h-11"><input id="notice-redact" type="checkbox" disabled={!ready} checked={preferences.redact} onChange={event=>setPreferences(current=>({...current,redact:event.target.checked}))} />Hide title/body in compact previews and new announcements</label>
    </fieldset>
    <div className="flex flex-wrap gap-3"><Button ref={captureTarget} data-notice-capture type="button" disabled={!ready||!valid} onClick={capture}>Capture local notice</Button><Button data-notice-release type="button" variant="outline" disabled={!ready||!preferences.enabled||preferences.defer||!queued.length} onClick={release}>Release queued notices</Button></div>
    <p role="status" aria-live="off" data-notice-counts>{records.length} local records; {queued.length} queued; {records.filter(record=>!record.opened).length} not opened in this example.</p>
    <p>Changes to preferences do not retroactively release a queue or alter captured content. Turn deferral off and explicitly release queued notices. Disabling announcements retains new records in history, including time-sensitive ones.</p>
    <div><p className="font-semibold">Requested live output</p><p role="status" aria-atomic="true" data-notice-polite style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{polite}</p><p role="alert" aria-atomic="true" data-notice-urgent style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{urgent}</p><p className="text-sm">Only one channel receives each update. The record’s placement means text was set in a live region; actual spoken output depends on the browser and assistive technology.</p></div>
    {preview&&latest&&<div data-notice-preview className="border border-[var(--color-muted-foreground)] rounded-md p-4">
      <p className="font-semibold">Compact preview of local notice {latest.id}</p><p data-notice-preview-title className="font-semibold break-words">{preview.title}</p><p data-notice-preview-body className="break-words whitespace-pre-wrap">{preview.body}</p>
      <Button type="button" variant="outline" onClick={event=>openRecord(latest.id,event.currentTarget)}>Open latest local record</Button>
    </div>}
    {opened&&<section aria-labelledby="notice-opened-title" data-notice-detail>
      <h3 id="notice-opened-title" ref={detail} tabIndex={-1} className="font-semibold text-xl scroll-mt-24">Local notice {opened.id}</h3><p data-notice-detail-title className="font-semibold break-words">{opened.title}</p><p data-notice-detail-body className="break-words whitespace-pre-wrap">{opened.body}</p><p>Captured at <time dateTime={opened.createdAt}>{opened.createdAt}</time>. Opened is a local viewing event, not proof of comprehension or review.</p>
      <Button type="button" variant="outline" onClick={()=>{setOpenedId(null);if(returnTarget.current?.isConnected)returnTarget.current.focus();else document.getElementById('notice-title')?.focus();}}>Close local record</Button>
    </section>}
    <section aria-labelledby="notice-history-title"><h3 id="notice-history-title" className="font-semibold text-xl">Local notice history</h3>
      {!records.length?<p>No local notices captured.</p>:<ol data-notice-history className="space-y-4 mt-3">{records.map(record=><li key={record.id} data-notice-record={record.id} className="border-t border-[var(--color-border)] pt-3">
        <p className="font-semibold break-words">Notice {record.id}: {record.title}</p><p>{record.priority} · {record.placement} · {record.opened?'opened in example':'not opened'}</p><Button type="button" variant="outline" onClick={event=>openRecord(record.id,event.currentTarget)}>Open local notice {record.id}</Button>
      </li>)}</ol>}
    </section>
  </div>;
}
