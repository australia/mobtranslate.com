'use client';
import {useState,type CSSProperties} from 'react';
import {Avatar,Button,type AvatarLoadingStatus} from '@mobtranslate/ui';
const action:CSSProperties={minWidth:0,maxWidth:'100%',minHeight:44,height:'auto',whiteSpace:'normal',overflowWrap:'anywhere'};
const illustration=`data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#3b342e"/><circle cx="32" cy="32" r="24" fill="#e79554"/><text x="32" y="41" text-anchor="middle" font-size="28" fill="#21150a">A</text></svg>')}`;
export function AvatarSourceExample(){
  const [mode,setMode]=useState<'none'|'image'|'error'>('none');
  const [retry,setRetry]=useState(0);
  const [size,setSize]=useState<'sm'|'md'|'lg'|'xl'>('md');
  const [status,setStatus]=useState<AvatarLoadingStatus>('idle');
  const [selected,setSelected]=useState(false);
  const src=mode==='image'?illustration:mode==='error'?'/__styleguide_avatar_missing__.svg':undefined;
  return <div data-avatar-lab className="space-y-4"><div className="flex flex-wrap gap-3"><Button style={action} type="button" variant="outline" onClick={()=>{setMode('image');setRetry(v=>v+1);setStatus('loading');}}>Load local avatar illustration</Button><Button style={action} type="button" variant="outline" onClick={()=>{setMode('error');setRetry(v=>v+1);setStatus('loading');}}>Use missing local avatar source</Button><Button style={action} type="button" variant="outline" onClick={()=>{setRetry(v=>v+1);setStatus(src?'loading':'idle');}}>Retry current avatar source</Button><Button style={action} type="button" variant="outline" onClick={()=>{setMode('none');setStatus('idle');}}>Clear avatar source</Button></div>
    <label>Avatar size <select data-avatar-size className="mt-input" value={size} onChange={event=>setSize(event.target.value as 'sm'|'md'|'lg'|'xl')}><option value="sm">Small</option><option value="md">Medium</option><option value="lg">Large</option><option value="xl">Extra large</option></select></label>
    <div className="flex flex-wrap items-center gap-4"><Avatar data-avatar-primary size={size} src={src} alt="Local geometric example A" aria-label={undefined} fallback="A" retryKey={retry} onLoadingStatusChange={setStatus} referrerPolicy="no-referrer" /><p>Local geometric example A. This illustration is not a person’s photograph or verified identity.</p></div>
    <p role="status" data-avatar-status>Actual image state: {status}.</p>
    <p>The labelled representation retains its name during loading/error. Missing or failed sources use the explicit glyph; source replacement and Retry create a fresh loader.</p>
    <Button style={action} type="button" variant="outline" aria-pressed={selected} onClick={()=>setSelected(v=>!v)}><Avatar size="sm" fallback="B" alt="" /><span className="ms-2">Toggle local example B</span></Button><p data-avatar-selection>{selected?'Actual local example B selected.':'Actual local example B unselected.'}</p>
    <p>Example B’s adjacent button text supplies the action name; its avatar is decorative. A bare avatar adds no button or menu behavior.</p>
  </div>;
}
