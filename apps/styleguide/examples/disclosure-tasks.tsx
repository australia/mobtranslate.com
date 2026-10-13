'use client';
import {useRef,useState,type CSSProperties} from 'react';
import {Accordion,AccordionItem,AccordionHeader,AccordionTrigger,AccordionPanel,Collapsible,CollapsibleTrigger,CollapsiblePanel,Popover,PopoverTrigger,PopoverPortal,PopoverPositioner,PopoverPopup,PopoverTitle,PopoverDescription,PopoverClose,TooltipProvider,Tooltip,TooltipTrigger,TooltipPortal,TooltipPositioner,TooltipPopup,Button,Input,Textarea} from '@mobtranslate/ui';
const action:CSSProperties={minHeight:44,minWidth:0,maxWidth:'100%',height:'auto',whiteSpace:'normal',overflowWrap:'anywhere'};
export function AccordionTaskExample(){
  const [expanded,setExpanded]=useState<string[]>(['notes']);
  const [multiple,setMultiple]=useState(true);
  const [disabled,setDisabled]=useState(false);
  const [draft,setDraft]=useState('English-only retained reading note.');
  const [loaded,setLoaded]=useState('No note applied.');
  return <div data-accordion-lab className="space-y-4"><div className="flex flex-wrap gap-3"><Button type="button" style={action} variant="outline" aria-pressed={multiple} onClick={()=>{setMultiple(v=>!v);setExpanded(current=>multiple?current.slice(0,1):current);}}>Allow multiple local sections</Button><Button type="button" style={action} variant="outline" aria-pressed={disabled} onClick={()=>setDisabled(v=>!v)}>Disable local section disclosure</Button></div>
    <Accordion value={expanded} onValueChange={setExpanded} multiple={multiple} disabled={disabled} className={state=>state.disabled?'disclosure-unavailable':'disclosure-available'}>
      <AccordionItem value="notes"><AccordionHeader><AccordionTrigger>Local reading notes</AccordionTrigger></AccordionHeader><AccordionPanel><div className="p-4 space-y-3"><label htmlFor="accordion-note" className="block">Retained English-only note</label><Textarea id="accordion-note" value={draft} onChange={event=>setDraft(event.target.value)} /><Button style={action} type="button" onClick={()=>setLoaded(draft)}>Apply local note preview</Button></div></AccordionPanel></AccordionItem>
      <AccordionItem value="help"><AccordionHeader><AccordionTrigger>Local reading instructions</AccordionTrigger></AccordionHeader><AccordionPanel><p className="p-4">Opening this section does not save or submit the retained note. Closing its editor does not discard parent-owned text.</p></AccordionPanel></AccordionItem>
      <AccordionItem value="restricted" disabled><AccordionHeader><AccordionTrigger>Unavailable local section</AccordionTrigger></AccordionHeader><AccordionPanel><p>This unavailable fixture cannot be opened.</p></AccordionPanel></AccordionItem>
    </Accordion><p data-accordion-expanded>Expanded: {expanded.join(', ')||'none'}</p><p data-accordion-loaded role="status">{loaded}</p>
  </div>;
}
export function CollapsibleTaskExample(){
  const [open,setOpen]=useState(false);
  const [disabled,setDisabled]=useState(false);
  const [note,setNote]=useState('English-only optional context.');
  const [payload,setPayload]=useState('No native submission.');
  const trigger=useRef<HTMLButtonElement>(null);
  return <div data-collapsible-lab className="space-y-4"><Button type="button" style={action} variant="outline" aria-pressed={disabled} onClick={()=>setDisabled(v=>!v)}>Disable optional-context disclosure</Button>
    <form className="space-y-4" onSubmit={event=>{event.preventDefault();setPayload(JSON.stringify([...new FormData(event.currentTarget).entries()]));}}><label htmlFor="collapsible-title" className="block">Always visible local title</label><Input id="collapsible-title" name="title" defaultValue="English-only local draft" required /><input type="hidden" name="context" value={note} />
      <Collapsible open={open} onOpenChange={setOpen} disabled={disabled}><CollapsibleTrigger ref={trigger} render={<Button type="button" style={action} variant="outline" />} className={state=>state.open?'context-open':'context-closed'}>Optional local context</CollapsibleTrigger><CollapsiblePanel><div className="p-4 space-y-3"><label htmlFor="collapsible-note" className="block">Optional English-only context</label><Textarea id="collapsible-note" value={note} onChange={event=>setNote(event.target.value)} /><Button type="button" style={action} variant="outline" onClick={()=>{setOpen(false);trigger.current?.focus();}}>Close context and retain text</Button></div></CollapsiblePanel></Collapsible>
      <Button type="submit" style={action}>Submit local context draft</Button></form><p role="status" data-collapsible-payload style={{overflowWrap:'anywhere'}}>{payload}</p>
    <p>The parent-owned context is registered once through a hidden field, even when its optional editor is unmounted. Disclosure availability does not authorize or disable the form.</p>
  </div>;
}
export function PopoverTaskExample(){
  const [open,setOpen]=useState(false);
  const [draft,setDraft]=useState('16');
  const [applied,setApplied]=useState(16);
  const [requested,setRequested]=useState<number | null>(null);
  const [error,setError]=useState('');
  const [status,setStatus]=useState('Initial 16px local reading preview.');
  const [rtl,setRtl]=useState(false);
  const input=useRef<HTMLInputElement>(null);
  const trigger=useRef<HTMLButtonElement>(null);
  function resolve(result:'complete'|'fail'|'cancel'){
    if(requested===null)return;
    if(result==='complete'){setApplied(requested);setStatus('Actual local reading size applied. No durable setting saved.');setOpen(false);}
    else setStatus(`Local reading request ${result==='fail'?'failed':'cancelled'}. Draft and loaded preview remain; retry is available.`);
    setRequested(null);
  }
  return <div data-popover-lab className="space-y-4" dir={rtl?'rtl':'ltr'}><Button type="button" style={action} variant="outline" aria-pressed={rtl} onClick={()=>setRtl(v=>!v)}>Use RTL reading settings</Button>
    <Popover open={open} onOpenChange={next=>{setOpen(next);if(next){setDraft(String(applied));setError('');}else if(requested!==null){setRequested(null);setStatus('Dismissed local request cancelled. Loaded reading size remains.');}}}>
      <PopoverTrigger id="popover-reading-trigger" ref={trigger} render={<Button type="button" style={action} variant="outline" />}>Local reading settings</PopoverTrigger>
      <PopoverPortal><PopoverPositioner sideOffset={8} collisionPadding={8}><PopoverPopup dir={rtl?'rtl':'ltr'} initialFocus={input} finalFocus={interaction=>interaction==='keyboard'?trigger.current:true} className={state=>state.open?'reading-popup-open':'reading-popup-closed'}>
        <PopoverTitle>Local reading size</PopoverTitle><PopoverDescription>Choose 12–24 whole pixels. Applying changes this page-memory preview only.</PopoverDescription>
        <form className="mt-3 space-y-3" noValidate onSubmit={event=>{event.preventDefault();if(requested!==null)return;if(!input.current?.value || !input.current.validity.valid){setError('Enter a whole reading size from 12 through 24.');input.current?.focus();return;}setRequested(input.current.valueAsNumber);setError('');setStatus('Local reading size requested; preview remains until completion.');}}>
          <label htmlFor="popover-reading-size" className="block">Reading size in pixels</label><Input ref={input} id="popover-reading-size" type="number" name="size" required min={12} max={24} step={1} value={draft} onChange={event=>{setDraft(event.target.value);setError('');}} readOnly={requested!==null} aria-invalid={!!error} aria-describedby={error?'popover-reading-error':undefined} />
          {error && <p id="popover-reading-error" role="alert">{error}</p>}<div className="flex flex-wrap gap-3"><Button type="submit" style={action} disabled={requested!==null}>Request local reading size</Button><PopoverClose render={<Button type="button" style={action} variant="outline" />}>Close reading settings</PopoverClose></div>
        </form>
        {requested!==null && <div className="mt-3 flex flex-wrap gap-3"><Button type="button" style={action} onClick={()=>resolve('complete')}>Complete reading size</Button><Button type="button" style={action} variant="outline" onClick={()=>resolve('fail')}>Fail reading size</Button><Button type="button" style={action} variant="outline" onClick={()=>resolve('cancel')}>Cancel reading request</Button></div>}
        <p>{status}</p>
      </PopoverPopup></PopoverPositioner></PopoverPortal>
    </Popover><p data-popover-preview style={{fontSize:applied,overflowWrap:'anywhere'}}>Actual English-only reading sample at {applied}px.</p><p role="status" data-popover-status>{status}</p>
  </div>;
}
export function TooltipTaskExample(){
  const [saved,setSaved]=useState(false);
  const [tips,setTips]=useState(true);
  return <div data-tooltip-lab className="space-y-4"><p id="tooltip-persistent-help">Toggle the English-only bookmark in page memory. This instruction remains available without a tooltip.</p><Button type="button" style={action} variant="outline" aria-pressed={tips} onClick={()=>setTips(v=>!v)}>Enable local bookmark hint</Button>
    <TooltipProvider delay={200} closeDelay={100}><Tooltip disabled={!tips}><TooltipTrigger id="tooltip-bookmark-trigger" aria-describedby="tooltip-persistent-help" render={<Button type="button" size="icon" variant="outline" aria-label="Toggle local bookmark" aria-pressed={saved} onClick={()=>setSaved(v=>!v)} />}><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill={saved?'currentColor':'none'} stroke="currentColor" strokeWidth="2"><path d="M6 3h12v18l-6-4-6 4z" /></svg></TooltipTrigger><TooltipPortal><TooltipPositioner sideOffset={8} collisionPadding={8}><TooltipPopup className={state=>state.open?'bookmark-hint-open':'bookmark-hint-closed'}>Keeps a bookmark for this English-only local task.</TooltipPopup></TooltipPositioner></TooltipPortal></Tooltip></TooltipProvider><p role="status" data-tooltip-result>{saved?'Local bookmark present.':'Local bookmark absent.'}</p>
  </div>;
}
