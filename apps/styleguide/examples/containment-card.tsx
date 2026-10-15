'use client';
import { useRef, useState } from 'react';
import { Button, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, Input, type CardProps } from '@mobtranslate/ui';

export function CardContainmentExample() {
  const [variant, setVariant] = useState<NonNullable<CardProps['variant']>>('outlined');
  const [saved, setSaved] = useState(false);
  return <div data-card-lab className="space-y-4">
    <label>Card surface <select data-card-surface className="mt-input" value={variant} onChange={event => setVariant(event.target.value as typeof variant)}>{['default','filled','outlined','elevated'].map(item => <option key={item}>{item}</option>)}</select></label>
    <Card variant={variant} role="region" aria-labelledby="local-card-title">
      <CardHeader style={{padding:16}}><CardTitle dir="auto" id="local-card-title">Local reading collection</CardTitle><CardDescription dir="auto">An English-only example with explicit actions.</CardDescription></CardHeader>
      <CardContent style={{padding:16}}><p dir="auto">The container itself is not clickable. Open the related guidance or change this local bookmark.</p></CardContent>
      <CardFooter style={{padding:16}}><a className="mt-btn mt-btn-outline mt-btn-md" style={{paddingInline:12}} href="/patterns/notifications">Read recovery guidance</a><Button type="button" style={{paddingInline:12}} variant="secondary" aria-pressed={saved} onClick={() => setSaved(current => !current)}>{saved ? 'Remove local bookmark' : 'Bookmark locally'}</Button></CardFooter>
    </Card>
    <CardCollectionExample variant={variant} />
    <p role="status" dir="auto">{saved ? 'Local bookmark added; nothing was sent or persisted.' : 'Collection is not locally bookmarked.'}</p>
  </div>;
}


const cardRecords = [
  {id:'reading',title:'Reading notes',description:'Local reading settings and a retained English-only draft.'},
  {id:'comparison',title:'Comparison notes',description:'Local examples arranged for comparison, without review claims.'},
  {id:'recovery',title:'Recovery notes',description:'Local cancellation, retry and retained recovery examples.'},
];
function CardCollectionExample({variant}:{variant:NonNullable<CardProps['variant']>}) {
  const [query,setQuery]=useState('');
  const [onlySaved,setOnlySaved]=useState(false);
  const [saved,setSaved]=useState<Set<string>>(()=>new Set());
  const [order,setOrder]=useState('source');
  const [rtl,setRtl]=useState(false);
  const filter=useRef<HTMLInputElement>(null);
  const savedFilter=useRef<HTMLElement>(null);
  const visible=cardRecords.filter(record=>(!onlySaved||saved.has(record.id))&&record.title.toLocaleLowerCase('en').includes(query.trim().toLocaleLowerCase('en')));
  if(order!=='source')visible.sort((a,b)=>new Intl.Collator('en').compare(a.title,b.title)*(order==='az'?1:-1));
  function toggle(id:string){
    if(onlySaved&&saved.has(id))savedFilter.current?.focus();
    setSaved(previous=>{const next=new Set(previous);if(next.has(id))next.delete(id);else next.add(id);return next;});
  }
  return <section data-card-collection dir={rtl?'rtl':'ltr'} aria-labelledby="local-card-collection-title" className="space-y-4">
    <h3 dir="auto" id="local-card-collection-title" className="font-semibold">A collection with independent actions</h3>
    <p dir="auto">Filters and sorting apply to every local card. Surface changes preserve bookmarks. The cards grow with their contents and do not scroll internally.</p>
    <label className="block" htmlFor="local-card-filter">Filter local card titles</label><Input dir="auto" ref={filter} id="local-card-filter" value={query} onChange={event=>setQuery(event.target.value)} />
    <div className="flex flex-wrap gap-3">
      <Button ref={savedFilter} type="button" variant="outline" aria-pressed={onlySaved} onClick={()=>setOnlySaved(value=>!value)}>Bookmarked cards only</Button>
      <Button type="button" variant="outline" aria-pressed={rtl} onClick={()=>setRtl(value=>!value)}>Use RTL card collection</Button>
      <label>Local card order <select aria-label="Local card order" className="mt-input" value={order} onChange={event=>setOrder(event.target.value)}><option value="source">Source order</option><option value="az">Title A–Z</option><option value="za">Title Z–A</option></select></label>
    </div>
    <p dir="auto" role="status" data-card-collection-status>Shown {visible.length} of {cardRecords.length} local cards. {saved.size} bookmarked. No remote or durable write occurred.</p>
    {visible.length ? <div data-card-records style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,16rem),1fr))',gap:16,alignItems:'start'}}>{visible.map(record=><Card key={record.id} variant={variant} role="article" aria-labelledby={`local-card-${record.id}`} data-card-id={record.id}>
      <CardHeader style={{padding:16}}><h4 dir="auto" id={`local-card-${record.id}`} className="mt-card-title">{record.title}</h4></CardHeader>
      <CardContent style={{padding:16}}><p dir="auto">{record.description}</p><details className="mt-4"><summary style={{minHeight:44,cursor:'pointer'}}>Read {record.title} details</summary><p className="mt-3">This is retained local content for {record.title}. Expanding grows the card in normal document flow. It does not validate a source, authorize access or create a remote result.</p></details></CardContent>
      <CardFooter style={{padding:16}}><Button type="button" style={{paddingInline:12}} variant="secondary" aria-pressed={saved.has(record.id)} onClick={()=>toggle(record.id)}>{saved.has(record.id)?'Remove bookmark':'Bookmark'} {record.title}</Button></CardFooter>
    </Card>)}</div> : <div data-card-empty><p dir="auto">No local card titles match these filters. Bookmarks remain retained.</p><Button type="button" onClick={()=>{setQuery('');setOnlySaved(false);filter.current?.focus();}}>Show all local cards</Button></div>}
    <h3 dir="auto" className="font-semibold">A separate, single-action card</h3>
    <p dir="auto">This whole-card link has one destination and no nested controls. The collection above keeps its independent controls inside non-actionable containers.</p>
    <a data-single-card href="/patterns/notifications" aria-labelledby="local-single-card-title" style={{padding:16}} className="mt-card mt-card-outlined block focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"><h4 dir="auto" id="local-single-card-title" className="font-semibold underline">Open notification recovery guidance</h4><p dir="auto">Read the pattern.</p></a>
  </section>;
}
