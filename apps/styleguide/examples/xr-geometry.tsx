'use client';
import {useEffect,useId,useRef,useState} from 'react';
import {Button} from '@mobtranslate/ui';
import {CodeBlock} from '../components/code-block';
import {geometryFields,initialGeometry,resolveGeometry,type XRGeometry} from '../lib/xr-geometry';

type Mode='immersive-vr'|'immersive-ar';
type SupportAPI={isSessionSupported(mode:Mode):Promise<boolean>};
export function XRGeometryExample() {
  const [ready,setReady]=useState(false);
  const [draft,setDraft]=useState({...initialGeometry});
  const [proposal,setProposal]=useState<XRGeometry|null>(null);
  const [mode,setMode]=useState<Mode>('immersive-vr');
  const [probe,setProbe]=useState('Not checked for immersive-vr.');
  const [busy,setBusy]=useState(false);
  const epoch=useRef(0),pending=useRef<number|null>(null);
  const id=useId();
  const {errors,geometry}=resolveGeometry(draft);
  useEffect(()=>setReady(true),[]);
  useEffect(()=>{epoch.current++;pending.current=null;setBusy(false);setProbe(`Not checked for ${mode}.`);return ()=>{epoch.current++;pending.current=null;};},[mode]);
  async function checkSupport() {
    if(pending.current!==null)return;
    const request=++epoch.current;pending.current=request;setBusy(true);setProbe(`Checking ${mode} support…`);
    try {
      const xr=(navigator as Navigator&{xr?:SupportAPI}).xr;
      let outcome;
      if(!window.isSecureContext)outcome='A secure context is required for WebXR. The HTML geometry tool remains available.';
      else if(!xr)outcome='WebXR is not exposed by this browser. The HTML geometry tool remains available.';
      else outcome=await xr.isSessionSupported(mode)?`Support reported for ${mode}. No session started; tracking, input, rendering and comfort are not verified.`:`No support reported for ${mode}. The HTML geometry tool remains available.`;
      if(epoch.current===request)setProbe(outcome);
    } catch {if(epoch.current===request)setProbe(`Could not check ${mode}. Retry after checking browser, device and permissions-policy availability.`);}
    finally {if(epoch.current===request){pending.current=null;setBusy(false);}}
  }
  const scale=geometry?Math.min(250/(geometry.width/2),240/geometry.distance):0;
  const half=geometry?geometry.width/2*scale:0;
  const panelY=geometry?270-geometry.distance*scale:0;
  return <div data-xr-ready={ready} className="space-y-5">
    <p>Frontal rectangular panel; point observer centered on its normal. These are physical metres and geometric angles. The drawing is a normalized top view, not a calibrated headset image. Height is reported numerically and is not drawn in this top view.</p>
    <div className="grid gap-4 sm:grid-cols-2">{geometryFields.map(field=><div key={field.key}>
      <label htmlFor={`xr-${field.key}`} className="block mb-2">{field.label} ({field.unit})</label>
      <input id={`xr-${field.key}`} type="number" step="any" min={field.min} max={field.max} className="mt-input w-full" disabled={!ready} value={draft[field.key]} onChange={event=>setDraft(current=>({...current,[field.key]:event.target.value}))} aria-invalid={Boolean(errors[field.key])} aria-describedby={`xr-${field.key}-help${errors[field.key]?` xr-${field.key}-error`:''}`} />
      <p id={`xr-${field.key}-help`} className="mt-2 text-sm">Tool range {field.min}–{field.max} {field.unit}; this range is not a comfort recommendation.</p>
      {errors[field.key]&&<p id={`xr-${field.key}-error`} className="mt-2">{errors[field.key]}</p>}
    </div>)}</div>
    <p role="status" data-xr-validity>{geometry?'Geometry available. Angles update from the entered physical dimensions.':'Geometry unavailable. Correct the marked values; an existing captured proposal is retained.'}</p>
    {geometry&&<div data-xr-results>
      <dl className="grid gap-4 sm:grid-cols-2">
        <div><dt>Horizontal angular size</dt><dd data-xr-horizontal className="font-mono">{geometry.horizontalDegrees.toFixed(3)}°</dd></div>
        <div><dt>Vertical angular size</dt><dd data-xr-vertical className="font-mono">{geometry.verticalDegrees.toFixed(3)}°</dd></div>
        <div><dt>Target angular size</dt><dd data-xr-target className="font-mono">{geometry.targetDegrees.toFixed(3)}°</dd></div>
        <div><dt>Panel width / height</dt><dd data-xr-aspect className="font-mono">{geometry.aspect.toFixed(3)}</dd></div>
      </dl>
      <svg className="w-full mt-4" style={{background:'var(--color-card)',border:'1px solid var(--color-muted-foreground)',borderRadius:'var(--radius-md)'}} viewBox="0 0 600 300" role="img" aria-labelledby={`${id}-title ${id}-description`}>
        <title id={`${id}-title`}>Top-view panel geometry</title>
        <desc id={`${id}-description`}>A point observer faces the center of a panel. Two rays reach the panel edges. The angle between them is {geometry.horizontalDegrees.toFixed(3)} degrees. The diagram rescales to fit; its screen pixels are not physical metres.</desc>
        <line x1="300" y1="270" x2="300" y2={panelY} stroke="var(--color-muted-foreground)" strokeWidth="2" strokeDasharray="5 5" />
        <path d={`M${300-half} ${panelY} L300 270 L${300+half} ${panelY}`} stroke="var(--color-primary)" strokeWidth="3" fill="none" />
        <line x1={300-half} y1={panelY} x2={300+half} y2={panelY} stroke="var(--color-foreground)" strokeWidth="8" />
        <circle cx="300" cy="270" r="7" fill="var(--color-foreground)" />
      </svg>
      <p className="mt-2">Solid segment: panel width. Point: observer. Dashed segment: viewing distance. Rays: panel-edge sight lines.</p>
    </div>}
    <div className="flex flex-wrap gap-3">
      <Button data-xr-capture type="button" disabled={!ready||!geometry} onClick={()=>{if(geometry)setProposal({...geometry});}}>Capture geometry proposal</Button>
      <Button type="button" variant="outline" disabled={!ready} onClick={()=>setDraft({...initialGeometry})}>Reset geometry inputs</Button>
    </div>
    {proposal&&<div data-xr-proposal><p className="font-semibold">Local geometry proposal</p><p>This frozen copy remains unchanged while you edit. It is not applied to a device, saved remotely or a comfort approval.</p><CodeBlock language="json" code={JSON.stringify({units:'metres',assumption:'Frontal panel centered on a point observer',...proposal},null,2)} /></div>}
    <div className="border-t border-[var(--color-border)] pt-5 space-y-3">
      <label htmlFor="xr-mode" className="block">WebXR mode to check</label>
      <select id="xr-mode" className="mt-input w-full" disabled={!ready} value={mode} onChange={event=>setMode(event.target.value as Mode)}><option value="immersive-vr">Immersive VR</option><option value="immersive-ar">Immersive AR</option></select>
      <Button type="button" disabled={!ready||busy} loading={busy} onClick={()=>void checkSupport()}>Check browser support</Button>
      <p role="status" data-xr-support>{probe}</p>
      <p>The check calls isSessionSupported only after activation. It does not request an immersive session, read poses or start camera, audio or sensor capture. Changing the selected mode invalidates a pending result.</p>
    </div>
  </div>;
}
