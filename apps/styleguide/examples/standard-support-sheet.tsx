'use client';
import {useLayoutEffect,useRef,useState} from 'react';
import {Button,Input} from '@mobtranslate/ui';
import './standard-support-sheet.css';
const records=[{id:'reading',label:'Local reading notes',bookmarked:true},{id:'comparison',label:'Local comparison notes',bookmarked:false},{id:'recovery',label:'Local recovery notes',bookmarked:true}];
export function StandardSupportSheetExample(){
  const [open,setOpen]=useState(false);
  const [draft,setDraft]=useState(false);
  const [applied,setApplied]=useState(false);
  const [text,setText]=useState('Retained primary draft');
  const [rtl,setRtl]=useState(false);
  const [height,setHeight]=useState(0);
  const opener=useRef<HTMLButtonElement>(null);
  const heading=useRef<HTMLHeadingElement>(null);
  const visible=records.filter(record=>!applied||record.bookmarked);
  useLayoutEffect(()=>{if(open){heading.current?.focus();heading.current?.scrollIntoView({block:'nearest'});}},[open]);
  function close(){opener.current?.focus();setOpen(false);}
  return <section data-standard-sheet-lab className="standard-sheet-lab space-y-4" dir={rtl?'rtl':'ltr'} aria-labelledby="standard-sheet-title">
    <h3 dir="auto" id="standard-sheet-title" className="font-semibold">Standard supporting filters</h3>
    <p dir="auto">This in-flow panel keeps the primary draft and records usable. It appears below content when narrow, or on the logical trailing side when 48rem of local space fits. Its three explicit heights are local panel footprints, not native snap physics or full-screen windows.</p>
    <div className="standard-sheet-actions">
      <Button ref={opener} type="button" variant="outline" aria-expanded={open} aria-controls={open?'standard-support-panel':undefined} onClick={()=>{if(!open)setDraft(applied);setOpen(true);if(open){heading.current?.focus();heading.current?.scrollIntoView({block:'nearest'});}}}>Open filters</Button>
      <Button type="button" variant="outline" disabled={!open} aria-controls={open?'standard-support-panel':undefined} onClick={()=>setHeight(value=>(value+1)%3)}>Cycle height</Button>
      <Button type="button" variant="outline" aria-pressed={rtl} onClick={()=>setRtl(value=>!value)}>Use RTL panel</Button>
    </div>
    <p dir="auto" data-standard-sheet-size>Local panel height: {16+height*8}rem. Height controls stay outside the scrolling panel.</p>
    <div data-standard-sheet-shell className="standard-sheet-shell" data-open={open||undefined}>
      <div data-standard-sheet-primary className="standard-sheet-primary space-y-4">
        <label htmlFor="standard-sheet-draft" className="block">Primary draft</label><Input dir="auto" id="standard-sheet-draft" value={text} onChange={event=>setText(event.target.value)} />
        <ul data-standard-sheet-records className="guidance-list">{visible.map(record=><li key={record.id} data-standard-record={record.id}>{record.label}</li>)}</ul>
      </div>
      {open&&<section id="standard-support-panel" data-standard-support-panel className="standard-support-panel space-y-4" style={{blockSize:`${16+height*8}rem`}} role="region" aria-labelledby="standard-support-heading" tabIndex={0}>
        <div className="standard-sheet-actions"><h4 dir="auto" id="standard-support-heading" ref={heading} tabIndex={-1} className="font-semibold">Supporting filters</h4><Button type="button" variant="outline" onClick={close}>Close panel</Button></div>
        <p dir="auto">Draft changes wait for Apply. Close discards uncommitted filter edits; the applied result and primary draft remain.</p>
        <label className="standard-sheet-check"><input data-standard-sheet-filter type="checkbox" checked={draft} onChange={event=>setDraft(event.target.checked)} />Bookmarked only</label>
        <Button type="button" onClick={()=>setApplied(draft)}>Apply filters</Button>
        {Array.from({length:8},(_,index)=><p key={index}>Supporting context {index+1}. This English-only local content makes independent panel scrolling observable. Primary content remains interactive.</p>)}
      </section>}
    </div>
    <p dir="auto" role="status" data-standard-sheet-status>Showing {visible.length} of {records.length} local records; {applied?'bookmarked only':'all records'}. Primary draft: <bdi>{text||'(empty)'}</bdi>. No remote or durable write occurred.</p>
  </section>;
}
