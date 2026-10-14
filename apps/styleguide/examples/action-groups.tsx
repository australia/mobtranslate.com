'use client';
import {useRef,useState,type CSSProperties} from 'react';
import {Button,Input,CircularProgress,FloatingActionButton,Menu,MenuTrigger,MenuPortal,MenuPositioner,MenuPopup,MenuItem,DirectionProvider} from '@mobtranslate/ui';
const action:CSSProperties={minHeight:44,height:'auto',minWidth:0,maxWidth:'100%',whiteSpace:'normal',overflowWrap:'anywhere'};
type Kind='reading'|'comparison';
type Draft={id:number;kind:Kind;title:string};
export function ActionGroupsExample(){
  const [title,setTitle]=useState('English-only local draft');
  const [kind,setKind]=useState<Kind>('reading');
  const [drafts,setDrafts]=useState<Draft[]>([]);
  const [hold,setHold]=useState(false);
  const [pending,setPending]=useState<Draft|null>(null);
  const [message,setMessage]=useState('No local draft created.');
  const [error,setError]=useState('');
  const [rtl,setRtl]=useState(false);
  const input=useRef<HTMLInputElement>(null);
  const arrival=useRef<HTMLParagraphElement>(null);
  const nextId=useRef(0);
  const menuFocus=useRef<'trigger'|'input'|'status'>('trigger');
  function request(nextKind:Kind){
    if(pending)return;
    if(!title.trim()){menuFocus.current='input';setError('Enter a local draft title.');input.current?.focus();return;}
    setError('');setKind(nextKind);
    const snapshot={id:++nextId.current,kind:nextKind,title:title.trim()};
    if(hold){menuFocus.current='status';setPending(snapshot);setMessage(`Local ${nextKind} creation pending for “${snapshot.title}”.`);arrival.current?.focus();}
    else{setDrafts(previous=>[...previous,snapshot]);setMessage(`Created local ${nextKind} draft “${snapshot.title}”.`);}
  }
  function resolve(outcome:'complete'|'fail'|'cancel'){
    if(!pending)return;
    if(outcome==='complete'){setDrafts(previous=>[...previous,pending]);setMessage(`Created local ${pending.kind} draft “${pending.title}”.`);}
    else setMessage(`Local draft creation ${outcome==='fail'?'failed; correct the title or retry the chosen action':'cancelled'}. Existing drafts and title remain.`);
    setPending(null);arrival.current?.focus();
  }
  function options(fab:boolean){return <Menu disabled={!!pending} onOpenChange={next=>{if(next)menuFocus.current='trigger';}}>
    <MenuTrigger id={fab?'action-fab-trigger':'action-split-trigger'} render={fab?<FloatingActionButton extended size="md" disabled={!!pending} style={{...action,minHeight:56}}><span aria-hidden="true">＋</span> Create local draft options</FloatingActionButton>:<Button type="button" variant="ghost" disabled={!!pending} style={{...action,borderInlineStart:'2px solid var(--color-muted-foreground)'}}>More actions</Button>} />
    <MenuPortal><MenuPositioner sideOffset={8} collisionPadding={8}><MenuPopup finalFocus={()=>menuFocus.current==='input'?input.current:menuFocus.current==='status'?arrival.current:true} dir={rtl?'rtl':'ltr'} aria-label={fab?'Local FAB creation options':'Alternative local creation actions'}>
      <MenuItem onClick={()=>request('reading')}>Add reading draft{fab?' from FAB':''}</MenuItem>
      <MenuItem onClick={()=>request('comparison')}>Add comparison draft{fab?' from FAB':''}</MenuItem>
      <MenuItem disabled>Publish remotely unavailable</MenuItem>
    </MenuPopup></MenuPositioner></MenuPortal>
  </Menu>;}
  return <DirectionProvider direction={rtl?'rtl':'ltr'}><div data-action-groups-lab lang="en" dir={rtl?'rtl':'ltr'} className="space-y-4">
    <p dir="auto">These explicit local commands create retained page-memory drafts. An alternative menu command runs once and becomes the next primary action. No source or server publication occurs.</p>
    <label htmlFor="action-group-title" className="block">Local draft title</label><Input ref={input} id="action-group-title" value={title} readOnly={!!pending} aria-invalid={!!error} aria-describedby={error?'action-group-error':undefined} onChange={event=>setTitle(event.target.value)} />
    {error&&<p id="action-group-error" role="alert" dir="auto">{error}</p>}
    <div role="group" aria-label="Local draft creation" className="material-split">
      <Button id="action-primary" type="button" variant="ghost" disabled={!!pending} style={{...action,flex:1}} onClick={()=>request(kind)}>Add {kind} draft</Button>{options(false)}
    </div>
    <div role="group" aria-label="Local draft settings" className="flex flex-wrap gap-3"><Button style={action} type="button" variant="outline" disabled={!!pending} aria-pressed={hold} onClick={()=>setHold(value=>!value)}>Hold local draft creation</Button><Button style={action} type="button" variant="outline" aria-pressed={rtl} onClick={()=>setRtl(value=>!value)}>Use RTL action groups</Button></div>
    <div className="material-fab-space"><p dir="auto">The FAB menu offers the same creation tasks in this bounded workspace. It is placed in flow so it cannot cover the reading task.</p><div className="flex justify-end">{options(true)}</div></div>
    {pending&&<div className="flex flex-wrap gap-3"><CircularProgress value={null} aria-label="Local draft creation progress" /><Button style={action} type="button" onClick={()=>resolve('complete')}>Complete local draft creation</Button><Button style={action} type="button" variant="outline" onClick={()=>resolve('fail')}>Fail local draft creation</Button><Button style={action} type="button" variant="outline" onClick={()=>resolve('cancel')}>Cancel local draft creation</Button></div>}
    <p ref={arrival} tabIndex={-1} role="status" dir="auto" data-action-groups-status>{message} {drafts.length} local drafts exist.</p>
    <ol data-action-drafts className="guidance-list">{drafts.map(draft=><li key={draft.id} dir="auto">{draft.kind}: {draft.title}</li>)}</ol>
    <p dir="auto">The two command groups use ordinary Tab navigation. They are not a selection segment or a toolbar with arrow navigation. The menu supplies its installed keyboard/dismissal contract.</p>
  </div></DirectionProvider>;
}
