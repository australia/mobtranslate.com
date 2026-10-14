'use client';
import {useId,useState} from 'react';
import './iconography-explorer.css';

export function IconographyExplorer(){
  const id=useId();
  const [size,setSize]=useState('24');
  const [stroke,setStroke]=useState('2');
  const [cap,setCap]=useState<'round'|'butt'>('round');
  const [keyline,setKeyline]=useState('square');
  const [saved,setSaved]=useState(false);
  const [rtl,setRtl]=useState(false);
  const [status,setStatus]=useState('');
  return <div className="icon-lab" data-icon-lab>
    <label>Icon size<select data-icon-size className="mt-input" value={size} onChange={event=>setSize(event.target.value)}>{[16,20,24,32,40,48].map(value=><option key={value} value={value}>{value}px</option>)}</select></label>
    <label>SVG stroke in viewBox units<select data-icon-stroke className="mt-input" value={stroke} onChange={event=>setStroke(event.target.value)}>{[1.5,2,3].map(value=><option key={value}>{value}</option>)}</select></label>
    <label>SVG stroke terminals<select data-icon-cap className="mt-input" value={cap} onChange={event=>setCap(event.target.value as typeof cap)}><option value="round">Round</option><option value="butt">Square-ended (butt)</option></select></label>
    <label className="icon-check"><input data-icon-rtl type="checkbox" checked={rtl} onChange={event=>setRtl(event.target.checked)} />Right-to-left navigation</label>
    <div data-icon-preview dir={rtl?'rtl':'ltr'}>
      <button data-icon-save type="button" aria-label="Save entry" aria-pressed={saved} onClick={()=>{setSaved(previous=>!previous);setStatus(saved?'Example entry removed from saved items.':'Example entry saved.');}}>
        <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false" fill={saved?'currentColor':'none'} stroke="currentColor" strokeWidth={stroke} strokeLinecap={cap} strokeLinejoin="round"><path d="M6 4h12v16l-6-4-6 4z" /></svg>
      </button>
      <span className="icon-direction"><svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap={cap} strokeLinejoin="round"><path data-icon-arrow d="M5 12h14m-6-6 6 6-6 6" transform={rtl?'translate(24 0) scale(-1 1)':undefined} /></svg><span dir="auto">Next page (direction specimen)</span></span>
    </div>
    <p role="status">{status}</p><p>Save entry changes local example state. The arrow is a decorative direction specimen beside text, not a navigation control. Geometric stroke scales to {(Number(size)*Number(stroke)/24).toFixed(2)} CSS pixels before rasterization; this is not optical-size or font-grade adjustment.</p>
    <label>Reference keyline<select data-icon-keyline className="mt-input" value={keyline} onChange={event=>setKeyline(event.target.value)}><option value="square">18 × 18 square</option><option value="circle">20 diameter circle</option><option value="vertical">16 × 20 vertical rectangle</option><option value="horizontal">20 × 16 horizontal rectangle</option></select></label>
    <svg data-icon-grid viewBox="0 0 24 24" role="img" aria-labelledby={`${id}-title ${id}-desc`}>
      <title id={`${id}-title`}>Icon construction grid</title><desc id={`${id}-desc`}>24-unit trim box, 20-unit live area with 2-unit inset. Selected keyline: {keyline}. Original bookmark overlaid for comparison, using stroke {stroke} and {cap} terminals. Coordinates are model units, not device dp.</desc>
      <g stroke="var(--color-border)" strokeWidth="0.06" aria-hidden="true">{Array.from({length:25},(_,i)=><g key={i}><path d={`M ${i} 0 V 24`} /><path d={`M 0 ${i} H 24`} /></g>)}</g>
      <rect x=".1" y=".1" width="23.8" height="23.8" fill="none" stroke="currentColor" strokeWidth=".2" />
      <rect x="2" y="2" width="20" height="20" fill="none" stroke="currentColor" strokeWidth=".2" strokeDasharray=".6 .4" />
      <g data-icon-keyline-shape fill="none" stroke="var(--color-primary)" strokeWidth=".25">
        {keyline==='circle'?<circle cx="12" cy="12" r="10" />:<rect x={keyline==='vertical'?4:keyline==='horizontal'?2:3} y={keyline==='vertical'?2:keyline==='horizontal'?4:3} width={keyline==='vertical'?16:keyline==='horizontal'?20:18} height={keyline==='vertical'?20:keyline==='horizontal'?16:18} />}
      </g>
      <path data-icon-grid-mark d="M6 4h12v16l-6-4-6 4z" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap={cap} strokeLinejoin="round" />
    </svg>
    <p data-icon-geometry>Trim 24 × 24; live area 20 × 20; inset 2 on each side. Keyline {keyline}. The drawing scales to the page; guides are construction references, not a claim of pixel-perfect rendering or recognizability.</p>
  </div>;
}
