'use client';

import {useId,useState, type CSSProperties} from 'react';
import {Button} from '@mobtranslate/ui';
import catalogue from '../content/tokens.json';
import './shape-explorer.css';

const radii=catalogue.tokens.filter(token=>token.name.startsWith('--radius-'));
const corners=['borderStartStartRadius','borderStartEndRadius','borderEndStartRadius','borderEndEndRadius'] as const;
const initial=Object.fromEntries(corners.map(corner=>[corner,'--radius-lg']));

export function ShapeLab(){
  const id=useId();
  const [radius,setRadius]=useState('--radius-lg');
  const [alternate,setAlternate]=useState('--radius-2xl');
  const [individual,setIndividual]=useState(false);
  const [values,setValues]=useState(initial);
  const [rtl,setRtl]=useState(false);
  const [applied,setApplied]=useState(false);
  const [outer,setOuter]=useState(48);
  const [padding,setPadding]=useState(14);
  const inner=Math.max(0,outer-padding);
  const style=Object.fromEntries(corners.map(corner=>[corner,`var(${applied?alternate:individual?values[corner]:radius})`])) as CSSProperties;
  const options=radii.map(token=><option key={token.name} value={token.name}>{token.name} · {token.value}</option>);
  return <div className="shape-lab" data-shape-lab>
    <label>Container radius<select data-shape-radius className="mt-input" value={radius} onChange={event=>setRadius(event.target.value)}>{options}</select></label>
    <label className="shape-check"><input data-shape-individual type="checkbox" checked={individual} onChange={event=>setIndividual(event.target.checked)} />Set individual logical corners</label>
    {individual&&<fieldset><legend>Base logical corner tokens</legend><div className="shape-corners">{corners.map(corner=><label key={corner}>{corner}<select data-shape-corner={corner} className="mt-input" value={values[corner]} onChange={event=>setValues(previous=>({...previous,[corner]:event.target.value}))}>{options}</select></label>)}</div></fieldset>}
    <label className="shape-check"><input data-shape-rtl type="checkbox" checked={rtl} onChange={event=>setRtl(event.target.checked)} />Right-to-left corner mapping</label>
    <label>Alternate corner token<select data-shape-alternate className="mt-input" value={alternate} onChange={event=>setAlternate(event.target.value)}>{options}</select></label>
    <Button data-shape-toggle type="button" aria-pressed={applied} onClick={()=>setApplied(previous=>!previous)}>Toggle corner treatment</Button>
    <p role="status">{applied?'Alternate corners applied.':'Base corners applied.'} This is presentation state, not source review or an external action.</p>
    <div data-shape-surface dir={rtl?'rtl':'ltr'} style={style}>
      <h3 dir="auto">Source details</h3><p dir="auto">The container changes its corners. Content remains in the DOM; the disclosure retains its native semantics.</p>
      <details><summary>View source example</summary><p dir="auto">Original English interface specimen. A real entry would carry its own source and review records.</p></details>
    </div>
    <p>Changes use the current duration/easing tokens. Reduced motion removes the transition. Radius does not define a hit area, focus behavior or meaning; large corners can require more padding than this deliberately adjustable specimen.</p>
    <details data-shape-css><summary>Current corner CSS</summary><pre><code>{Object.entries(style).map(([name,value])=>`${name.replace(/[A-Z]/g,letter=>`-${letter.toLowerCase()}`)}: ${value};`).join('\n')}</code></pre></details>
    <fieldset><legend>Optical nesting and corner-area model</legend>
      <label>Outer radius · {outer} model units<input data-shape-outer-input type="range" min="0" max="64" value={outer} onChange={event=>setOuter(Number(event.target.value))} /></label>
      <label>Inset · {padding} model units<input data-shape-padding-input type="range" min="0" max="32" value={padding} onChange={event=>setPadding(Number(event.target.value))} /></label>
      <svg viewBox="0 0 200 200" role="img" aria-labelledby={`${id}-geometry-title ${id}-geometry-desc`}>
        <title id={`${id}-geometry-title`}>Rounded nesting and cut-corner comparison</title><desc id={`${id}-geometry-desc`}>Solid outer and inner rounded rectangles, dashed outer cut corners. Outer magnitude {outer}, inset {padding}, inner radius {inner}, in model units. Stroke centerlines are compared, not CSS border boxes.</desc>
        <rect data-shape-outer x="8" y="8" width="184" height="184" rx={outer} fill="none" stroke="currentColor" strokeWidth="2" />
        <path data-shape-cut d={`M ${8+outer} 8 H ${192-outer} L 192 ${8+outer} V ${192-outer} L ${192-outer} 192 H ${8+outer} L 8 ${192-outer} V ${8+outer} Z`} fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="4 3" />
        <rect data-shape-inner x={8+padding} y={8+padding} width={184-2*padding} height={184-2*padding} rx={inner} fill="none" stroke="var(--color-primary)" strokeWidth="2" />
      </svg>
      <p data-shape-optical>Inner radius = max(0, {outer} − {padding}) = {inner}. {padding>outer?'Inset exceeds the radius; the inner corner is square.':'The circular corners share their center when the inner radius is positive.'}</p>
      <p data-shape-area>At the same corner magnitude {outer}, four cut corners remove {(2*outer*outer).toFixed(2)} square model units; four circular rounded corners remove {((4-Math.PI)*outer*outer).toFixed(2)}. Both start from a square with non-overlapping corner regions. This compares removed area, not usable text padding.</p>
      <p>The drawing scales to available width. These are model coordinates, not device dp or guaranteed rendered CSS pixels. Browser normalization of oversized/full radii and real border thickness need separate inspection.</p>
    </fieldset>
  </div>;
}
