'use client';
import {useEffect,useId,useRef,useState} from 'react';
import {Button} from '@mobtranslate/ui';
import {CodeBlock} from '../components/code-block';
import fixture from '../public/fixtures/alternative-counts.json';

type Purpose='informative'|'decorative'|'functional'|'complex';
interface Inspection {imagePresent:boolean;alt:string|null;descriptionId:string|null;insideButton:boolean;buttonType:string|null}
const highest=Math.max(...fixture.rows.map(row=>row.value));
const leaders=fixture.rows.filter(row=>row.value===highest).map(row=>row.label).join(', ');
export function AlternativeTextExample() {
  const [ready,setReady]=useState(false);
  const [purpose,setPurpose]=useState<Purpose>('informative');
  const [texts,setTexts]=useState<Record<Purpose,string>>({informative:`Example bars. Highest count: ${highest} (${leaders}).`,decorative:'',functional:'Open example values',complex:'Example counts by group; full values follow.'});
  const [valuesOpen,setValuesOpen]=useState(false);
  const [inspection,setInspection]=useState<Inspection|null>(null);
  const preview=useRef<HTMLDivElement>(null);
  const heading=useRef<HTMLHeadingElement>(null);
  const id=useId();
  const alt=purpose==='decorative'?'':texts[purpose];
  const valid=purpose==='decorative'||Boolean(alt.trim());
  const summary=fixture.rows.map(row=>`${row.label}: ${row.value}`).join('; ');
  useEffect(()=>setReady(true),[]);
  useEffect(()=>{
    const image=preview.current?.querySelector('img'),button=image?.closest('button');
    setInspection({imagePresent:Boolean(image),alt:image?.getAttribute('alt')??null,descriptionId:image?.getAttribute('aria-describedby')??null,insideButton:Boolean(button),buttonType:button?.getAttribute('type')??null});
  },[purpose,alt,valid]);
  useEffect(()=>{if(valuesOpen)heading.current?.focus();},[valuesOpen]);
  const image=<img data-alternative-image src="/fixtures/alternative-counts.svg" width="330" height="180" alt={alt} aria-describedby={purpose==='complex'?`${id}-summary`:undefined} style={{display:'block',width:purpose==='functional'?88:'100%',height:'auto',maxWidth:'100%'}} />;
  return <div data-alternative-ready={ready} className="space-y-4">
    <p>{fixture.kind}. The same generated image can serve different purposes in different contexts. Choose its purpose deliberately; this tool does not infer meaning or approve wording.</p>
    <label htmlFor="alternative-purpose" className="block">Purpose in this context</label>
    <select id="alternative-purpose" className="mt-input w-full" disabled={!ready} value={purpose} onChange={event=>{setPurpose(event.target.value as Purpose);setValuesOpen(false);}}>
      <option value="informative">Informative image</option><option value="decorative">Decorative or redundant image</option><option value="functional">Image-only action</option><option value="complex">Complex chart with full values</option>
    </select>
    <label htmlFor="alternative-text" className="block">{purpose==='functional'?'Action name supplied by the image':'Short text alternative'}</label>
    <textarea id="alternative-text" className="mt-textarea w-full" disabled={!ready||purpose==='decorative'} value={alt} onChange={event=>setTexts(current=>({...current,[purpose]:event.target.value}))} aria-invalid={!valid} aria-describedby="alternative-help" />
    <p id="alternative-help">{purpose==='decorative'?'The actual image uses alt="". Omitting alt is different. The visible text below already supplies the values.':purpose==='functional'?'Name what activation does. The image alternative supplies the native button’s name; no extra aria-label overrides it.':'Nonempty text enables the specimen. Presence is a structural check; equivalent meaning still needs contextual review.'}</p>
    {!valid&&<p role="status">Add a text alternative before previewing this meaningful image. Your text in other purposes is retained.</p>}
    <div ref={preview} data-alternative-preview>
      {!valid?<p>The meaningful-image preview is unavailable until its alternative is present.</p>:purpose==='functional'?<div>
        <Button type="button" variant="outline" data-alternative-action onClick={()=>setValuesOpen(true)} disabled={!ready} style={{height:'auto',minHeight:44,padding:12,maxWidth:'100%'}}>{image}</Button>
        <p className="mt-2">Activate the image-only button to open the same example values. Its action name comes from the image’s alt attribute.</p>
      </div>:<figure style={{background:'var(--color-card)',color:'var(--color-card-foreground)',border:'1px solid var(--color-muted-foreground)',borderRadius:'var(--radius-md)',padding:12}}>
        {image}<figcaption className="mt-2">{purpose==='decorative'?`Equivalent nearby text: ${summary}.`:`Example group counts. Left-to-right order: ${fixture.rows.map(row=>row.label).join(', ')}.`}</figcaption>
      </figure>}
    </div>
    {purpose==='complex'&&valid&&<div>
      <p id={`${id}-summary`}>Illustrative values: {summary}. Highest count: {highest} ({leaders}).</p>
      <a href={`#${id}-values`} className="underline inline-flex items-center min-h-11" onClick={()=>requestAnimationFrame(()=>heading.current?.focus())}>Read the full example values</a>
    </div>}
    {((purpose==='complex'&&valid)||(purpose==='functional'&&valuesOpen))&&<section aria-labelledby={`${id}-values`} data-alternative-values>
      <h3 id={`${id}-values`} ref={heading} tabIndex={-1} className="font-semibold text-xl scroll-mt-24">Full example values</h3>
      <table className="w-full mt-3"><caption className="text-start">Illustrative English fixture counts</caption><thead><tr><th scope="col" className="text-start p-2">Group</th><th scope="col" className="text-start p-2">Count</th></tr></thead><tbody>{fixture.rows.map(row=><tr key={row.label}><th scope="row" className="text-start p-2">{row.label}</th><td className="p-2">{row.value}</td></tr>)}</tbody></table>
      {purpose==='functional'&&<Button type="button" variant="outline" onClick={()=>{setValuesOpen(false);(preview.current?.querySelector<HTMLButtonElement>('button')??document.getElementById('alternative-text'))?.focus();}}>Close example values</Button>}
    </section>}
    <div><p className="font-semibold">Attributes inspected from the rendered preview</p><p>This is DOM evidence. It does not predict a screen reader’s exact spoken output or judge whether the wording is a good equivalent.</p>{inspection&&<CodeBlock language="json" code={JSON.stringify(inspection,null,2)} />}</div>
  </div>;
}
