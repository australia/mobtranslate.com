'use client';
import {useEffect,useId,useRef,useState} from 'react';
import {Button} from '@mobtranslate/ui';
import {CodeBlock} from '../components/code-block';
import {initialSpring,sampleSpring,springCharacteristics,springResponse,validateSpring,type SpringParameters} from '../lib/spring-response';
import './spring-response.css';

const fields=[
  {key:'mass',label:'Mass',min:.1,max:10,step:.1},
  {key:'stiffness',label:'Stiffness',min:1,max:1000,step:1},
  {key:'damping',label:'Damping',min:0,max:100,step:1},
  {key:'initialVelocity',label:'Initial velocity',min:-5,max:5,step:.1},
  {key:'duration',label:'Preview seconds',min:.1,max:8,step:.1},
] as const;
const makeModel=(parameters:SpringParameters)=>{
  const samples=sampleSpring(parameters);
  const minimum=Math.min(0,...samples.map(sample=>sample.position)),maximum=Math.max(1,...samples.map(sample=>sample.position));
  const padding=(maximum-minimum)*.1;
  return {parameters:{...parameters},samples,minimum:minimum-padding,maximum:maximum+padding,characteristics:springCharacteristics(parameters)};
};

export function SpringResponseExample(){
  const id=useId();
  const [editor,setEditor]=useState<Record<keyof SpringParameters,string>>({mass:'1',stiffness:'100',damping:'20',initialVelocity:'0',duration:'4'});
  const [model,setModel]=useState(()=>makeModel(initialSpring));
  const [ready,setReady]=useState(false),[running,setRunning]=useState(false),[reduced,setReduced]=useState(false),[status,setStatus]=useState('Initial captured model. Change settings and run to capture another response.');
  const frame=useRef<number|null>(null),epoch=useRef(0),reducedPreference=useRef(false);
  const currentModel=useRef(model),playing=useRef(false);
  const cursor=useRef<SVGLineElement>(null),readout=useRef<HTMLSpanElement>(null);
  const parameters=Object.fromEntries(fields.map(field=>[field.key,editor[field.key].trim()===''?NaN:Number(editor[field.key])])) as unknown as SpringParameters;
  const errors=validateSpring(parameters);
  const valid=errors.length===0;
  const stopFrame=()=>{epoch.current++;if(frame.current!==null)cancelAnimationFrame(frame.current);frame.current=null;playing.current=false;setRunning(false);};
  const showTime=(captured:ReturnType<typeof makeModel>,time:number)=>{
    const point=springResponse(captured.parameters,time);
    const x=10+980*time/captured.parameters.duration;
    cursor.current?.setAttribute('x1',String(x));cursor.current?.setAttribute('x2',String(x));
    if(readout.current)readout.current.textContent=`t=${point.time.toFixed(3)} s; x=${point.position.toFixed(4)}; velocity=${point.velocity.toFixed(4)} model units/s`;
  };
  useEffect(()=>{
    const query=matchMedia('(prefers-reduced-motion: reduce)');
    const update=()=>{
      reducedPreference.current=query.matches;setReduced(query.matches);
      if(query.matches&&playing.current){epoch.current++;if(frame.current!==null)cancelAnimationFrame(frame.current);frame.current=null;playing.current=false;setRunning(false);
        const captured=currentModel.current,time=captured.parameters.duration,point=springResponse(captured.parameters,time),x=990;
        cursor.current?.setAttribute('x1',String(x));cursor.current?.setAttribute('x2',String(x));
        if(readout.current)readout.current.textContent=`t=${time.toFixed(3)} s; x=${point.position.toFixed(4)}; velocity=${point.velocity.toFixed(4)} model units/s`;
        setStatus('Reduced motion is now enabled. Showing the captured endpoint without moving the cursor.');
      }
    };
    update();setReady(true);query.addEventListener('change',update);
    return()=>{epoch.current++;if(frame.current!==null)cancelAnimationFrame(frame.current);query.removeEventListener('change',update);};
  },[]);
  const run=()=>{
    if(!valid)return;stopFrame();const captured=makeModel(parameters);currentModel.current=captured;setModel(captured);showTime(captured,0);
    if(reducedPreference.current){showTime(captured,captured.parameters.duration);setStatus('Reduced motion: captured the response and displayed its endpoint without cursor animation.');return;}
    const token=epoch.current,started=performance.now();playing.current=true;setRunning(true);setStatus('Captured response playback started. The time horizon is not a settling guarantee.');
    const advance=(now:number)=>{
      if(token!==epoch.current)return;
      const time=Math.min(captured.parameters.duration,Math.max(0,(now-started)/1000));showTime(captured,time);
      if(time>=captured.parameters.duration){frame.current=null;playing.current=false;setRunning(false);setStatus('Captured response reached its preview horizon. Inspect the endpoint and residual velocity; playback completion is not convergence.');}
      else frame.current=requestAnimationFrame(advance);
    };frame.current=requestAnimationFrame(advance);
  };
  const y=(position:number)=>110-100*(position-model.minimum)/(model.maximum-model.minimum);
  const path=model.samples.map((point,index)=>`${index?'L':'M'}${(10+980*point.time/model.parameters.duration).toFixed(3)},${y(point.position).toFixed(3)}`).join(' ');
  const endpoint=model.samples[model.samples.length-1];
  const rows=[0,.25,.5,.75,1].map(fraction=>springResponse(model.parameters,model.parameters.duration*fraction));
  return <div className="space-y-4" data-spring-ready={ready}>
    <p>This dimensionless unit-step model moves from x=0 toward x=1. Its parameters are model units, not Android spring tokens or a physical device calibration.</p>
    <fieldset className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><legend className="font-semibold mb-3">Draft model parameters</legend>{fields.map(field=><label key={field.key} htmlFor={`${id}-${field.key}`}>{field.label}<input id={`${id}-${field.key}`} data-spring-field={field.key} type="number" min={field.min} max={field.max} step="any" className="mt-input mt-2 w-full" value={editor[field.key]} disabled={!ready} aria-invalid={!Number.isFinite(parameters[field.key])||parameters[field.key]<field.min||parameters[field.key]>field.max} aria-describedby={`${id}-help ${id}-errors`} onChange={event=>setEditor(current=>({...current,[field.key]:event.target.value}))} /></label>)}</fieldset>
    <p id={`${id}-help`}>Mass 0.1–10; stiffness 1–1000; damping 0–100; initial velocity −5–5; preview 0.1–8 seconds. Draft changes do not rewrite the captured curve. An empty field is invalid.</p>
    <p id={`${id}-errors`} data-spring-errors>{errors.length?errors.join(' '):'Draft parameters are within the model bounds.'}</p>
    <div className="spring-response-actions flex flex-wrap gap-3"><Button type="button" data-spring-run disabled={!ready||!valid} onClick={run}>Capture and play response</Button><Button type="button" variant="outline" data-spring-stop disabled={!ready} onClick={()=>{stopFrame();setStatus('Playback stopped. The captured response and current time remain available.');}}>Stop playback</Button><Button type="button" variant="outline" data-spring-reset disabled={!ready} onClick={()=>{stopFrame();showTime(currentModel.current,0);setStatus('Cursor reset to the captured response’s start. Draft parameters are unchanged.');}}>Reset cursor</Button></div>
    <p data-spring-preference>{reduced?'Reduced motion enabled: no animated cursor.':'Reduced motion not requested: cursor playback available.'}</p>
    <div className="border border-[var(--color-muted-foreground)] rounded-md p-3" data-spring-plot>
      <svg viewBox="0 0 1000 120" preserveAspectRatio="none" className="w-full h-44" aria-hidden="true" focusable="false">
        <line x1="10" x2="990" y1={y(1)} y2={y(1)} stroke="var(--color-muted-foreground)" strokeDasharray="5 5" vectorEffect="non-scaling-stroke" />
        <path d={path} fill="none" stroke="var(--color-foreground)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        <line ref={cursor} x1="10" x2="10" y1="0" y2="120" stroke="var(--color-foreground)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
      <p>Response over {model.parameters.duration} {model.parameters.duration===1?'second':'seconds'}; dashed line is target x=1. The vertical scale adapts to the captured samples. Equivalent values are below.</p>
    </div>
    <p data-spring-live aria-live="off"><span ref={readout}>t=0.000 s; x=0.0000; velocity=0.0000 model units/s</span></p>
    <dl className="grid gap-3 sm:grid-cols-2" data-spring-captured>{fields.map(field=><div key={field.key}><dt>Captured {field.label.toLowerCase()}</dt><dd data-spring-parameter={field.key}>{model.parameters[field.key]}</dd></div>)}<div><dt>Captured regime</dt><dd data-spring-regime>{model.characteristics.regime}</dd></div><div><dt>Damping ratio</dt><dd>{model.characteristics.dampingRatio.toFixed(4)}</dd></div><div><dt>Natural angular frequency</dt><dd>{model.characteristics.naturalFrequency.toFixed(4)} rad/s</dd></div><div><dt>Endpoint and velocity</dt><dd data-spring-endpoint>x={endpoint.position.toFixed(4)}; v={endpoint.velocity.toFixed(4)}</dd></div></dl>
    <p>{model.parameters.damping===0?'Zero damping retains oscillation in this ideal model. A bounded playback does not make it settle.':'Positive damping approaches the target, but this chosen horizon may end while displacement or velocity remains.'}</p>
    <div className="doc-table" role="region" tabIndex={0} aria-label="Captured spring response samples"><table><thead><tr><th scope="col">Seconds</th><th scope="col">Position</th><th scope="col">Velocity</th></tr></thead><tbody>{rows.map(point=><tr key={point.time}><th scope="row">{point.time.toFixed(3)}</th><td>{point.position.toFixed(6)}</td><td>{point.velocity.toFixed(6)}</td></tr>)}</tbody></table></div>
    <details data-spring-full><summary className="min-h-11 cursor-pointer">Full captured parameters and {model.samples.length} samples</summary><CodeBlock language="json" code={JSON.stringify({parameters:model.parameters,samples:model.samples},null,2)} /></details>
    <p role="status" data-spring-status>{status}</p>
    <p className="text-sm">{running?'Playback active.':'Playback inactive.'} The curve is sampled at up to 60 intervals per second; the cursor evaluates the captured analytic response at elapsed browser time. This plot does not animate a production component, preserve retargeted velocity or measure frame-rate performance.</p>
  </div>;
}
