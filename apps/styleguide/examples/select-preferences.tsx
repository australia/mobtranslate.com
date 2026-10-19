'use client';
import { useRef, useState } from 'react';
import { Button, DirectionProvider, Select, SelectGroup, SelectGroupLabel, SelectItem, SelectList, SelectPopup, SelectPortal, SelectPositioner, SelectSeparator, SelectTrigger, SelectValue } from '@mobtranslate/ui';

const spacingOptions=[{value:'roomy',label:'Roomy reading'},{value:'compact',label:'Compact reading'},{value:'unavailable',label:'Reviewed spacing unavailable'}];
const collectionOptions=[{value:'examples',label:'Local examples'},{value:'notes',label:'Local notes'},{value:'references',label:'Local references'}];
const records=collectionOptions.map(option=>({...option,text:`English-only ${option.label.toLowerCase()} record`}));

export function SelectPreferencesExample() {
  const [spacing,setSpacing]=useState<string | null>(null);
  const [collections,setCollections]=useState<string[]>([]);
  const [disabled,setDisabled]=useState(false);
  const [readOnly,setReadOnly]=useState(false);
  const [rtl,setRtl]=useState(false);
  const [pending,setPending]=useState(false);
  const [error,setError]=useState('');
  const [requested,setRequested]=useState<{spacing:string;collections:string[]} | null>(null);
  const [applied,setApplied]=useState({spacing:'roomy',collections:['examples']});
  const [payload,setPayload]=useState('No form submitted.');
  const [status,setStatus]=useState('Loaded defaults remain until explicit local completion.');
  const trigger=useRef<HTMLButtonElement>(null);
  const heading=useRef<HTMLHeadingElement>(null);
  const direction=rtl ? 'rtl' : 'ltr';
  function resolve(outcome:'complete'|'fail'|'cancel') {
    if (!pending || !requested) return;
    if (outcome==='complete') {setApplied(requested);setStatus('Local preferences applied to the actual preview. No remote save occurred.');}
    if (outcome==='fail') setStatus('Local preference request failed. Loaded preview and draft values remain; submit again to retry.');
    if (outcome==='cancel') setStatus('Local preference request cancelled. Loaded preview and draft values remain.');
    setPending(false);setRequested(null);heading.current?.focus();
  }
  return <div data-select-lab className="space-y-4">
    <div className="flex flex-wrap gap-3"><Button type="button" variant="outline" disabled={pending} aria-pressed={disabled} onClick={()=>setDisabled(value=>!value)}>Disable local selectors</Button><Button type="button" variant="outline" disabled={pending} aria-pressed={readOnly} onClick={()=>setReadOnly(value=>!value)}>Make local selectors read only</Button><Button type="button" variant="outline" aria-pressed={rtl} onClick={()=>setRtl(value=>!value)}>Use RTL local selectors</Button><Button type="button" variant="outline" disabled={pending} onClick={()=>{setDisabled(false);setReadOnly(false);setError('');}}>Restore editable local selectors</Button></div>
    <DirectionProvider direction={direction}><form dir={direction} noValidate className="space-y-4" onSubmit={event=>{
      event.preventDefault();if(pending || disabled) return;
      if(!spacing) {setError('Choose reading spacing before submitting local preferences.');trigger.current?.focus();return;}
      const data=new FormData(event.currentTarget);setPayload(JSON.stringify([...data.entries()]));
      setRequested({spacing:String(data.get('spacing')),collections:data.getAll('collection').map(String)});setPending(true);setError('');setStatus('Local preferences requested; loaded preview remains. Choose an explicit outcome.');heading.current?.focus();
    }}>
      <label id="select-spacing-label" htmlFor="select-spacing-trigger" className="block font-semibold">Local reading spacing</label>
      <Select name="spacing" required items={spacingOptions} value={spacing} onValueChange={value=>{setSpacing(value);setError('');}} disabled={disabled || pending} readOnly={readOnly}>
        <SelectTrigger ref={trigger} id="select-spacing-trigger" aria-labelledby="select-spacing-label" aria-describedby={error ? 'select-spacing-help select-spacing-error' : 'select-spacing-help'} aria-invalid={!!error} className={state=>state.open ? 'local-spacing-open' : undefined}><SelectValue>{value=>value ? spacingOptions.find(option=>option.value===value)?.label : 'Choose local reading spacing'}</SelectValue></SelectTrigger>
        <SelectPortal><SelectPositioner alignItemWithTrigger={false} sideOffset={8} collisionPadding={8}><SelectPopup dir={direction}><SelectList aria-label="Local reading spacing choices"><SelectGroup><SelectGroupLabel>Available layouts</SelectGroupLabel>{spacingOptions.slice(0,2).map(option=><SelectItem key={option.value} value={option.value} label={option.label}>{option.label}</SelectItem>)}</SelectGroup><SelectSeparator /><SelectGroup><SelectGroupLabel>Unavailable layout</SelectGroupLabel><SelectItem value="unavailable" disabled>Reviewed spacing unavailable</SelectItem></SelectGroup></SelectList></SelectPopup></SelectPositioner></SelectPortal>
      </Select>
      <p id="select-spacing-help">Required draft choice. A selected label is not a loaded result, review or permission.</p>
      {error && <p id="select-spacing-error" role="alert">{error}</p>}
      <label id="select-collection-label" htmlFor="select-collection-trigger" className="block font-semibold">Local preview collections</label>
      <Select multiple name="collection" items={collectionOptions} value={collections} onValueChange={setCollections} disabled={disabled || pending} readOnly={readOnly}>
        <SelectTrigger id="select-collection-trigger" aria-labelledby="select-collection-label" aria-describedby="select-collection-help"><SelectValue>{values=>values.length ? values.map((value:string)=>collectionOptions.find(option=>option.value===value)?.label).join(', ') : 'Choose any local collections'}</SelectValue></SelectTrigger>
        <SelectPortal><SelectPositioner alignItemWithTrigger={false} sideOffset={8} collisionPadding={8}><SelectPopup dir={direction}><SelectList aria-label="Local preview collection choices">{collectionOptions.map(option=><SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectList></SelectPopup></SelectPositioner></SelectPortal>
      </Select>
      <p id="select-collection-help">Optional multiple values serialize under the repeated collection name. Choosing none produces an empty local preview after completion.</p>
      <div className="flex flex-wrap gap-3"><Button type="submit" disabled={pending || disabled}>Submit local select preferences</Button><Button type="button" variant="outline" disabled={pending || disabled || readOnly} onClick={()=>{setSpacing(null);setCollections([]);setError('');trigger.current?.focus();}}>Clear local select choices</Button></div>
    </form></DirectionProvider>
    <h3 ref={heading} tabIndex={-1} data-select-preview-heading className="font-semibold">Loaded local reading preview</h3>
    <p data-select-loaded>Loaded spacing: {applied.spacing}. Loaded collections: {applied.collections.join(', ') || 'none'}.</p>
    <ul data-select-records className="guidance-list" style={{lineHeight:applied.spacing==='compact' ? 1.4 : 1.8}}>{records.filter(record=>applied.collections.includes(record.value)).map(record=><li key={record.value}>{record.text}</li>)}</ul>
    {!applied.collections.length && <p>No local collections selected. Choose a collection and submit to recover an actual preview.</p>}
    <p data-select-payload style={{overflowWrap:'anywhere'}}>Actual submitted FormData entries: {payload}</p>
    {pending && <div className="flex flex-wrap gap-3"><Button type="button" onClick={()=>resolve('complete')}>Complete local select preferences</Button><Button type="button" variant="outline" onClick={()=>resolve('fail')}>Fail local select preferences</Button><Button type="button" variant="outline" onClick={()=>resolve('cancel')}>Cancel local select preferences</Button></div>}
    <p role="status" data-select-status>{status}</p>
  </div>;
}
