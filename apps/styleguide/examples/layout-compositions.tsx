'use client';

import {useEffect,useRef,useState,type CSSProperties} from 'react';
import {Button} from '@mobtranslate/ui';
import './layout-compositions.css';

type Composition='list-detail'|'feed'|'supporting';
const records=[
  {id:'a',title:'Example A',description:'A short English interface record for comparing reading and editing regions.',context:'Illustrative record A. No language entry or publication permission is asserted.'},
  {id:'b',title:'Example B',description:'A second local record with its own independently retained note.',context:'Illustrative record B. Editing a note does not change a source or review status.'},
  {id:'c',title:'Example C',description:'A longer local example for testing wrapping, selection and a stable return path.',context:'Illustrative record C. These records are public documentation fixtures.'},
] as const;
type RecordId=typeof records[number]['id'];

export function LayoutCompositionsExample(){
  const [mode,setMode]=useState<Composition>('list-detail');
  const [requestedWidth,setRequestedWidth]=useState(960);
  const [actualWidth,setActualWidth]=useState<number|null>(null);
  const [rtl,setRtl]=useState(false);
  const [shares,setShares]=useState({'list-detail':34,supporting:66});
  const [selected,setSelected]=useState<RecordId|null>(null);
  const [drafts,setDrafts]=useState<Partial<Record<RecordId,string>>>({});
  const [saved,setSaved]=useState<Partial<Record<RecordId,string>>>({});
  const [status,setStatus]=useState('');
  const [openEpoch,setOpenEpoch]=useState(0);
  const [returnId,setReturnId]=useState<RecordId|null>(null);
  const root=useRef<HTMLDivElement>(null),detail=useRef<HTMLHeadingElement>(null);
  const triggers=useRef<Partial<Record<RecordId,HTMLElement>>>({});
  const compact=actualWidth===null||actualWidth<640;
  const share=mode==='feed'?50:shares[mode];
  const active=records.find(record=>record.id===selected)??(mode==='supporting'?records[0]:null);
  const showList=mode!=='supporting'&&(mode==='feed'||!compact||selected===null);
  const showDetail=mode==='supporting'||(mode==='list-detail'&&!compact)||selected!==null;

  useEffect(()=>{
    const element=root.current;if(!element)return;
    const observer=new ResizeObserver(entries=>{
      const width=entries[0]?.contentRect.width;if(width===undefined)return;
      // If resizing will hide a focused list item, keep the current task reachable.
      if(mode==='list-detail'&&width<640&&selected&&element.querySelector('[data-composition-list]')?.contains(document.activeElement))detail.current?.focus();
      setActualWidth(width);
    });observer.observe(element);return()=>observer.disconnect();
  },[mode,selected]);
  useEffect(()=>{if(openEpoch)detail.current?.focus();},[openEpoch]);
  useEffect(()=>{if(returnId){triggers.current[returnId]?.focus();setReturnId(null);}},[returnId]);
  const choose=(id:RecordId)=>{setSelected(id);setStatus('');setOpenEpoch(value=>value+1);};
  const back=()=>{if(selected)setReturnId(selected);setSelected(null);setStatus('');};
  const save=()=>{if(!active)return;const note=drafts[active.id]??'';setSaved(current=>({...current,[active.id]:note}));setStatus(`${active.title}: local note snapshot saved. No source or publication changed.`);};

  return <div className="space-y-4" data-composition-ready={actualWidth!==null}>
    <div className="composition-settings">
      <label htmlFor="composition-mode">Composition<select id="composition-mode" className="mt-input" value={mode} onChange={event=>{setMode(event.target.value as Composition);setStatus('');}}><option value="list-detail">List-detail</option><option value="feed">Feed</option><option value="supporting">Supporting pane</option></select></label>
      <label htmlFor="composition-width">Maximum container width: {requestedWidth}px<input id="composition-width" type="range" min="280" max="1200" step="20" value={requestedWidth} onChange={event=>setRequestedWidth(Number(event.target.value))} /></label>
      <label className="composition-direction"><input id="composition-rtl" type="checkbox" checked={rtl} onChange={event=>setRtl(event.target.checked)} />Right-to-left placement</label>
      {mode!=='feed'&&<label htmlFor="composition-share">Leading pane share: {share}%<input id="composition-share" type="range" min="30" max="70" step="1" value={share} onChange={event=>{const value=Number(event.target.value);setShares(current=>({...current,[mode]:value}));}} aria-describedby="composition-share-help" /></label>}
    </div>
    {mode!=='feed'&&<p id="composition-share-help">Adjust the split with the native range control. The share applies only when both panes fit; it is retained while stacked. No drag handle is required.</p>}
    <p data-composition-measure>{actualWidth===null?'Measuring the available container.':`Actual container: ${Math.round(actualWidth)} CSS px. ${mode==='list-detail'?(compact?'Single pane':'Two panes'):mode==='supporting'?(actualWidth<900?'Stacked context':'Context beside task'):'Content-driven feed'}.`} The maximum is a cap, not a forced width.</p>
    <div ref={root} className="composition-container" style={{maxInlineSize:requestedWidth,'--composition-leading':`${share}fr`,'--composition-trailing':`${100-share}fr`} as CSSProperties} dir={rtl?'rtl':'ltr'} data-composition-container data-mode={mode}>
      <div className="composition-shell">
        <div className="composition-list" data-composition-list hidden={!showList}>
          <h3 dir="auto" className="font-semibold text-xl">Local example records</h3>
          <ul>{records.map(record=><li key={record.id}><h4 dir="auto" className="font-semibold">{record.title}</h4>{mode==='feed'&&<p dir="auto" lang="en">{record.description}</p>}<Button type="button" variant={selected===record.id?'primary':'outline'} ref={node=>{if(node)triggers.current[record.id]=node;else delete triggers.current[record.id];}} data-composition-open={record.id} aria-current={selected===record.id?'true':undefined} onClick={()=>choose(record.id)}>Open {record.title}</Button></li>)}</ul>
        </div>
        <div className="composition-task" data-composition-task hidden={!showDetail}>
          {mode==='supporting'&&<label htmlFor="composition-record">Active record<select id="composition-record" className="mt-input" value={active?.id??'a'} onChange={event=>{setSelected(event.target.value as RecordId);setStatus('');}}>{records.map(record=><option value={record.id} key={record.id}>{record.title}</option>)}</select></label>}
          <h3 ref={detail} dir="auto" tabIndex={-1} className="font-semibold text-xl" data-composition-heading>{active?active.title:'Choose a local record'}</h3>
          {active?<><p dir="auto" lang="en">{active.description}</p>
            {mode!=='supporting'&&<p data-composition-context dir="auto" lang="en">{active.context}</p>}
            <label htmlFor="composition-note">Local note for {active.title}<textarea id="composition-note" dir="auto" lang="" className="mt-textarea mt-textarea-resize-vertical" value={drafts[active.id]??''} onChange={event=>setDrafts(current=>({...current,[active.id]:event.target.value}))} /></label>
            <div className="composition-actions"><Button type="button" data-composition-save onClick={save}>Save local note snapshot</Button>{mode!=='supporting'&&<Button type="button" variant="outline" data-composition-back onClick={back}>{mode==='feed'?'Close detail':compact?'Back to records':'Clear selection'}</Button>}</div>
            <p data-composition-saved dir="auto" className="whitespace-pre-wrap">{saved[active.id]===undefined?'No local snapshot for this record.':<>Saved note: <bdi lang="">{saved[active.id]||'(empty note)'}</bdi></>}</p>
          </>:<p>Select a record to inspect its description and edit its own local note.</p>}
        </div>
        {mode==='supporting'&&active&&<aside className="composition-context" aria-label={`Context for ${active.title}`} data-composition-support><h3 dir="auto" className="font-semibold">Context for {active.title}</h3><p dir="auto" lang="en">{active.context}</p><p dir="auto" lang="en">The context follows its task in DOM order and stays available when stacked.</p></aside>}
      </div>
    </div>
    <p role="status" data-composition-status>{status}</p>
    <p className="text-sm">All notes and snapshots belong to this page instance. They survive composition, size and record changes, but not reload. English fixture text keeps its language and glyph order when placement is RTL. This is not a foldable-device, browser-history or remote-storage implementation.</p>
  </div>;
}
