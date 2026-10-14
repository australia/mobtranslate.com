'use client';
import {useRef,useState,type CSSProperties} from 'react';
import {ScrollArea,Button} from '@mobtranslate/ui';
const action:CSSProperties={minWidth:0,maxWidth:'100%',minHeight:44,height:'auto',whiteSpace:'normal',overflowWrap:'anywhere'};
const records=Array.from({length:24},(_,index)=>({id:index+1,label:`Local English-only record ${index+1}`,text:`Actual retained content for local record ${index+1}.`}));
export function ScrollRecordsExample(){
  const [short,setShort]=useState(false);
  const [wide,setWide]=useState(false);
  const [rtl,setRtl]=useState(false);
  const [compact,setCompact]=useState(false);
  const [selected,setSelected]=useState(1);
  const [scroll,setScroll]=useState(0);
  const viewport=useRef<HTMLDivElement>(null);
  const visible=short?records.slice(0,2):records;
  return <div data-scroll-lab className="space-y-4"><div className="flex flex-wrap gap-3"><Button style={action} type="button" variant="outline" aria-pressed={short} onClick={()=>setShort(v=>!v)}>Use short local record list</Button><Button style={action} type="button" variant="outline" aria-pressed={wide} onClick={()=>setWide(v=>!v)}>Use wide record content</Button><Button style={action} type="button" variant="outline" aria-pressed={rtl} onClick={()=>setRtl(v=>!v)}>Use RTL record viewport</Button><Button style={action} type="button" variant="outline" aria-pressed={compact} onClick={()=>setCompact(v=>!v)}>Use compact viewport height</Button></div>
    <div className="flex flex-wrap gap-3"><Button style={action} type="button" variant="outline" onClick={()=>viewport.current?.scrollTo({top:0,behavior:'auto'})}>Go to first local records</Button><Button style={action} type="button" variant="outline" onClick={()=>viewport.current?.scrollTo({top:viewport.current.scrollHeight,behavior:'auto'})}>Go to last local records</Button></div>
    <ScrollArea data-record-scroll style={{height:compact?180:260,border:'2px solid var(--color-muted-foreground)',borderRadius:'var(--radius-md)'}} dir={rtl?'rtl':'ltr'} className={state=>state.hasOverflowY?'records-overflow-y':'records-fit-y'} viewportRef={viewport} viewportProps={{role:'region','aria-label':'Local English-only record browser','data-record-viewport':true,onScroll:event=>setScroll(Math.round(event.currentTarget.scrollTop)),className:state=>state.hasOverflowX?'records-overflow-x':'records-fit-x'}}>
      <div style={{padding:28,minWidth:wide?1440:undefined}}><ul className="space-y-3" data-record-list>{visible.map(record=><li key={record.id}><Button style={{...action,width:'100%',textAlign:'start',justifyContent:'flex-start'}} type="button" variant={selected===record.id?'primary':'outline'} aria-pressed={selected===record.id} onClick={()=>setSelected(record.id)}>{record.label}</Button></li>)}</ul></div>
    </ScrollArea><p data-scroll-position>Actual vertical scroll position: {scroll}px.</p><p role="status" data-scroll-result>{records.find(record=>record.id===selected)?.text}</p><p>List-size, width and height controls change actual overflow. A selected record remains loaded when the shorter list excludes it; clearing/filter reconciliation is a separate task policy. The first/last actions provide alternatives to dragging the custom thumb.</p></div>;
}
