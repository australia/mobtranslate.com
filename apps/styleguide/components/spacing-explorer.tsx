'use client';

import {useEffect, useRef, useState} from 'react';
import type {CSSProperties} from 'react';
import catalogue from '../content/tokens.json';
import './spacing-explorer.css';

const tokens=catalogue.tokens.filter(token=>token.name.startsWith('--spacing-')).sort((a,b)=>parseFloat(a.value)-parseFloat(b.value));

export function SpacingExplorer(){
  const [gap,setGap]=useState('--spacing-4');
  const [leading,setLeading]=useState('--spacing-4');
  const [trailing,setTrailing]=useState('--spacing-4');
  const [margin,setMargin]=useState('--spacing-2');
  const [compact,setCompact]=useState(false);
  const [rtl,setRtl]=useState(false);
  const [scale,setScale]=useState('100');
  const [long,setLong]=useState(false);
  const [selected,setSelected]=useState(false);
  const [measured,setMeasured]=useState<Record<string,string>>({});
  const preview=useRef<HTMLDivElement>(null);
  const block=compact?'--spacing-2':'--spacing-4';
  useEffect(()=>{
    const element=preview.current;
    if(!element)return;
    const update=()=>{
      const styles=getComputedStyle(element);
      const button=element.querySelector('button');
      const rect=button?.getBoundingClientRect();
      const next={gap:styles.gap,leading:styles.paddingInlineStart,trailing:styles.paddingInlineEnd,block:styles.paddingBlockStart,margin:styles.marginInlineStart,font:styles.fontSize,target:rect?`${rect.width.toFixed(1)} × ${rect.height.toFixed(1)} CSS px`:'Not measured'};
      setMeasured(previous=>JSON.stringify(previous)===JSON.stringify(next)?previous:next);
    };
    update();
    const observer=new ResizeObserver(update);observer.observe(element);
    element.querySelectorAll('button').forEach(button=>observer.observe(button));
    const root=new MutationObserver(update);root.observe(document.documentElement,{attributes:true,attributeFilter:['class','style']});
    return()=>{observer.disconnect();root.disconnect();};
  },[gap,leading,trailing,margin,compact,rtl,scale,long]);
  const select=(label:string,value:string,set:(value:string)=>void,name:string)=><label>{label}<select className="mt-input" data-spacing-control={name} value={value} onChange={event=>set(event.target.value)}>{tokens.map(token=><option key={token.name} value={token.name}>{token.name} · {token.value}</option>)}</select></label>;
  const style={'--demo-gap':`var(${gap})`,'--demo-leading':`var(${leading})`,'--demo-trailing':`var(${trailing})`,'--demo-block':`var(${block})`,'--demo-margin':`var(${margin})`,fontSize:`${scale}%`} as CSSProperties;
  return <div className="spacing-lab" data-spacing-lab>
    <div className="spacing-controls">
      {select('Spacing token · sibling gap',gap,setGap,'gap')}
      {select('Leading padding',leading,setLeading,'leading')}
      {select('Trailing padding',trailing,setTrailing,'trailing')}
      {select('Page margin · both inline edges',margin,setMargin,'margin')}
      <label>Specimen text size<select className="mt-input" data-spacing-scale value={scale} onChange={event=>setScale(event.target.value)}><option value="100">100%</option><option value="150">150%</option><option value="200">200%</option></select></label>
    </div>
    <label className="spacing-check"><input data-spacing-density type="checkbox" checked={compact} onChange={event=>setCompact(event.target.checked)} />Compact vertical padding · action targets retain a 44 CSS px minimum</label>
    <label className="spacing-check"><input data-spacing-rtl type="checkbox" checked={rtl} onChange={event=>setRtl(event.target.checked)} />Right-to-left specimen layout</label>
    <label className="spacing-check"><input data-spacing-long type="checkbox" checked={long} onChange={event=>setLong(event.target.checked)} />Long action labels</label>
    <div className="spacing-page-boundary" role="region" aria-label="Scrollable spacing specimen" tabIndex={0}><div data-spacing-preview ref={preview} dir={rtl?'rtl':'ltr'} style={style}>
      <button data-spacing-action type="button" aria-pressed={selected} onClick={()=>setSelected(value=>!value)}><span dir="auto">{long?'Select this source record for a later comparison':'Select source record'}</span></button>
      <button type="button" onClick={()=>setSelected(false)}><span dir="auto">{long?'Clear the current local comparison selection':'Clear selection'}</span></button>
    </div></div>
    <p role="status">{selected?'Source record selected locally.':'No source record selected.'} No data is submitted.</p>
    <dl data-spacing-measured>{Object.entries(measured).map(([name,value])=><div key={name}><dt>{name}</dt><dd>{value}</dd></div>)}</dl>
    <p>Dashed outline: page boundary. Solid outline: component. The page boundary includes 4 CSS px of focus clearance. Oversized combinations can be scrolled within this labelled region. The unfilled distance outside the component is margin; internal edge space is padding; sibling space is gap. Wrapping preserves the selected gap. Leading and trailing swap physical sides with direction.</p>
    <details><summary>Current spacing mappings and scale boundary</summary><pre><code>{`gap: var(${gap});\npadding-inline-start: var(${leading});\npadding-inline-end: var(${trailing});\npadding-block: var(${block});\nmargin-inline: var(${margin});\nfont-size: ${scale}%;`}</code></pre><p>The specimen text-size selector changes text independently of rem-based spacing. Changing the document root font size scales this library’s rem tokens too; this is different from fixed native dp spacing. The readout measures this rendered specimen, not every consuming component.</p></details>
  </div>;
}
