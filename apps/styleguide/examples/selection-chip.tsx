'use client';
import { useRef, useState } from 'react';
import { Button, Chip, ChipAction, ChipToggle, Input, type ChipProps } from '@mobtranslate/ui';

export function ChipSelectionExample() {
  const [variant, setVariant] = useState<NonNullable<ChipProps['variant']>>('filled');
  const [size, setSize] = useState<NonNullable<ChipProps['size']>>('md');
  const [filtered, setFiltered] = useState(false);
  const [notesOnly,setNotesOnly]=useState(false);
  const [help,setHelp]=useState(false);
  const [draft,setDraft]=useState('English-only local suggestion');
  const [tokens,setTokens]=useState([{id:0,label:'English-only local suggestion'}]);
  const [editing,setEditing]=useState<number|null>(0);
  const [removed,setRemoved]=useState<{id:number;label:string}|null>(null);
  const nextToken=useRef(0);
  const [error,setError]=useState('');
  const entry=useRef<HTMLInputElement>(null);
  const visible=[{id:'reading',title:'Local reading sample',bookmarked:true,note:false},{id:'note',title:'Local note sample',bookmarked:false,note:true}].filter(item=>(!filtered||item.bookmarked)&&(!notesOnly||item.note));
  const [result, setResult] = useState('No local chip action yet.');
  const restore = useRef<HTMLElement>(null);
  return <div data-chip-lab className="space-y-4">
    <label>Chip variant <select data-chip-variant className="mt-input" value={variant} onChange={event => setVariant(event.target.value as typeof variant)}>{['filled','outlined','soft'].map(item => <option key={item}>{item}</option>)}</select></label>
    <label>Chip size <select data-chip-size className="mt-input" value={size} onChange={event => setSize(event.target.value as typeof size)}>{['sm','md','lg'].map(item => <option key={item}>{item}</option>)}</select></label>
    <div className="flex flex-wrap gap-3">{(['default','primary','success','warning','error'] as const).map(color => <Chip key={color} color={color} variant={variant} size={size} data-tone={color}>{color} local label</Chip>)}</div>
    <div role="group" aria-label="Contextual local actions" className="flex flex-wrap gap-3"><ChipAction onClick={() => {setHelp(true);setResult('Local filter explanation is visible below.');}} variant={variant} size={size}>Explain local filter</ChipAction><ChipAction onClick={() => { if(!tokens.some(item=>item.label==='English-only local suggestion')){const id=++nextToken.current;setTokens(items=>[...items,{id,label:'English-only local suggestion'}]);}setError('');setResult('English-only local suggestion is present. Existing input chips are retained.'); }} variant={variant} size={size}>Add local suggestion</ChipAction><ChipAction disabled>Unavailable local action</ChipAction></div>
    {help&&<p data-chip-help>Bookmarked examples includes retained bookmarks. Notes examples includes notes. Selecting both requires both conditions; clear filters to recover the complete local list.</p>}
    <p>Select local filters. Both filters apply together.</p>
    <div role="group" aria-label="Select local filters" className="flex flex-wrap gap-3"><ChipToggle pressed={filtered} onPressedChange={setFiltered} variant={variant} size={size}>Bookmarked examples</ChipToggle><ChipToggle pressed={notesOnly} onPressedChange={setNotesOnly} variant={variant} size={size}>Notes examples</ChipToggle></div>
    <Button type="button" variant="outline" aria-disabled={!filtered&&!notesOnly||undefined} onClick={()=>{setFiltered(false);setNotesOnly(false);}}>Clear local chip filters</Button>
    <form className="space-y-3" noValidate onSubmit={event=>{event.preventDefault();if(!draft.trim()){setError('Enter text for this local chip.');entry.current?.focus();return;}const label=draft.trim();if(tokens.some(item=>item.id!==editing&&item.label===label)){setError('A local chip already uses that exact text.');entry.current?.focus();return;}const existing=tokens.find(item=>item.id===editing);const id=existing?.id??++nextToken.current;setTokens(items=>existing?items.map(item=>item.id===id?{id,label}:item):[...items,{id,label}]);setEditing(id);setError('');setResult('Local input chip updated from the entered text. Other chips are retained.');}}>
      <label htmlFor="local-chip-text">Local chip text</label><Input ref={entry} id="local-chip-text" value={draft} onChange={event=>{setDraft(event.target.value);setError('');}} aria-invalid={!!error||undefined} aria-describedby={error?'local-chip-error':undefined}/>
      {error&&<p id="local-chip-error" role="alert">{error}</p>}
      <div className="flex flex-wrap gap-3"><Button type="submit">Use local chip text</Button><Button type="button" variant="outline" onClick={()=>{setEditing(null);setDraft('');setError('');entry.current?.focus();}}>New local chip</Button></div>
      <p>{editing===null?'Entering a new local chip.':'Editing an existing local chip.'} Exact duplicate text is not added twice.</p>
    </form>
    <div role="group" aria-label="Local input chips" className="flex flex-wrap gap-3">{tokens.map(token=><Chip key={token.id} onDelete={()=>{setRemoved(token);setTokens(items=>items.filter(item=>item.id!==token.id));if(editing===token.id)setEditing(null);setResult('Local input chip removed. Restore remains available.');restore.current?.focus();}} deleteLabel={`Remove ${token.label}`} variant={variant} size={size}><button type="button" className="mt-chip-action" aria-label={`Edit ${token.label}`} style={{minHeight:44,minWidth:44,maxWidth:'100%',padding:0,border:0,background:'transparent',color:'inherit',font:'inherit',textAlign:'start',whiteSpace:'normal',overflowWrap:'anywhere',cursor:'pointer'}} onClick={()=>{setEditing(token.id);setDraft(token.label);setError('');entry.current?.focus();}}>{token.label}</button></Chip>)}</div>
    <Button ref={restore} style={{minHeight:44,height:"auto",minWidth:0,maxWidth:"100%",whiteSpace:"normal",overflowWrap:"anywhere"}} type="button" variant="outline" aria-disabled={!removed||undefined} onClick={()=>{if(removed){const exists=tokens.some(item=>item.id===removed.id||item.label===removed.label);if(!exists)setTokens(items=>[...items,removed]);setRemoved(null);setResult(exists?'A chip with the removed text is already present.':'Local input chip restored.');}}}>Restore local chip</Button>
    <ul aria-label="Local filtered examples">{visible.map(item => <li key={item.id}>{item.title}</li>)}</ul>
    {visible.length===0&&<p data-chip-empty>No local examples match both filters. Clear filters to show the retained examples.</p>}
    <p role="status">{result} Local filter: {filtered ? 'bookmarked examples' : 'all bookmarks'}; {notesOnly?'notes examples':'all kinds'}. {visible.length} matching local examples.</p>
  </div>;
}
