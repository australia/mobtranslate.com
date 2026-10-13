'use client';
import {useRef,useState,type CSSProperties} from 'react';
import {Autocomplete,Button} from '@mobtranslate/ui';

const actionStyle:CSSProperties={maxWidth:'100%',minWidth:0,minHeight:44,height:'auto',whiteSpace:'normal',overflowWrap:'anywhere'};
const options=[{value:'overview',label:'Local workspace overview'},{value:'reading',label:'Local reading notes'},{value:'saved',label:'Local saved examples'},{value:'restricted',label:'Reviewed source unavailable',disabled:true}];
export function AutocompleteTextExample(){
  const [text,setText]=useState('');
  const [other,setOther]=useState('');
  const [accepted,setAccepted]=useState('none');
  const [acceptCount,setAcceptCount]=useState(0);
  const [disabled,setDisabled]=useState(false);
  const [readOnly,setReadOnly]=useState(false);
  const [rtl,setRtl]=useState(false);
  const [pending,setPending]=useState(false);
  const [requested,setRequested]=useState<string | null>(null);
  const [loaded,setLoaded]=useState('English-only initial local note');
  const [payload,setPayload]=useState('No native form submission.');
  const [error,setError]=useState('');
  const [status,setStatus]=useState('Free text is allowed. Suggestions do not establish source authority.');
  const input=useRef<HTMLInputElement>(null);
  const heading=useRef<HTMLHeadingElement>(null);
  function outcome(result:'complete'|'fail'|'cancel'){
    if(!pending || requested===null)return;
    if(result==='complete'){setLoaded(requested);setStatus('Local text preview updated. No remote save occurred.');}
    if(result==='fail')setStatus('Local text request failed. Loaded preview and draft remain; submit again to retry.');
    if(result==='cancel')setStatus('Local text request cancelled. Loaded preview and draft remain.');
    setPending(false);setRequested(null);heading.current?.focus();
  }
  return <div data-autocomplete-lab className="space-y-4">
    <div className="flex flex-wrap gap-3"><Button style={actionStyle} type="button" variant="outline" disabled={pending} aria-pressed={disabled} onClick={()=>setDisabled(value=>!value)}>Disable local suggestion inputs</Button><Button style={actionStyle} type="button" variant="outline" disabled={pending} aria-pressed={readOnly} onClick={()=>setReadOnly(value=>!value)}>Make local suggestion inputs read only</Button><Button style={actionStyle} type="button" variant="outline" aria-pressed={rtl} onClick={()=>setRtl(value=>!value)}>Use RTL local suggestions</Button><Button style={actionStyle} type="button" variant="outline" disabled={pending} onClick={()=>{setText('Restored external local text');setAccepted('none');setError('');setDisabled(false);setReadOnly(false);}}>Restore external local text</Button></div>
    <form noValidate className="space-y-4" onSubmit={event=>{event.preventDefault();if(pending || disabled)return;if(!text.trim()){setError('Enter a nonempty local note; choosing a suggestion is optional.');input.current?.focus();return;}const data=new FormData(event.currentTarget);setPayload(JSON.stringify([...data.entries()]));setRequested(String(data.get('note')));setPending(true);setError('');setStatus('Local text requested; the loaded preview remains until an explicit outcome.');heading.current?.focus();}}>
      <label htmlFor="autocomplete-local-note" className="block font-semibold">Local note text</label>
      <Autocomplete ref={input} id="autocomplete-local-note" name="note" required options={options} value={text} onChange={value=>{setText(value);setAccepted('none');setError('');}} onOptionSelect={option=>{setAccepted(option.value);setAcceptCount(count=>count+1);}} disabled={disabled || pending} readOnly={readOnly} dir={rtl ? 'rtl' : 'ltr'} aria-describedby={error ? 'autocomplete-note-help autocomplete-note-error' : 'autocomplete-note-help'} aria-invalid={!!error} placeholder="Type your own local note or use a suggestion" />
      <p id="autocomplete-note-help">This field submits text, including an accepted label. A suggestion’s stable value is separate metadata and is not submitted as a record identifier.</p>
      {error && <p id="autocomplete-note-error" role="alert">{error}</p>}
      <label htmlFor="autocomplete-independent" className="block font-semibold">Independent optional local note</label>
      <Autocomplete id="autocomplete-independent" name="otherNote" options={options} value={other} onChange={setOther} disabled={disabled || pending} readOnly={readOnly} dir={rtl ? 'rtl' : 'ltr'} />
      <p>Two instances have separate text, list identities and active-descendant relationships.</p>
      <div className="flex flex-wrap gap-3"><Button style={actionStyle} type="submit" disabled={disabled || pending}>Submit local suggestion text</Button><Button style={actionStyle} type="button" variant="outline" disabled={disabled || readOnly || pending} onClick={()=>{setText('');setAccepted('none');setError('');input.current?.focus();}}>Clear local suggestion text</Button></div>
    </form>
    <p data-autocomplete-metadata>Last accepted suggestion metadata: {accepted}. Editing or restoring text clears that metadata. <span data-autocomplete-accept-count>{acceptCount}</span> activation callbacks in this local page.</p>
    <h3 ref={heading} tabIndex={-1} data-autocomplete-heading className="font-semibold">Loaded local note preview</h3><p data-autocomplete-loaded>{loaded}</p>
    <p data-autocomplete-payload style={{overflowWrap:'anywhere'}}>Actual native form entries: {payload}</p>
    {pending && <div className="flex flex-wrap gap-3"><Button style={actionStyle} type="button" onClick={()=>outcome('complete')}>Complete local suggestion text</Button><Button style={actionStyle} type="button" variant="outline" onClick={()=>outcome('fail')}>Fail local suggestion text</Button><Button style={actionStyle} type="button" variant="outline" onClick={()=>outcome('cancel')}>Cancel local suggestion text</Button></div>}
    <p role="status" data-autocomplete-status>{status}</p>
  </div>;
}
