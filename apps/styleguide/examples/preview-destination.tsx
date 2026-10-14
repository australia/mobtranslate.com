'use client';
import {useState,type CSSProperties} from 'react';
import {PreviewCard,PreviewCardTrigger,PreviewCardPortal,PreviewCardPositioner,PreviewCardPopup,Button,Textarea} from '@mobtranslate/ui';
const action:CSSProperties={minWidth:0,maxWidth:'100%',minHeight:44,height:'auto',whiteSpace:'normal',overflowWrap:'anywhere'};
export function PreviewDestinationExample(){
  const [open,setOpen]=useState(false);
  const [enabled,setEnabled]=useState(true);
  const [rtl,setRtl]=useState(false);
  const [note,setNote]=useState('English-only retained local reading note.');
  return <div data-preview-lab className="space-y-4" dir={rtl?'rtl':'ltr'}><div className="flex flex-wrap gap-3"><Button style={action} type="button" variant="outline" aria-pressed={enabled} onClick={()=>{setEnabled(v=>!v);setOpen(false);}}>Enable local destination previews</Button><Button style={action} type="button" variant="outline" aria-pressed={rtl} onClick={()=>setRtl(v=>!v)}>Use RTL destination preview</Button></div>
    <p id="preview-persistent-help">The Accessibility guide contains structure, keyboard, contrast, validation and verification guidance. Follow its link for the complete topic; this supplemental preview does not save the draft below.</p>
    <PreviewCard open={open&&enabled} onOpenChange={next=>setOpen(next&&enabled)}><PreviewCardTrigger id="preview-accessibility-link" href="/guides/accessibility" delay={200} closeDelay={200} aria-describedby="preview-persistent-help" className="underline underline-offset-4" style={{display:'inline-flex',alignItems:'center',minHeight:44,maxWidth:'100%',overflowWrap:'anywhere'}}>Read Accessibility guidance</PreviewCardTrigger><PreviewCardPortal><PreviewCardPositioner sideOffset={8} collisionPadding={8}><PreviewCardPopup role="note" aria-label="Local accessibility topic preview" dir={rtl?'rtl':'ltr'} className={state=>state.open?'destination-preview-open':'destination-preview-closed'}><p className="font-semibold">Accessibility guidance</p><p className="mt-2">Read web requirements and source-backed verification boundaries. This local summary is supplemental; the complete destination is available through the ordinary link.</p><p className="mt-2">No account, permission, remote fetch or draft-save result is inferred from opening this preview.</p></PreviewCardPopup></PreviewCardPositioner></PreviewCardPortal></PreviewCard>
    <label htmlFor="preview-reading-note" className="block">Retained English-only local note</label><Textarea id="preview-reading-note" value={note} onChange={event=>setNote(event.target.value)} /><p data-preview-open-state>Actual preview state: {open&&enabled?'open':'closed'}.</p>
    <p>Hover/focus and dismissal keep this page-memory note unchanged. Ordinary link navigation leaves this example; it does not promise draft persistence across a new document.</p>
  </div>;
}
