'use client';
import {useRef,useState,type CSSProperties} from 'react';
import {Button,Combobox} from '@mobtranslate/ui';
const actionStyle:CSSProperties={minWidth:0,maxWidth:'100%',minHeight:44,height:'auto',whiteSpace:'normal',overflowWrap:'anywhere'};
const options=[{value:'overview',label:'Local workspace overview',text:'Actual English-only workspace overview content.'},{value:'notes',label:'Local reading notes',text:'Actual English-only reading-note content.'},{value:'saved',label:'Local saved examples',text:'Actual English-only saved-example content.'},{value:'restricted',label:'Reviewed source unavailable',text:'Unavailable fixture',disabled:true}];
export function ComboboxChoiceExample(){
  const [value,setValue]=useState('');
  const [query,setQuery]=useState('');
  const [other,setOther]=useState('');
  const [count,setCount]=useState(0);
  const [disabled,setDisabled]=useState(false);
  const [readOnly,setReadOnly]=useState(false);
  const [rtl,setRtl]=useState(false);
  const [pending,setPending]=useState(false);
  const [error,setError]=useState('');
  const [requested,setRequested]=useState<string | null>(null);
  const [loaded,setLoaded]=useState('overview');
  const [payload,setPayload]=useState('No native form submission.');
  const [status,setStatus]=useState('Loaded overview remains until an explicit local completion.');
  const input=useRef<HTMLInputElement>(null);
  const heading=useRef<HTMLHeadingElement>(null);
  function outcome(result:'complete'|'fail'|'cancel'){
    if(!pending || requested===null)return;
    if(result==='complete'){setLoaded(requested);setStatus('Actual local destination preview updated. No remote save or route request occurred.');}
    if(result==='fail')setStatus('Local destination choice failed. Selected ID, query and loaded preview remain; submit again to retry.');
    if(result==='cancel')setStatus('Local destination choice cancelled. Selected ID, query and loaded preview remain.');
    setPending(false);setRequested(null);heading.current?.focus();
  }
  return <div data-combobox-lab className="space-y-4">
    <div className="flex flex-wrap gap-3"><Button style={actionStyle} type="button" variant="outline" disabled={pending} aria-pressed={disabled} onClick={()=>setDisabled(v=>!v)}>Disable local registered choices</Button><Button style={actionStyle} type="button" variant="outline" disabled={pending} aria-pressed={readOnly} onClick={()=>setReadOnly(v=>!v)}>Make local registered choices read only</Button><Button style={actionStyle} type="button" variant="outline" aria-pressed={rtl} onClick={()=>setRtl(v=>!v)}>Use RTL local registered choices</Button><Button style={actionStyle} type="button" variant="outline" disabled={pending} onClick={()=>{setValue('notes');setQuery('Local reading notes');setDisabled(false);setReadOnly(false);setError('');}}>Restore external registered choice</Button></div>
    <form noValidate className="space-y-4" onSubmit={event=>{event.preventDefault();if(pending || disabled)return;const selected=options.find(option=>option.value===value && !option.disabled);if(!selected || input.current?.value!==selected.label){setError('Choose an available registered destination; search text alone is not its ID.');input.current?.focus();return;}const data=new FormData(event.currentTarget);setPayload(JSON.stringify([...data.entries()]));setRequested(String(data.get('destination')));setPending(true);setError('');setStatus('Registered destination requested; loaded content remains until an explicit outcome.');heading.current?.focus();}}>
      <label htmlFor="combobox-local-target" className="block font-semibold">Registered local destination</label>
      <Combobox ref={input} id="combobox-local-target" name="destination" required options={options} value={value} onChange={next=>{setValue(next);setError('');}} inputValue={query} onInputValueChange={setQuery} onOptionSelect={()=>setCount(v=>v+1)} disabled={disabled || pending} readOnly={readOnly} dir={rtl ? 'rtl' : 'ltr'} triggerLabel="Show local destination choices" aria-describedby={error ? 'combobox-target-help combobox-target-error' : 'combobox-target-help'} aria-invalid={!!error} placeholder="Search then choose a local destination" />
      <p id="combobox-target-help">Search text filters choices. The registered field value is the last committed ID; this form rejects an unmatched draft query before requesting a preview.</p>
      {error && <p id="combobox-target-error" role="alert">{error}</p>}
      <label htmlFor="combobox-independent" className="block font-semibold">Independent optional registered choice</label>
      <Combobox id="combobox-independent" name="otherDestination" options={options} value={other} onChange={setOther} disabled={disabled || pending} readOnly={readOnly} dir={rtl ? 'rtl' : 'ltr'} triggerLabel="Show independent destination choices" />
      <div className="flex flex-wrap gap-3"><Button style={actionStyle} type="submit" disabled={disabled || pending}>Submit registered local choice</Button><Button style={actionStyle} type="button" variant="outline" disabled={disabled || readOnly || pending} onClick={()=>{setValue('');setQuery('');setError('');input.current?.focus();}}>Clear registered local choice</Button></div>
    </form>
    <p data-combobox-state>Committed ID: {value || 'none'}. Query: {query || '(empty)'}. <span data-combobox-count>{count}</span> actual suggestion activations.</p>
    <h3 ref={heading} tabIndex={-1} data-combobox-heading className="font-semibold">Loaded registered destination preview</h3><p data-combobox-loaded>{options.find(option=>option.value===loaded)?.text}</p>
    <p data-combobox-payload style={{overflowWrap:'anywhere'}}>Actual native form entries: {payload}</p>
    {pending && <div className="flex flex-wrap gap-3"><Button style={actionStyle} type="button" onClick={()=>outcome('complete')}>Complete registered local choice</Button><Button style={actionStyle} type="button" variant="outline" onClick={()=>outcome('fail')}>Fail registered local choice</Button><Button style={actionStyle} type="button" variant="outline" onClick={()=>outcome('cancel')}>Cancel registered local choice</Button></div>}
    <p role="status" data-combobox-status>{status}</p>
  </div>;
}
