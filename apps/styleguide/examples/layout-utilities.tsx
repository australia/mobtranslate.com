'use client';
import {useState,type CSSProperties} from 'react';
import {Stack,HStack,VStack,AspectRatio,Separator,VisuallyHidden,Button} from '@mobtranslate/ui';
const action:CSSProperties={minWidth:0,maxWidth:'100%',minHeight:44,height:'auto',whiteSpace:'normal',overflowWrap:'anywhere'};
export function StackLayoutExample(){
  const [row,setRow]=useState(false);
  const [wrap,setWrap]=useState(true);
  const [gap,setGap]=useState(3);
  const [rtl,setRtl]=useState(false);
  const [selected,setSelected]=useState('overview');
  const tasks=[{id:'overview',label:'Local overview',text:'Actual English-only overview content.'},{id:'notes',label:'Local reading notes',text:'Actual English-only reading-note content.'},{id:'saved',label:'Local saved examples',text:'Actual English-only saved-example content.'}];
  return <VStack data-stack-lab gap={4}>
    <HStack gap={3} wrap><Button style={action} type="button" variant="outline" aria-pressed={row} onClick={()=>setRow(v=>!v)}>Use row task layout</Button><Button style={action} type="button" variant="outline" aria-pressed={wrap} onClick={()=>setWrap(v=>!v)}>Allow task wrapping</Button><Button style={action} type="button" variant="outline" aria-pressed={rtl} onClick={()=>setRtl(v=>!v)}>Use RTL task layout</Button></HStack>
    <label>Gap in quarter-rem units <select data-stack-gap className="mt-input" value={gap} onChange={event=>setGap(Number(event.target.value))}><option value={0}>0</option><option value={3}>3</option><option value={6}>6</option></select></label>
    <Stack data-stack-tasks direction={row?'row':'column'} wrap={wrap} gap={gap} align="stretch" dir={rtl?'rtl':'ltr'}>{tasks.map(task=><Button style={{...action,flex:row?'1 1 10rem':undefined}} key={task.id} type="button" variant={selected===task.id?'primary':'outline'} aria-pressed={selected===task.id} onClick={()=>setSelected(task.id)}>{task.label}</Button>)}</Stack><p data-stack-result>{tasks.find(task=>task.id===selected)?.text}</p>
    <p>These pressed buttons select one local preview. Stack supplies layout only; it adds no toolbar, tab or arrow-key model.</p>
  </VStack>;
}
export function AspectFrameExample(){
  const [ratio,setRatio]=useState(16/9);
  const [cover,setCover]=useState(false);
  return <div data-aspect-lab className="space-y-4"><label>Frame width divided by height <select data-aspect-ratio className="mt-input" value={ratio} onChange={event=>setRatio(Number(event.target.value))}><option value={16/9}>16:9</option><option value={4/3}>4:3</option><option value={1}>1:1</option><option value={3/4}>3:4</option></select></label><Button style={action} type="button" variant="outline" aria-pressed={cover} onClick={()=>setCover(v=>!v)}>Crop illustration to cover frame</Button>
    <figure><AspectRatio ratio={ratio} data-aspect-frame><svg viewBox="0 0 400 200" preserveAspectRatio={cover?'xMidYMid slice':'xMidYMid meet'} role="img" aria-label="English-only geometric illustration with three numbered regions" style={{background:'var(--color-muted)'}}><rect x="0" y="0" width="400" height="200" fill="var(--color-muted)"/><rect x="20" y="20" width="100" height="160" fill="var(--color-background)" stroke="var(--color-foreground)"/><circle cx="200" cy="100" r="60" fill="var(--color-primary)"/><rect x="280" y="20" width="100" height="160" fill="var(--color-background)" stroke="var(--color-foreground)"/><text x="70" y="110" textAnchor="middle" fill="var(--color-foreground)" fontSize="32">1</text><text x="200" y="110" textAnchor="middle" fill="var(--color-primary-foreground)" fontSize="32">2</text><text x="330" y="110" textAnchor="middle" fill="var(--color-foreground)" fontSize="32">3</text></svg></AspectRatio><figcaption className="mt-3">Local geometric illustration, not a photograph. {cover?'Cover can crop edge regions.':'Contain preserves all three regions.'} Caption stays outside the clipped media frame.</figcaption></figure>
  </div>;
}
export function SeparatorSectionsExample(){
  const [vertical,setVertical]=useState(false);
  const [decorative,setDecorative]=useState(false);
  return <div data-separator-lab className="space-y-4"><HStack wrap gap={3}><Button style={action} type="button" variant="outline" aria-pressed={vertical} onClick={()=>setVertical(v=>!v)}>Use vertical section divider</Button><Button style={action} type="button" variant="outline" aria-pressed={decorative} onClick={()=>setDecorative(v=>!v)}>Make local divider decorative</Button></HStack><Stack direction={vertical?'row':'column'} gap={3} style={vertical?{minHeight:100}:undefined}><p style={{flex:1}}>English-only draft details.</p><Separator data-local-divider orientation={vertical?'vertical':'horizontal'} aria-hidden={decorative||undefined} className={state=>state.orientation==='vertical'?'divider-vertical':'divider-horizontal'} /><p style={{flex:1}}>English-only local result.</p></Stack><p>Default is a semantic separator; decorative mode hides this redundant boundary from the accessibility tree. The copy remains visible.</p></div>;
}
export function HiddenNameExample(){
  const [saved,setSaved]=useState(false);
  return <div data-hidden-lab className="space-y-4"><p>An icon control has a real text name in a visually hidden span. Visible help remains available for everyone.</p><Button id="hidden-bookmark" type="button" size="icon" variant="outline" aria-pressed={saved} onClick={()=>setSaved(v=>!v)}><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill={saved?'currentColor':'none'} stroke="currentColor"><path d="M6 3h12v18l-6-4-6 4z"/></svg><VisuallyHidden data-hidden-name>Toggle local example bookmark</VisuallyHidden></Button><p role="status" data-hidden-result>{saved?'Actual local bookmark present.':'Actual local bookmark absent.'}</p><p>Keep interactive controls outside VisuallyHidden. Clipping a focusable link would leave an invisible keyboard target.</p></div>;
}
