'use client';
import {useCallback,useEffect,useMemo,useRef,useState,type CSSProperties} from 'react';
import {Button,Input,Separator} from '@mobtranslate/ui';
const records=Array.from({length:5},(_,index)=>({id:`collection-${index+1}`,title:`Local collection ${index+1}`,detail:`English-only retained content for collection ${index+1}.`}));
const action:CSSProperties={minHeight:44,height:'auto',minWidth:0,maxWidth:'100%',whiteSpace:'normal',overflowWrap:'anywhere'};
export function ListsCarouselExample(){
  const [query,setQuery]=useState('');
  const [current,setCurrent]=useState(0);
  const [loaded,setLoaded]=useState<string|null>(null);
  const [rtl,setRtl]=useState(false);
  const viewport=useRef<HTMLDivElement>(null);
  const slides=useRef(new Map<string,HTMLDivElement>());
  const visible=useMemo(()=>records.filter(record=>record.title.toLocaleLowerCase('en').includes(query.trim().toLocaleLowerCase('en'))),[query]);
  const measure=useCallback(()=>{const root=viewport.current;if(!root||!visible.length){setCurrent(0);return;}const r=root.getBoundingClientRect();const center=r.left+r.width/2;let nearest=0,distance=Infinity;visible.forEach((record,index)=>{const item=slides.current.get(record.id)?.getBoundingClientRect();if(!item)return;const next=Math.abs(item.left+item.width/2-center);if(next<distance){nearest=index;distance=next;}});setCurrent(nearest);},[visible]);
  useEffect(()=>{viewport.current?.scrollTo({left:0,behavior:'auto'});setCurrent(0);},[query,rtl]);
  useEffect(()=>{const root=viewport.current;if(!root)return;const observer=new ResizeObserver(()=>{const width=Math.min(root.clientWidth*.8,320);root.style.setProperty('--local-slide-width',`${width}px`);root.style.setProperty('--local-slide-edge',`${(root.clientWidth-width)/2}px`);measure();});observer.observe(root);return()=>observer.disconnect();},[measure]);
  function move(index:number){const record=visible[index];if(!record)return;slides.current.get(record.id)?.scrollIntoView({block:'nearest',inline:'center',behavior:'auto'});if(index===0||index===visible.length-1)viewport.current?.focus({preventScroll:true});}
  const result=records.find(record=>record.id===loaded);
  return <div data-collections-lab lang="en" dir={rtl?'rtl':'ltr'} className="space-y-4">
    <label htmlFor="collections-filter" className="block">Filter five loaded English-only titles</label><Input id="collections-filter" value={query} onChange={event=>setQuery(event.target.value)} />
    <div className="flex flex-wrap gap-3"><Button style={action} type="button" variant="outline" onClick={()=>setQuery('')}>Clear collection filter</Button><Button style={action} type="button" variant="outline" aria-pressed={rtl} onClick={()=>setRtl(value=>!value)}>Use RTL collections</Button></div>
    <p dir="auto" id="carousel-help">Scroll the named comparison region or use Previous/Next. No autoplay runs. Every loaded item also appears in the complete list below.</p>
    <div ref={viewport} onScroll={measure} role="region" aria-roledescription="carousel" aria-label="Local collection comparison" aria-describedby="carousel-help" tabIndex={0} data-local-carousel className="material-carousel">
      {visible.map((record,index)=><div ref={node=>{if(node)slides.current.set(record.id,node);else slides.current.delete(record.id);}} key={record.id} className="material-slide" role="group" aria-roledescription="slide" aria-label={`${index+1} of ${visible.length}: ${record.title}`} data-slide-id={record.id} data-current={current===index?'':undefined}>
        <span aria-hidden="true" className="material-slide-number">{index+1}</span><h3 className="font-semibold" dir="auto">{record.title}</h3><p dir="auto">{record.detail}</p><Button style={action} type="button" variant="outline" aria-label={`Open carousel ${record.title}`} onClick={()=>setLoaded(record.id)}>Open collection</Button>
      </div>)}
    </div>
    <div role="group" aria-label="Local carousel navigation" className="flex flex-wrap gap-3"><Button style={action} type="button" variant="outline" disabled={!visible.length||current===0} onClick={()=>move(current-1)}>Previous local slide</Button><Button style={action} type="button" variant="outline" disabled={!visible.length||current===visible.length-1} onClick={()=>move(current+1)}>Next local slide</Button></div>
    <p role="status" dir="auto" data-carousel-status>{visible.length?`Centered local slide ${current+1} of ${visible.length}.`:'No loaded titles match. Clear the collection filter to recover.'}</p>
    <h3 className="font-semibold">Complete filtered local list</h3><ul data-collection-list>{visible.map(record=><li key={record.id}><div className="py-3"><h4 dir="auto" className="font-semibold">{record.title}</h4><p dir="auto">{record.detail}</p><Button style={action} type="button" variant="outline" aria-label={`Open list ${record.title}`} onClick={()=>setLoaded(record.id)}>Open collection</Button></div><Separator aria-hidden="true" /></li>)}</ul>
    <p role="status" dir="auto" data-collection-result>{result?`${result.title}: ${result.detail}`:'No collection opened yet.'}</p><p dir="auto">List and carousel actions load the same stable record IDs. Filtering retains an already opened record; a centered slide is a viewport position, not a selected or reviewed source. All records render locally, without virtualization, photo rights, remote loading or invented language content.</p>
  </div>;
}
