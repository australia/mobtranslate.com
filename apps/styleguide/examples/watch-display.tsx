'use client';
import {useEffect,useState} from 'react';
import {Button} from '@mobtranslate/ui';

export function WatchDisplayExample() {
  const [ready,setReady]=useState(false);
  const [diameter,setDiameter]=useState(204);
  const [shape,setShape]=useState('round');
  const [scale,setScale]=useState(1);
  const [note,setNote]=useState('Check the original source before sharing this note.');
  const [saved,setSaved]=useState<string|null>(null);
  const [status,setStatus]=useState('No local note snapshot saved.');
  useEffect(()=>setReady(true),[]);
  // A square inscribed in a circle has side D / sqrt(2). Account for the
  // 2px border on each edge, then reserve 4px per side for visible focus.
  const side=shape==='round'?Math.floor((diameter-4)/Math.SQRT2)-8:diameter-20;
  return <div data-watch-ready={ready} className="space-y-4">
    <p id="watch-boundary">Browser layout specimen in CSS pixels. This does not emulate Wear OS, physical pixels, rotary input, battery use or a watch’s accessibility services.</p>
    <div className="grid gap-4 sm:grid-cols-3">
      <label htmlFor="watch-shape">Display shape<select id="watch-shape" className="mt-input w-full mt-2" disabled={!ready} value={shape} onChange={event=>setShape(event.target.value)}><option value="round">Round</option><option value="rectangular">Rectangular</option></select></label>
      <label htmlFor="watch-size">CSS display size<select id="watch-size" className="mt-input w-full mt-2" disabled={!ready} value={diameter} onChange={event=>setDiameter(Number(event.target.value))}>{[160,204,240].map(size=><option key={size} value={size}>{size} × {size} CSS px</option>)}</select></label>
      <label htmlFor="watch-scale">Text enlargement<select id="watch-scale" className="mt-input w-full mt-2" disabled={!ready} value={scale} onChange={event=>setScale(Number(event.target.value))}>{[1,1.25,1.5,2].map(value=><option key={value} value={value}>{value*100}%</option>)}</select></label>
    </div>
    <label htmlFor="watch-note" className="block">English example note</label>
    <textarea id="watch-note" className="mt-textarea w-full" disabled={!ready} value={note} onChange={event=>setNote(event.target.value)} aria-describedby="watch-note-help" />
    <p id="watch-note-help">The complete editable text stays available here. Save in the small display to capture this exact text in the example’s local state.</p>
    <div data-watch-display aria-describedby="watch-boundary" style={{width:diameter,height:diameter,border:'2px solid var(--color-muted-foreground)',borderRadius:shape==='round'?'50%':'var(--radius-lg)',background:'var(--color-card)',color:'var(--color-card-foreground)',display:'grid',placeItems:'center',maxWidth:'100%'}}>
      <div data-watch-viewport role="region" aria-label="Scrollable small-display note" tabIndex={0} style={{width:side,height:side,overflow:'auto',padding:8,outlineOffset:0,fontSize:14*scale,lineHeight:1.4,overflowWrap:'anywhere'}}>
        <p className="font-semibold mb-2">Note</p>
        <p className="mb-3" lang="en" dir="auto">{note.trim()?note:'No note entered. Use the editor above.'}</p>
        <Button data-watch-save type="button" aria-label="Save local note" disabled={!ready||!note.trim()} onClick={()=>{setSaved(note);setStatus('Local snapshot saved in this example. No remote transfer occurred.');}} style={{width:'100%',minHeight:44,height:'auto',padding:'3px 0',scrollMargin:6,transition:'none',fontSize:16*scale,lineHeight:1.3,whiteSpace:'nowrap'}}>Save</Button>
      </div>
    </div>
    <p data-watch-geometry>{side} × {side} CSS px content viewport. {shape==='round'?'The square and its reserved focus margin fit inside the circle.':'The content viewport leaves an edge inset.'} Longer content scrolls without shrinking its text.</p>
    <p role="status" data-watch-status>{status}</p>
    {saved!==null&&<div><p className="font-semibold">Local saved snapshot</p><p data-watch-snapshot lang="en" dir="auto" className="whitespace-pre-wrap break-words">{saved}</p></div>}
    <Button type="button" variant="outline" style={{maxWidth:'100%',height:'auto',minHeight:44,whiteSpace:'normal',overflowWrap:'anywhere'}} disabled={!ready||saved===null} onClick={()=>{setSaved(null);setStatus('Local saved snapshot cleared; the editable note is retained.');}}>Clear local saved snapshot</Button>
  </div>;
}
