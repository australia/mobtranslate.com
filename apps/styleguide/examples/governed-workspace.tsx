'use client';
import {useEffect,useRef,useState,type CSSProperties} from 'react';
import {Button,Checkbox,Input,Textarea,Progress,Badge} from '@mobtranslate/ui';
type Role='reader'|'editor'|'reviewer';
type Decision={revision:number;status:'accepted'|'changes';note:string};
type RecordEntry={id:string;title:string;text:string;audience:'public'|'team';revision:number;sourceTitle:string;sourceHref:string;decisions:Decision[]};
type RequestSnapshot={id:number;query:string;public:boolean;team:boolean;accepted:boolean;role:Role};
type Candidate={request:RequestSnapshot;records:RecordEntry[]};
type ReviewSnapshot={id:string;revision:number;note:string;status:'accepted'|'changes'};
const action:CSSProperties={minHeight:44,height:'auto',minWidth:0,maxWidth:'100%',whiteSpace:'normal',overflowWrap:'anywhere'};
function fixtureRecords(value:unknown):RecordEntry[]{
  if(!Array.isArray(value))throw Error('Fixture is not a record array.');
  const seen=new Set<string>();
  return value.map(row=>{
    if(!row||typeof row!=='object'||typeof row.id!=='string'||!row.id||seen.has(row.id)||typeof row.title!=='string'||typeof row.text!=='string'||(row.audience!=='public'&&row.audience!=='team')||!Number.isSafeInteger(row.revision)||row.revision<1||typeof row.sourceTitle!=='string'||typeof row.sourceHref!=='string'||!row.sourceHref.startsWith('/'))throw Error('Invalid fixture record shape or duplicate ID.');
    if(new URL(row.sourceHref,location.origin).origin!==location.origin)throw Error('Fixture source context must stay on this origin.');
    seen.add(row.id);return {...row,decisions:[]};
  });
}
export function GovernedWorkspaceExample(){
  const [interactive,setInteractive]=useState(false);
  const [role,setRole]=useState<Role>('reader');
  const [query,setQuery]=useState('');
  const [includePublic,setIncludePublic]=useState(true);
  const [includeTeam,setIncludeTeam]=useState(true);
  const [acceptedOnly,setAcceptedOnly]=useState(false);
  const [hold,setHold]=useState(false);
  const [fail,setFail]=useState(false);
  const [rtl,setRtl]=useState(false);
  const [phase,setPhase]=useState<'idle'|'fetching'|'held'|'ready'|'failed'|'cancelled'>('idle');
  const [records,setRecords]=useState<RecordEntry[]>([]);
  const [resultIds,setResultIds]=useState<string[]>([]);
  const [applied,setApplied]=useState<RequestSnapshot|null>(null);
  const [requested,setRequested]=useState<RequestSnapshot|null>(null);
  const [opened,setOpened]=useState<string|null>(null);
  const [editText,setEditText]=useState('');
  const [reviewNote,setReviewNote]=useState('');
  const [review,setReview]=useState<ReviewSnapshot|null>(null);
  const [message,setMessage]=useState('No fixture search requested yet.');
  const [task,setTask]=useState('No local edit or review applied.');
  const [reviewError,setReviewError]=useState('');
  const model=useRef<RecordEntry[]>([]);
  const drafts=useRef(new Map<string,{text:string;note:string}>());
  const roleInput=useRef<HTMLSelectElement>(null);
  const roleRef=useRef<Role>(role);
  const sequence=useRef(0);
  const controller=useRef<AbortController|null>(null);
  const candidate=useRef<Candidate|null>(null);
  const queryInput=useRef<HTMLInputElement>(null);
  const noteInput=useRef<HTMLTextAreaElement>(null);
  const arrival=useRef<HTMLHeadingElement>(null);
  const reviewArrival=useRef<HTMLParagraphElement>(null);
  const current=records.find(record=>record.id===opened);
  const currentDecision=current?.decisions.filter(decision=>decision.revision===current.revision).at(-1);
  const pending=phase==='fetching'||phase==='held';
  useEffect(()=>{setQuery(new URLSearchParams(location.search).get('record-q')??'');setInteractive(true);return()=>{sequence.current++;controller.current?.abort();};},[]);
  useEffect(()=>{if(opened)arrival.current?.focus();},[opened]);
  function store(next:RecordEntry[]){model.current=next;setRecords(next);}
  function cancel(messageText='Search cancelled. Last successful results and query remain.'){
    sequence.current++;controller.current?.abort();controller.current=null;candidate.current=null;setPhase('cancelled');setMessage(messageText);queryInput.current?.focus();
  }
  function apply(next:Candidate){
    if(next.request.id!==sequence.current||next.request.role!==roleRef.current)return;
    const merged=next.records.map(seed=>model.current.find(record=>record.id===seed.id)??seed);
    store(merged);
    const terms=next.request.query.toLocaleLowerCase('en').trim().split(/\s+/).filter(Boolean);
    const matches=merged.filter(record=>{
      const latest=record.decisions.filter(event=>event.revision===record.revision).at(-1);
      const allowed=record.audience==='public'?next.request.public:next.request.team&&next.request.role!=='reader';
      return allowed&&(!next.request.accepted||latest?.status==='accepted')&&terms.every(term=>`${record.title} ${record.text}`.toLocaleLowerCase('en').includes(term));
    });
    setResultIds(matches.map(record=>record.id));setApplied(next.request);setPhase('ready');setMessage(`Loaded ${matches.length} matching records from three public fixture records plus local revisions. Query: ${next.request.query||'(all)'}.`);candidate.current=null;queryInput.current?.focus();
  }
  async function search(){
    if(!interactive)return;
    controller.current?.abort();candidate.current=null;
    const request={id:++sequence.current,query,public:includePublic,team:includeTeam,accepted:acceptedOnly,role:roleRef.current};
    const abort=new AbortController();controller.current=abort;setRequested(request);setPhase('fetching');setMessage(`Fetching public fixture for query ${query||'(all)'}. Last successful results remain.`);
    const url=new URL(location.href);if(query)url.searchParams.set('record-q',query);else url.searchParams.delete('record-q');history.replaceState(null,'',url);
    try{
      const response=await fetch(fail?'/fixtures/governed-records-missing.json':'/fixtures/governed-records.json',{signal:abort.signal,cache:'no-store'});
      if(!response.ok)throw Error(`Fixture returned HTTP ${response.status}.`);
      const next={request,records:fixtureRecords(await response.json())};
      if(abort.signal.aborted||request.id!==sequence.current||request.role!==roleRef.current)return;
      if(hold){candidate.current=next;setPhase('held');setMessage('HTTP response received. Applying this candidate is held; last successful results remain.');}
      else apply(next);
    }catch(error){if(abort.signal.aborted||request.id!==sequence.current)return;setPhase('failed');setMessage(`${error instanceof Error?error.message:'Fixture request failed.'} Last successful results and draft query remain. Correct the failure setting and retry.`);queryInput.current?.focus();}
  }
  function changeRole(next:Role){
    if(next!=='reader'&&next!=='editor'&&next!=='reviewer'){setMessage('Unsupported demo role; current policy remains.');roleInput.current?.focus();return;}
    sequence.current++;controller.current?.abort();candidate.current=null;roleRef.current=next;setRole(next);setReview(null);setPhase(applied?'ready':'idle');
    if(next==='reader'){model.current.filter(record=>record.audience==='team').forEach(record=>drafts.current.delete(record.id));setResultIds(ids=>ids.filter(id=>model.current.find(record=>record.id===id)?.audience==='public'));if(current?.audience==='team'){setOpened(null);setEditText('');setReviewNote('');}}
    setMessage('Demo role changed; outstanding search/review proposals cancelled and displayed results reconciled. The fixture is public; this picker is not authentication.');setTask('Demo role changed; held local review cancelled. Existing content and history remain.');setReviewError('');roleInput.current?.focus();
  }
  function openRecord(record:RecordEntry){
    if(record.audience==='team'&&roleRef.current==='reader'){setTask('Team-audience view unavailable under Reader demo.');roleInput.current?.focus();return;}
    if(record.id===opened){arrival.current?.focus();return;}
    if(current)drafts.current.set(current.id,{text:editText,note:reviewNote});
    const draft=drafts.current.get(record.id);setOpened(record.id);setEditText(draft?.text??record.text);setReviewNote(draft?.note??'');setReviewError('');setReview(null);setTask('Opened local record; any prior held review proposal was cancelled. Per-record drafts remain in page memory.');
  }
  function edit(){
    if(!current||roleRef.current==='reader')return;
    if(!editText.trim()){setTask('Enter nonempty English-only local content before creating a revision.');return;}
    const next={...current,text:editText,revision:current.revision+1};store(model.current.map(record=>record.id===next.id?next:record));setTask(`Created local revision ${next.revision}; previous review history remains, current revision needs a new review.`);
  }
  function propose(status:ReviewSnapshot['status']){
    if(!current||roleRef.current!=='reviewer'||review)return;
    if(!reviewNote.trim()){setReviewError('Enter a review note for this local decision.');noteInput.current?.focus();return;}
    setReviewError('');setReview({id:current.id,revision:current.revision,note:reviewNote.trim(),status});setTask(`Local ${status} decision held for revision ${current.revision}. This is not qualified language review.`);
  }
  function resolveReview(complete:boolean){
    if(!review)return;
    const latest=model.current.find(record=>record.id===review.id);
    if(!complete)setTask('Local review cancelled; record and history remain.');
    else if(roleRef.current!=='reviewer'||!latest||latest.revision!==review.revision)setTask('Review snapshot is out of date or unavailable. No decision applied; current revision remains.');
    else{store(model.current.map(record=>record.id===latest.id?{...record,decisions:[...record.decisions,{revision:review.revision,status:review.status,note:review.note}]}:record));setTask(`Applied local ${review.status} decision to revision ${review.revision}. No qualified language approval or publication is claimed.`);}
    setReview(null);reviewArrival.current?.focus();
  }
  return <div data-governed-lab style={{overflowWrap:'anywhere'}} lang="en" dir={rtl?'rtl':'ltr'} className="space-y-4">
    <p dir="auto">All three HTTP fixture records are public, synthetic English-only examples. Audience labels and role choices demonstrate UI policy only. They are not real credentials, confidential content, publication consent or qualified language review.</p>
    <label htmlFor="governed-role" className="block">Simulated workspace role</label><select ref={roleInput} id="governed-role" className="mt-input" value={role} onChange={event=>changeRole(event.target.value as Role)}><option value="reader">Reader demo</option><option value="editor">Editor demo</option><option value="reviewer">Reviewer demo</option></select>
    <form role="search" aria-label="Public fixture records" onSubmit={event=>{event.preventDefault();void search();}} className="space-y-3">
      <label htmlFor="governed-query" className="block">Search loaded English title and content fields</label><Input ref={queryInput} id="governed-query" dir="auto" value={query} readOnly={!interactive} onChange={event=>setQuery(event.target.value)} />
      <div className="flex flex-wrap gap-3"><Checkbox label="Include public-audience examples" checked={includePublic} onCheckedChange={setIncludePublic} /><Checkbox label="Include team-audience examples" checked={includeTeam} onCheckedChange={setIncludeTeam} /><Checkbox label="Current local accepted decision only" checked={acceptedOnly} onCheckedChange={setAcceptedOnly} /></div>
      <div className="flex flex-wrap gap-3"><Button style={action} type="submit" disabled={!interactive}>Search fixture records</Button><Button style={action} type="button" variant="outline" onClick={()=>{setQuery('');setIncludePublic(true);setIncludeTeam(true);setAcceptedOnly(false);}}>Reset draft filters</Button></div>
    </form>
    <div className="flex flex-wrap gap-3"><Button style={action} type="button" variant="outline" aria-pressed={hold} onClick={()=>setHold(value=>!value)}>Hold received search responses</Button><Button style={action} type="button" variant="outline" aria-pressed={fail} onClick={()=>setFail(value=>!value)}>Use missing fixture URL</Button><Button style={action} type="button" variant="outline" aria-pressed={rtl} onClick={()=>setRtl(value=>!value)}>Use RTL governed workspace</Button></div>
    {pending&&<div className="flex flex-wrap gap-3"><Progress value={null} aria-label="Fixture search progress" />{phase==='held'&&<Button style={action} type="button" onClick={()=>{if(candidate.current)apply(candidate.current);}}>Apply held search response</Button>}<Button style={action} type="button" variant="outline" onClick={()=>cancel()}>Cancel fixture search</Button></div>}
    {phase==='failed'&&<Button style={action} type="button" onClick={()=>void search()}>Retry fixture search</Button>}
    <p role="status" dir="auto" data-governed-search-status>{message}</p>
    <p dir="auto" data-governed-applied>{applied?`Last applied query: ${applied.query||'(all)'}. Applied role snapshot: ${applied.role}. Current displayed result count: ${resultIds.length}.`:'No search result applied.'}{pending||phase==='failed'?' Last successful result is retained while its replacement is unresolved.':''}</p>
    {requested&&<p dir="auto">Requested query: {requested.query||'(all)'}. Draft controls can change separately; a new search supersedes the old request.</p>}
    <ul data-governed-results className="space-y-3">{resultIds.map(id=>{const record=records.find(row=>row.id===id);return record?<li key={id}><Button style={action} type="button" variant="outline" onClick={()=>openRecord(record)}>Open {record.title}</Button><p dir="auto">{record.audience} audience demo; local revision {record.revision}.</p></li>:null;})}</ul>
    {applied&&!resultIds.length&&<p dir="auto">No accessible fixture records match this applied scope. Reset draft filters, then search again. This does not mean a language has no entries.</p>}
    {current&&<section aria-labelledby="governed-detail-title" className="space-y-3">
      <h3 ref={arrival} id="governed-detail-title" tabIndex={-1} dir="auto" className="font-semibold">{current.title}</h3><p dir="auto" data-governed-detail>{current.text}</p>
      <p dir="auto">Source context: <a href={current.sourceHref} className="underline">{current.sourceTitle}</a>. This is a real guide link for the authored example, not a dictionary attestation.</p>
      <p dir="auto" data-governed-review-state><Badge variant="outline">Local revision {current.revision}</Badge> Current local decision: {currentDecision?.status??'not reviewed'}. Language authority: not established.</p>
      <p id="governed-capability-help" dir="auto">{role==='reader'?'Reader demo can inspect public examples. Editing and local review are unavailable.':role==='editor'?'Editor demo can create local revisions. Review proposals require Reviewer demo.':'Reviewer demo can create revisions and propose local workflow decisions; these do not confer language authority.'}{review?' A review proposal is held; finish or cancel it before changing its note or proposing another decision.':''}</p>
      <label htmlFor="governed-edit" className="block">Local English-only revision draft</label><Textarea id="governed-edit" aria-describedby="governed-capability-help" dir="auto" value={editText} readOnly={role==='reader'} onChange={event=>{setEditText(event.target.value);drafts.current.set(current.id,{text:event.target.value,note:reviewNote});}} /><Button style={action} type="button" disabled={role==='reader'} onClick={edit}>Create newer local revision</Button>
      <label htmlFor="governed-review-note" className="block">Local workflow review note</label><Textarea ref={noteInput} id="governed-review-note" dir="auto" value={reviewNote} readOnly={role!=='reviewer'||!!review} aria-invalid={!!reviewError} aria-describedby={'governed-capability-help'+(reviewError?' governed-review-error':'')} onChange={event=>{setReviewNote(event.target.value);drafts.current.set(current.id,{text:editText,note:event.target.value});}} />{reviewError&&<p id="governed-review-error" dir="auto" role="alert">{reviewError}</p>}
      <div className="flex flex-wrap gap-3"><Button style={action} type="button" disabled={role!=='reviewer'||!!review} onClick={()=>propose('accepted')}>Propose local acceptance</Button><Button style={action} type="button" variant="outline" disabled={role!=='reviewer'||!!review} onClick={()=>propose('changes')}>Request local changes</Button></div>
      {review&&<div className="flex flex-wrap gap-3"><Button style={action} type="button" onClick={()=>resolveReview(true)}>Complete held local review</Button><Button style={action} type="button" variant="outline" onClick={()=>resolveReview(false)}>Cancel held local review</Button></div>}
      <ol data-governed-review-history className="guidance-list">{current.decisions.map((decision,index)=><li dir="auto" key={index}>Revision {decision.revision}: {decision.status}; {decision.note}. {decision.revision!==current.revision?'Historical decision; not current approval.':''}</li>)}</ol>
    </section>}
    <p ref={reviewArrival} tabIndex={-1} role="status" dir="auto" data-governed-task-status>{task}</p>
    <p dir="auto">Changing demo role cancels held proposals. Reader role removes team-audience results/details; the public fixture still remains public. Real access control must be enforced by the data service and authenticated identity, not a role picker or hidden DOM.</p>
  </div>;
}
