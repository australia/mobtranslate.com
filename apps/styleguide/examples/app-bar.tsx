'use client';
import {useEffect,useRef,useState,type CSSProperties} from 'react';
import {Button,Input,Menu,MenuTrigger,MenuPortal,MenuPositioner,MenuPopup,MenuCheckboxItem,MenuCheckboxItemIndicator,DirectionProvider} from '@mobtranslate/ui';
const records=[{id:'reading',title:'Local reading collection'},{id:'comparison',title:'Local comparison collection'},{id:'drafts',title:'Local draft collection'}];
const action:CSSProperties={minHeight:44,height:'auto',minWidth:0,maxWidth:'100%',whiteSpace:'normal',overflowWrap:'anywhere'};
export function AppBarExample(){
  const [opened,setOpened]=useState<string|null>(null);
  const [notes,setNotes]=useState<Record<string,string>>({});
  const [result,setResult]=useState('No local note snapshot saved.');
  const [compact,setCompact]=useState(false);
  const [scope,setScope]=useState(true);
  const [rtl,setRtl]=useState(false);
  const bar=useRef<HTMLElement>(null);
  const workspace=useRef<HTMLDivElement>(null);
  const heading=useRef<HTMLHeadingElement>(null);
  const opener=useRef<HTMLElement|null>(null);
  const current=records.find(record=>record.id===opened);
  useEffect(()=>{const node=bar.current;if(!node)return;const observer=new ResizeObserver(()=>workspace.current?.style.setProperty('--local-appbar-height',`${Math.ceil(node.getBoundingClientRect().height)}px`));observer.observe(node);return()=>observer.disconnect();},[]);
  useEffect(()=>{if(bar.current)workspace.current?.style.setProperty('--local-appbar-height',`${Math.ceil(bar.current.getBoundingClientRect().height)}px`);if(opened){heading.current?.focus({preventScroll:true});heading.current?.scrollIntoView({block:'nearest'});}else opener.current?.focus({preventScroll:true});},[opened]);
  return <DirectionProvider direction={rtl?'rtl':'ltr'}><div data-app-bar-lab lang="en" className="space-y-4">
    <Button type="button" variant="outline" style={action} aria-pressed={rtl} onClick={()=>setRtl(value=>!value)}>Use RTL app bar workspace</Button>
    <div ref={workspace} data-app-bar-workspace dir={rtl?'rtl':'ltr'} role="region" aria-label="Local app bar workspace" tabIndex={0} className="material-appbar-workspace">
      <header ref={bar} data-local-app-bar className="material-appbar">
        <Button type="button" variant="outline" style={action} disabled={!current} onClick={()=>setOpened(null)}>Back to collections</Button>
        <h3 className="material-appbar-title" dir="auto">{current?.title??'Local collections'}</h3>
        <Button type="button" variant="outline" style={action} disabled={!current} onClick={()=>setResult(`Actual local snapshot for ${current?.title}: ${notes[opened??'']||'(empty note)'}.`)}>Save local note</Button>
        <Menu><MenuTrigger id="appbar-options" render={<Button type="button" variant="outline" style={action}>Workspace options</Button>} />
          <MenuPortal><MenuPositioner sideOffset={8} collisionPadding={8}><MenuPopup dir={rtl?'rtl':'ltr'} aria-label="Local workspace options"><MenuCheckboxItem checked={compact} onCheckedChange={setCompact}><MenuCheckboxItemIndicator aria-hidden="true">✓</MenuCheckboxItemIndicator>Compact collection rows</MenuCheckboxItem><MenuCheckboxItem checked={scope} onCheckedChange={setScope}><MenuCheckboxItemIndicator aria-hidden="true">✓</MenuCheckboxItemIndicator>Show workspace scope</MenuCheckboxItem></MenuPopup></MenuPositioner></MenuPortal>
        </Menu>
      </header>
      <div className="material-appbar-content">
        {scope&&<p dir="auto">Three English-only local collections. This workspace and its app bar scroll independently from the documentation header.</p>}
        <div hidden={!!current}><ul data-appbar-list className="space-y-3">{records.map(record=><li key={record.id}><Button style={{...action,width:'100%',textAlign:'start',paddingBlock:compact?8:16}} type="button" variant="outline" onClick={event=>{opener.current=event.currentTarget;setOpened(record.id);}}>Open {record.title}</Button></li>)}</ul></div>
        <div hidden={!current}><h4 ref={heading} tabIndex={-1} data-appbar-heading dir="auto" className="font-semibold">{current?.title} note</h4><label htmlFor="appbar-note" className="block">Retained local collection note</label><Input id="appbar-note" value={notes[opened??'']??''} onChange={event=>setNotes(previous=>({...previous,[opened??'']:event.target.value}))} /><p dir="auto">Saving snapshots this collection’s actual note. Back retains every collection’s separate draft and restores the originating control.</p></div>
        {Array.from({length:6},(_,index)=><p className="mt-4" dir="auto" key={index}>Local workspace reading context {index+1}. Use the named region to scroll; the app bar stays within its own workspace and does not replace global site navigation.</p>)}
      </div>
    </div>
    <p role="status" dir="auto" data-appbar-result>{result}</p>
  </div></DirectionProvider>;
}
