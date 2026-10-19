'use client';
import {useRef,useState,type CSSProperties} from 'react';
import {Button,Input} from '@mobtranslate/ui';
type WindowDraft={start:string;end:string;from:string;until:string;zone:string};
const initial:WindowDraft={start:'2026-10-13',end:'2026-10-15',from:'09:00',until:'17:00',zone:'Australia/Brisbane'};
const records=[{id:'reading',label:'English-only reading session',date:'2026-10-13',time:'09:00',zone:'Australia/Brisbane'},{id:'notes',label:'English-only note session',date:'2026-10-14',time:'12:00',zone:'Australia/Brisbane'},{id:'examples',label:'English-only example session',date:'2026-10-15',time:'16:30',zone:'Australia/Brisbane'}];
const action:CSSProperties={minWidth:0,maxWidth:'100%',minHeight:44,height:'auto',whiteSpace:'normal',overflowWrap:'anywhere'};
function canonicalZone(zone:string){return new Intl.DateTimeFormat('en',{timeZone:zone}).resolvedOptions().timeZone;}
export function DateTimeWindowExample(){
  const [draft,setDraft]=useState(initial);
  const [applied,setApplied]=useState(initial);
  const [requested,setRequested]=useState<WindowDraft | null>(null);
  const [disabled,setDisabled]=useState(false);
  const [readOnly,setReadOnly]=useState(false);
  const [rtl,setRtl]=useState(false);
  const [error,setError]=useState<{field:keyof WindowDraft;message:string} | null>(null);
  const [payload,setPayload]=useState('No native form submission.');
  const [status,setStatus]=useState('Initial civil-time window loaded. No instant conversion or remote request.');
  const form=useRef<HTMLFormElement>(null);
  const heading=useRef<HTMLHeadingElement>(null);
  const pending=requested!==null;
  const visible=records.filter(record=>record.date>=applied.start && record.date<=applied.end && record.time>=applied.from && record.time<=applied.until && canonicalZone(record.zone)===applied.zone);
  function change(field:keyof WindowDraft,value:string){setDraft(current=>({...current,[field]:value}));setError(null);}
  function reject(field:keyof WindowDraft,message:string){setError({field,message});(form.current?.elements.namedItem(field) as HTMLInputElement)?.focus();}
  function outcome(result:'complete'|'fail'|'cancel'){
    if(!requested)return;
    if(result==='complete'){setApplied(requested);setStatus('Actual local civil-time records filtered. No durable save or instant conversion.');}
    else setStatus(`Local window ${result==='fail'?'failed':'cancelled'}. Draft values and loaded records retained; submit again to retry.`);
    setRequested(null);heading.current?.focus();
  }
  const fields=[{key:'start' as const,label:'First calendar date',type:'date',min:'2026-01-01',max:'2028-12-31',step:1},{key:'end' as const,label:'Last calendar date',type:'date',min:'2026-01-01',max:'2028-12-31',step:1},{key:'from' as const,label:'Earliest wall-clock time',type:'time',min:'09:00',max:'17:00',step:900},{key:'until' as const,label:'Latest wall-clock time',type:'time',min:'09:00',max:'17:00',step:900}];
  return <div data-date-time-lab className="space-y-4" dir={rtl?'rtl':'ltr'}>
    <div className="flex flex-wrap gap-3"><Button type="button" style={action} variant="outline" disabled={pending} aria-pressed={disabled} onClick={()=>setDisabled(v=>!v)}>Disable civil-time fields</Button><Button type="button" style={action} variant="outline" disabled={pending} aria-pressed={readOnly} onClick={()=>setReadOnly(v=>!v)}>Make civil-time fields read only</Button><Button type="button" style={action} variant="outline" aria-pressed={rtl} onClick={()=>setRtl(v=>!v)}>Use RTL civil-time layout</Button><Button type="button" style={action} variant="outline" disabled={pending} onClick={()=>{setDraft(initial);setDisabled(false);setReadOnly(false);setError(null);}}>Restore initial civil-time draft</Button></div>
    <p id="date-time-help">Inclusive calendar dates, 2026–2028. Daily inclusive wall-clock window, 09:00–17:00 in 15-minute steps. The zone identifies matching civil records; these values do not identify an instant.</p>
    <form ref={form} noValidate className="space-y-4" onSubmit={event=>{
      event.preventDefault();if(pending||disabled)return;
      for(const field of fields){const input=event.currentTarget.elements.namedItem(field.key) as HTMLInputElement;if(!input.value || !input.validity.valid){reject(field.key,`${field.label}: enter a valid value within the stated bounds and increment.`);return;}}
      if(draft.end<draft.start){reject('end','Last calendar date must be on or after the first date.');return;}
      if(draft.until<draft.from){reject('until','Latest wall-clock time must be on or after the earliest time. This daily window does not cross midnight.');return;}
      let zone:string;try{if(!draft.zone.trim())throw new Error('Missing zone');zone=canonicalZone(draft.zone.trim());}catch{reject('zone','Enter a time-zone identifier supported by this runtime, such as Australia/Brisbane.');return;}
      setPayload(JSON.stringify([...new FormData(event.currentTarget).entries()]));setRequested({...draft,zone});setError(null);setStatus('Civil-time window requested; loaded records remain until explicit completion.');heading.current?.focus();
    }}>
      {fields.map(field=><div key={field.key}><label htmlFor={`civil-${field.key}`} className="block font-semibold mb-2">{field.label}</label><Input id={`civil-${field.key}`} name={field.key} type={field.type} required min={field.min} max={field.max} step={field.step} value={draft[field.key]} onChange={event=>change(field.key,event.target.value)} disabled={disabled} readOnly={readOnly||pending} aria-describedby={error?.field===field.key?'date-time-help date-time-error':'date-time-help'} aria-invalid={error?.field===field.key} style={{minWidth:0,maxWidth:'100%',minHeight:44}} /></div>)}
      <div><label htmlFor="civil-zone" className="block font-semibold mb-2">Civil record time zone</label><Input id="civil-zone" name="zone" required value={draft.zone} onChange={event=>change('zone',event.target.value)} disabled={disabled} readOnly={readOnly||pending} aria-describedby={error?.field==='zone'?'date-time-help date-time-error':'date-time-help'} aria-invalid={error?.field==='zone'} style={{minWidth:0,maxWidth:'100%',minHeight:44}} /></div>
      {error && <p role="alert" id="date-time-error">{error.message}</p>}
      <div className="flex flex-wrap gap-3"><Button type="submit" style={action} disabled={disabled||pending}>Apply civil-time window</Button><Button type="button" style={action} variant="outline" disabled={disabled||readOnly||pending} onClick={()=>{setDraft({start:'',end:'',from:'',until:'',zone:''});setError(null);(form.current?.elements.namedItem('start') as HTMLInputElement)?.focus();}}>Clear civil-time draft</Button></div>
    </form>
    <h3 ref={heading} tabIndex={-1} data-date-time-heading className="font-semibold">Loaded civil-time records</h3><p dir="auto" data-date-time-applied style={{overflowWrap:'anywhere'}}><bdi>{applied.start}</bdi> through <bdi>{applied.end}</bdi>; <bdi>{applied.from}</bdi> through <bdi>{applied.until}</bdi>; <bdi>{applied.zone}</bdi></p>
    <ul data-date-time-records className="guidance-list">{visible.map(record=><li key={record.id} data-record-id={record.id}>{record.label}: <bdi>{record.date} {record.time} {record.zone}</bdi></li>)}</ul>
    {!visible.length && <p data-date-time-empty>No local civil records match. Restore the initial draft and apply it to recover.</p>}
    <p data-date-time-payload style={{overflowWrap:'anywhere'}}>Actual native entries: {payload}</p>
    {pending && <div className="flex flex-wrap gap-3"><Button type="button" style={action} onClick={()=>outcome('complete')}>Complete civil-time request</Button><Button type="button" style={action} variant="outline" onClick={()=>outcome('fail')}>Fail civil-time request</Button><Button type="button" style={action} variant="outline" onClick={()=>outcome('cancel')}>Cancel civil-time request</Button></div>}
    <p role="status" data-date-time-status>{status}</p>
  </div>;
}
