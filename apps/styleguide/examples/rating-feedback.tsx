'use client';
import {useRef,useState,type CSSProperties} from 'react';
import {Rating,Button} from '@mobtranslate/ui';
const action:CSSProperties={minWidth:0,maxWidth:'100%',minHeight:44,height:'auto',whiteSpace:'normal',overflowWrap:'anywhere'};
export function RatingFeedbackExample(){
  const [score,setScore]=useState(0);
  const [size,setSize]=useState<'sm'|'md'|'lg'>('md');
  const [maximum,setMaximum]=useState(5);
  const [disabled,setDisabled]=useState(false);
  const [readOnly,setReadOnly]=useState(false);
  const [rtl,setRtl]=useState(false);
  const [error,setError]=useState('');
  const [requested,setRequested]=useState<number | null>(null);
  const [applied,setApplied]=useState<number | null>(null);
  const [payload,setPayload]=useState('No native submission.');
  const [status,setStatus]=useState('No local feedback applied.');
  const rating=useRef<HTMLDivElement>(null);
  const heading=useRef<HTMLHeadingElement>(null);
  const pending=requested!==null;
  function focusRating(){(rating.current?.querySelector<HTMLElement>('[role=radio][aria-checked=true]')??rating.current?.querySelector<HTMLElement>('[role=radio]'))?.focus();}
  function outcome(result:'complete'|'fail'|'cancel'){
    if(requested===null)return;
    if(result==='complete'){setApplied(requested);setStatus('Actual local feedback summary updated. No remote review or durable save.');}
    else setStatus(`Local feedback ${result==='fail'?'failed':'cancelled'}. Draft and loaded summary remain; submit again to retry.`);
    setRequested(null);heading.current?.focus();
  }
  return <div data-rating-lab className="space-y-4"><div className="flex flex-wrap gap-3"><Button style={action} type="button" variant="outline" disabled={pending} aria-pressed={disabled} onClick={()=>setDisabled(v=>!v)}>Disable local ratings</Button><Button style={action} type="button" variant="outline" disabled={pending} aria-pressed={readOnly} onClick={()=>setReadOnly(v=>!v)}>Make local ratings read only</Button><Button style={action} type="button" variant="outline" aria-pressed={rtl} onClick={()=>setRtl(v=>!v)}>Use RTL rating choices</Button><Button style={action} type="button" variant="outline" disabled={pending} onClick={()=>{setMaximum(5);setScore(3);setDisabled(false);setReadOnly(false);setError('');}}>Restore local rating draft</Button></div>
    <div className="flex flex-wrap gap-3"><label>Star icon size <select data-rating-size value={size} onChange={event=>setSize(event.target.value as 'sm'|'md'|'lg')} className="mt-input" disabled={pending}><option value="sm">Small</option><option value="md">Medium</option><option value="lg">Large</option></select></label><label>Available score count <select data-rating-max value={maximum} onChange={event=>{const next=Number(event.target.value);setMaximum(next);setScore(current=>current>next?0:current);}} className="mt-input" disabled={pending}><option value={5}>Five choices</option><option value={10}>Ten choices</option></select></label></div>
    <form noValidate className="space-y-4" onSubmit={event=>{event.preventDefault();if(pending||disabled)return;if(score<1||score>maximum){setError('Choose a score before requesting local feedback.');focusRating();return;}const data=new FormData(event.currentTarget);setPayload(JSON.stringify([...data.entries()]));setRequested(Number(data.get('score')));setError('');setStatus('Feedback requested; loaded summary remains until an explicit outcome.');heading.current?.focus();}}>
      <p id="rating-local-label" className="font-semibold">English-only example usefulness</p><Rating ref={rating} aria-labelledby="rating-local-label" aria-describedby={error?'rating-help rating-error':'rating-help'} aria-invalid={!!error} name="score" required value={score} onChange={next=>{setScore(next);setError('');}} max={maximum} size={size} disabled={disabled} readOnly={readOnly||pending} dir={rtl?'rtl':'ltr'} getItemLabel={(value,max)=>`${value} of ${max} usefulness points`} />
      <p id="rating-help">Choose one whole score. Hover previews fill only; it does not change the checked value or native submission.</p>{error&&<p id="rating-error" role="alert">{error}</p>}
      <p id="rating-independent-label">Independent optional usefulness score</p><Rating name="otherScore" defaultValue={2} aria-labelledby="rating-independent-label" disabled={disabled} readOnly={readOnly||pending} dir={rtl?'rtl':'ltr'} />
      <div className="flex flex-wrap gap-3"><Button style={action} type="submit" disabled={disabled||pending}>Request local rating feedback</Button><Button style={action} type="button" variant="outline" disabled={disabled||readOnly||pending} onClick={()=>{setScore(0);setError('');focusRating();}}>Clear local score</Button></div>
    </form><p data-rating-score>Draft score: {score||'none'}.</p><h3 ref={heading} tabIndex={-1} data-rating-heading className="font-semibold">Loaded local feedback summary</h3><p data-rating-applied>{applied===null?'No local score applied.':`Actual local score: ${applied}.`}</p><p data-rating-payload style={{overflowWrap:'anywhere'}}>{payload}</p>
    {pending&&<div className="flex flex-wrap gap-3"><Button style={action} type="button" onClick={()=>outcome('complete')}>Complete local rating</Button><Button style={action} type="button" variant="outline" onClick={()=>outcome('fail')}>Fail local rating</Button><Button style={action} type="button" variant="outline" onClick={()=>outcome('cancel')}>Cancel local rating</Button></div>}<p role="status" data-rating-status>{status}</p>
  </div>;
}
