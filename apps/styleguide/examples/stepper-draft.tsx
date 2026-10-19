'use client';
import {useEffect,useRef,useState,type CSSProperties} from 'react';
import {Stepper,Step,Input,Textarea,Button} from '@mobtranslate/ui';
const action:CSSProperties={minWidth:0,maxWidth:'100%',minHeight:44,height:'auto',whiteSpace:'normal',overflowWrap:'anywhere'};
type Draft={title:string;note:string};
export function StepperDraftExample(){
  const [step,setStep]=useState(0);
  const [draft,setDraft]=useState<Draft>({title:'',note:''});
  const [requested,setRequested]=useState<Draft|null>(null);
  const [applied,setApplied]=useState<Draft|null>(null);
  const [error,setError]=useState('');
  const [vertical,setVertical]=useState(false);
  const [rtl,setRtl]=useState(false);
  const [compact,setCompact]=useState(false);
  const [status,setStatus]=useState('No local draft applied.');
  const heading=useRef<HTMLHeadingElement>(null);
  const input=useRef<HTMLInputElement>(null);
  const shell=useRef<HTMLDivElement>(null);
  useEffect(()=>{const node=shell.current;if(!node)return;const observer=new ResizeObserver(([entry])=>setCompact(entry.contentRect.width<560));observer.observe(node);return()=>observer.disconnect();},[]);
  function move(next:number){setStep(next);setError('');requestAnimationFrame(()=>heading.current?.focus());}
  function resolve(result:'complete'|'fail'|'cancel'){
    if(!requested)return;
    if(result==='complete'){setApplied(requested);setStatus('Actual local draft applied. No remote publication or durable save.');move(3);}
    else {setStatus(`Local draft ${result==='fail'?'failed':'cancelled'}. Values and loaded result retained; retry is available.`);heading.current?.focus();}
    setRequested(null);
  }
  return <div ref={shell} data-stepper-lab className="space-y-4" dir={rtl?'rtl':'ltr'}>
    <div className="flex flex-wrap gap-3"><Button style={action} type="button" variant="outline" aria-pressed={vertical} onClick={()=>setVertical(v=>!v)}>Use vertical draft progress</Button><Button style={action} type="button" variant="outline" aria-pressed={rtl} onClick={()=>setRtl(v=>!v)}>Use RTL draft layout</Button></div>
    <Stepper activeStep={step} orientation={vertical||compact?'vertical':'horizontal'} aria-label="Local draft progress"><Step label="Details" description="Name the local draft" /><Step label="Context" description="Optional English-only note" /><Step label="Review" description="Confirm the actual values" /></Stepper>
    <h3 ref={heading} tabIndex={-1} data-stepper-heading className="font-semibold">{step===0?'Local draft details':step===1?'Optional local context':step===2?'Review local draft':'Local draft completed'}</h3>
    <form noValidate className="space-y-4" onSubmit={event=>{event.preventDefault();if(requested||step===3)return;if(!draft.title.trim()){setStep(0);setError('Enter an English-only local draft title.');requestAnimationFrame(()=>input.current?.focus());return;}if(step<2){move(step+1);return;}setRequested({...draft,title:draft.title.trim()});setStatus('Draft requested; loaded result remains until explicit completion.');heading.current?.focus();}}>
      {step===0&&<div><label htmlFor="stepper-title" className="block mb-2">English-only local title</label><Input ref={input} id="stepper-title" required value={draft.title} onChange={event=>{setDraft(current=>({...current,title:event.target.value}));setError('');}} aria-invalid={!!error} aria-describedby={error?'stepper-title-error':undefined} /></div>}
      {step===1&&<div><label htmlFor="stepper-note" className="block mb-2">Optional English-only note</label><Textarea id="stepper-note" value={draft.note} onChange={event=>setDraft(current=>({...current,note:event.target.value}))} /></div>}
      {step===2&&<div data-stepper-review style={{overflowWrap:'anywhere'}}><p>Title: {draft.title}</p><p>Note: {draft.note||'No optional context.'}</p></div>}
      {error&&<p id="stepper-title-error" role="alert">{error}</p>}
      <div className="flex flex-wrap gap-3">{step>0&&step<3&&<Button style={action} type="button" variant="outline" disabled={!!requested} onClick={()=>move(step-1)}>Back in local draft</Button>}{step<3&&<Button style={action} type="submit" disabled={!!requested}>{step===2?'Request local draft':'Continue local draft'}</Button>}{step===3&&<Button style={action} type="button" variant="outline" onClick={()=>move(0)}>Edit retained local draft</Button>}</div>
    </form>
    {requested&&<div className="flex flex-wrap gap-3"><Button style={action} type="button" onClick={()=>resolve('complete')}>Complete local draft</Button><Button style={action} type="button" variant="outline" onClick={()=>resolve('fail')}>Fail local draft</Button><Button style={action} type="button" variant="outline" onClick={()=>resolve('cancel')}>Cancel local draft request</Button></div>}
    <p role="status" data-stepper-status>{status}</p><h3 className="font-semibold">Loaded local result</h3><div data-stepper-applied style={{overflowWrap:'anywhere'}}>{applied?<><p>{applied.title}</p><p>{applied.note||'No optional context.'}</p></>:<p>No local draft loaded.</p>}</div>
    <p>Draft values belong to this example’s parent state. Hidden step editors do not register a partial native form; the reviewed complete draft is snapshotted explicitly.</p>
  </div>;
}
