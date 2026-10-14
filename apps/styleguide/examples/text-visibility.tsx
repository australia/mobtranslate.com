'use client';

import {useEffect, useId, useRef, useState} from 'react';
import './text-visibility.css';

export function TextVisibilityExample(){
  const id=useId();
  const [text,setText]=useState('Local field notes for the reading and source comparison session');
  const [mode,setMode]=useState('wrap');
  const [width,setWidth]=useState('240');
  const [scale,setScale]=useState('100');
  const [expanded,setExpanded]=useState(false);
  const [measurement,setMeasurement]=useState({width:0,font:'Not measured',clipped:false});
  const preview=useRef<HTMLParagraphElement>(null);
  useEffect(()=>{
    const node=preview.current;if(!node)return;
    const measure=()=>{
      const next={width:node.clientWidth,font:getComputedStyle(node).fontSize,clipped:mode==='ellipsis'&&!expanded&&node.scrollWidth>node.clientWidth};
      setMeasurement(previous=>JSON.stringify(previous)===JSON.stringify(next)?previous:next);
    };
    measure();const resize=new ResizeObserver(measure);resize.observe(node);
    const root=new MutationObserver(measure);root.observe(document.documentElement,{attributes:true,attributeFilter:['style','class']});
    return()=>{resize.disconnect();root.disconnect();};
  },[text,mode,width,scale,expanded]);
  return <div data-text-visibility-lab className="text-visibility-lab">
    <p>Original English interface fixture. Change its presentation without deleting the retained text.</p>
    <label htmlFor={`${id}-text`}>Preview text</label>
    <textarea id={`${id}-text`} data-text-content dir="auto" className="mt-textarea mt-textarea-resize-vertical" rows={3} value={text} onChange={event=>setText(event.target.value)} />
    <div className="text-visibility-controls">
      <label>Presentation<select data-text-mode className="mt-input" value={mode} onChange={event=>{setMode(event.target.value);setExpanded(false);}}><option value="wrap">Wrap all text</option><option value="ellipsis">Ellipsis</option></select></label>
      <label>Maximum preview width<select data-text-width className="mt-input" value={width} onChange={event=>setWidth(event.target.value)}>{[160,240,360,480].map(value=><option key={value} value={value}>{value} CSS px</option>)}</select></label>
      <label>Specimen text size<select data-text-scale className="mt-input" value={scale} onChange={event=>setScale(event.target.value)}>{[100,150,200].map(value=><option key={value} value={value}>{value}%</option>)}</select></label>
    </div>
    {mode==='ellipsis'&&<button type="button" data-text-expand className="mt-btn mt-btn-outline mt-btn-md" aria-controls={`${id}-preview`} aria-expanded={expanded} onClick={()=>setExpanded(value=>!value)}>{expanded?'Collapse full text':'Show full text'}</button>}
    <p id={`${id}-preview`} ref={preview} data-text-preview dir="auto" data-clipped={mode==='ellipsis'&&!expanded?true:undefined} style={{inlineSize:`min(100%, ${width}px)`,fontSize:`${scale}%`}}>{text||'No preview text entered.'}</p>
    <p data-text-measurement>Rendered content width: {measurement.width} CSS px. Text: {measurement.font}. {measurement.clipped?'The one-line view clips visually; use Show full text.':'The current view does not clip text.'}</p>
    <p>The complete string stays in this paragraph’s DOM text; CSS ellipsis changes its visual presentation. The button exposes the same text in a wrapping view for pointer, touch and keyboard users. Actual speech, braille and voice-control behavior still need a named browser/assistive-technology check.</p>
    <p>Text size affects this specimen, not a saved application preference. Root font changes and browser zoom are different mechanisms. The width is bounded by its actual container; wrapping grows vertically.</p>
  </div>;
}
