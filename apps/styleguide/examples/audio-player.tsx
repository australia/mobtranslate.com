'use client';
import {useEffect,useRef,useState,type CSSProperties} from 'react';
import {Button,Checkbox,Slider,Textarea,DirectionProvider} from '@mobtranslate/ui';
import manifest from '../public/fixtures/ui-tone.json';
const action:CSSProperties={minHeight:44,height:'auto',minWidth:0,maxWidth:'100%',whiteSpace:'normal',overflowWrap:'anywhere'};
export function AudioPlayerExample(){
  const [missing,setMissing]=useState(false),[retry,setRetry]=useState(0),[muted,setMuted]=useState(true),[volume,setVolume]=useState(.25),[rate,setRate]=useState(1),[time,setTime]=useState(0),[duration,setDuration]=useState(0),[phase,setPhase]=useState('loading'),[error,setError]=useState(''),[note,setNote]=useState('English-only retained playback note.'),[rtl,setRtl]=useState(false);
  const audio=useRef<HTMLAudioElement>(null);
  const key=`${missing?'missing':'signal'}-${retry}`;
  useEffect(()=>{const node=audio.current;if(!node)return;node.volume=volume;node.playbackRate=rate;},[key,volume,rate]);
  useEffect(()=>{const node=audio.current;if(node){if(node.error){setPhase('failed');setError(`Local media unavailable (native code ${node.error.code}). Correct the source and retry; no pronunciation is inferred.`);}else if(Number.isFinite(node.duration)&&node.readyState>=1){setDuration(node.duration);setTime(node.currentTime);setPhase(node.ended?'ended':node.paused?(node.currentTime>0?'paused':'ready'):'playing');}}return()=>{node?.pause();node?.removeAttribute('src');node?.load();};},[key]);
  async function play(){const node=audio.current;if(!node)return;try{await node.play();if(audio.current===node)setError('');}catch(failure){if(audio.current!==node)return;setPhase('failed');setError(`Native playback rejected: ${failure instanceof Error?failure.name:'unknown error'}. The note remains; correct the source and try again.`);}}
  function source(next:boolean){audio.current?.pause();setMissing(next);setRetry(value=>value+1);setTime(0);setDuration(0);setPhase('loading');setError('');}
  function seek(value:number|readonly number[]){const next=typeof value==='number'?value:value[0],node=audio.current;if(node&&Number.isFinite(next)&&Number.isFinite(node.duration)){node.currentTime=Math.min(node.duration,Math.max(0,next));}}
  return <DirectionProvider direction={rtl?'rtl':'ltr'}><div data-audio-lab lang="en" dir={rtl?'rtl':'ltr'} className="space-y-4" style={{overflowWrap:'anywhere'}}>
    <p dir="auto">Project-authored {manifest.durationSeconds}-second {manifest.frequencyHz}Hz test signal, not speech, pronunciation or a cultural asset. Playback starts only after a command. Muted by default; unmute only if you want to listen.</p>
    <audio ref={audio} key={key} id="local-test-audio" controls preload="metadata" muted={muted} src={missing?'/fixtures/ui-tone-missing.wav':manifest.source} aria-label="Generated local test signal" style={{width:'100%',maxWidth:'100%'}}
      onLoadedMetadata={event=>{if(event.currentTarget!==audio.current)return;setDuration(event.currentTarget.duration);setPhase('ready');}}
      onDurationChange={event=>{if(event.currentTarget===audio.current&&Number.isFinite(event.currentTarget.duration))setDuration(event.currentTarget.duration);}}
      onTimeUpdate={event=>{if(event.currentTarget===audio.current)setTime(event.currentTarget.currentTime);}}
      onSeeked={event=>{if(event.currentTarget===audio.current)setTime(event.currentTarget.currentTime);}}
      onPlaying={event=>{if(event.currentTarget===audio.current)setPhase('playing');}}
      onWaiting={event=>{if(event.currentTarget===audio.current)setPhase('buffering');}}
      onStalled={event=>{if(event.currentTarget===audio.current)setPhase('buffering');}}
      onPause={event=>{if(event.currentTarget===audio.current&&!event.currentTarget.ended)setPhase('paused');}}
      onEnded={event=>{if(event.currentTarget===audio.current)setPhase('ended');}}
      onError={event=>{if(event.currentTarget!==audio.current)return;setPhase('failed');setError(`Local media unavailable (native code ${event.currentTarget.error?.code??'unknown'}). Correct the source and retry; no pronunciation is inferred.`);}}
      onVolumeChange={event=>{if(event.currentTarget===audio.current){setVolume(event.currentTarget.volume);setMuted(event.currentTarget.muted);}}}
      onRateChange={event=>{if(event.currentTarget===audio.current)setRate(event.currentTarget.playbackRate);}}
    />
    <div className="flex flex-wrap gap-3"><Button style={action} type="button" onClick={()=>void play()}>Play local test signal</Button><Button style={action} type="button" variant="outline" onClick={()=>audio.current?.pause()}>Pause local test signal</Button><Button style={action} type="button" variant="outline" disabled={!duration} onClick={()=>seek(0)}>Restart local position</Button></div>
    <label id="local-audio-position-label" className="block">Actual playback position</label><Slider aria-labelledby="local-audio-position-label" value={time} min={0} max={duration||manifest.durationSeconds} step={.1} disabled={!duration||phase==='failed'} onValueChange={seek} getAriaValueText={(_,value)=>`${value.toFixed(1)} of ${duration.toFixed(1)} seconds`} />
    <p dir="auto" data-audio-time>{time.toFixed(1)} of {duration?duration.toFixed(1):'unknown'} seconds, from native media events.</p>
    <Checkbox label="Mute local test signal" checked={muted} onCheckedChange={setMuted} />
    <label htmlFor="local-audio-volume" className="block">Local signal volume</label><input id="local-audio-volume" type="range" min={0} max={1} step={.05} value={volume} onChange={event=>setVolume(Number(event.target.value))} style={{width:'100%',minHeight:44}} />
    <label htmlFor="local-audio-rate" className="block">Playback rate</label><select id="local-audio-rate" className="mt-input" value={rate} onChange={event=>setRate(Number(event.target.value))}>{![.75,1,1.25,1.5,2].includes(rate)&&<option value={rate}>{rate}× native rate</option>}{[.75,1,1.25,1.5,2].map(value=><option key={value} value={value}>{value}×</option>)}</select>
    <div className="flex flex-wrap gap-3"><Button style={action} type="button" variant="outline" aria-pressed={missing} onClick={()=>source(!missing)}>Use missing audio source</Button><Button style={action} type="button" variant="outline" onClick={()=>source(missing)}>Retry current audio source</Button><Button style={action} type="button" variant="outline" aria-pressed={rtl} onClick={()=>setRtl(value=>!value)}>Use RTL audio layout</Button></div>
    <p role="status" dir="auto" data-audio-status>Actual media state: {phase}. {error}</p>
    <label htmlFor="local-audio-note" className="block">Retained local playback note</label><Textarea id="local-audio-note" dir="auto" value={note} onChange={event=>setNote(event.target.value)} />
    <p dir="auto">Signal SHA-256: <code>{manifest.sha256}</code>. Native playback time is decoder/clock evidence; it does not prove physical speaker output, language accuracy or durable notes.</p>
  </div></DirectionProvider>;
}
