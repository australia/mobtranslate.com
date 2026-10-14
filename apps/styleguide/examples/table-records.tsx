'use client';
import {useRef, useState, type CSSProperties} from 'react';
import {Button, Checkbox, Input, Table, TableHeader, TableBody, TableFooter, TableRow, TableHead, TableCell, TableCaption, Pagination, PaginationContent, PaginationItem, PaginationButton, PaginationPrevious, PaginationNext} from '@mobtranslate/ui';

const records = [
  {id:'reading', title:'Local reading notes', count:18, detail:'English-only notes for a local reading task.'},
  {id:'examples', title:'Local example collection', count:7, detail:'English-only examples for comparison; no source authority is implied.'},
  {id:'drafts', title:'Local draft entries', count:12, detail:'English-only drafts awaiting a separate review workflow.'},
  {id:'bookmarks', title:'Local bookmarked pages', count:4, detail:'English-only bookmarks retained in this fixture.'},
  {id:'audio', title:'Local audio preparation', count:3, detail:'English-only preparation notes; these are not playable audio assets.'},
  {id:'checklist', title:'Local verification checklist', count:9, detail:'English-only task checks; a listed check is not proof that it passed.'},
];
const action:CSSProperties = {minHeight:44, height:'auto', minWidth:0, maxWidth:'100%', whiteSpace:'normal', overflowWrap:'anywhere'};
const collator = new Intl.Collator('en', {numeric:true});
export function TableRecordsExample(){
  const [query, setQuery] = useState('');
  const [descending, setDescending] = useState(false);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState<string|null>(null);
  const [bundle, setBundle] = useState<string[]>([]);
  const [rtl, setRtl] = useState(false);
  const [compact, setCompact] = useState(false);
  const table = useRef<HTMLTableElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const filtered = records.filter(record=>record.title.toLocaleLowerCase('en').includes(query.trim().toLocaleLowerCase('en')))
    .sort((a,b)=>(descending?-1:1)*collator.compare(a.title,b.title));
  const pages = Math.max(1, Math.ceil(filtered.length/3));
  const current = Math.min(page,pages-1);
  const visible = filtered.slice(current*3,current*3+3);
  const visibleSelected = visible.filter(record=>selected.has(record.id)).length;
  const hiddenSelected = records.filter(record=>selected.has(record.id)&&!visible.some(row=>row.id===record.id)).length;
  const loadedRecord = records.find(record=>record.id===loaded);
  function toggleVisible(checked:boolean){setSelected(previous=>{
    const next = new Set(previous);
    visible.forEach(record=>checked?next.add(record.id):next.delete(record.id));
    return next;
  });}
  return <div data-table-lab lang="en" dir={rtl?'rtl':'ltr'} className="space-y-4">
    <p dir="auto">Six synthetic English-only local collections. Filtering searches their titles; this is not a language translation, source audit or remote corpus search.</p>
    <label htmlFor="table-filter" className="block">Filter loaded collection titles</label>
    <Input id="table-filter" value={query} onChange={event=>{setQuery(event.target.value);setPage(0);}} />
    <div className="flex flex-wrap gap-3">
      <Button style={action} variant="outline" type="button" onClick={()=>{setQuery('');setPage(0);}}>Clear title filter</Button>
      <Button style={action} variant="outline" type="button" aria-pressed={rtl} onClick={()=>setRtl(value=>!value)}>Use RTL table direction</Button>
      <Button style={action} variant="outline" type="button" aria-pressed={compact} onClick={()=>setCompact(value=>!value)}>Use compact cell padding</Button>
      <Button style={action} variant="outline" type="button" onClick={()=>{container.current?.focus();table.current?.scrollIntoView({block:'center'});}}>Focus collection table</Button>
    </div>
    <p dir="auto" id="table-scroll-help">Scroll this named region horizontally to compare all columns. Use Tab to reach ordinary sort, selection and View controls; the table has no spreadsheet arrow-key model.</p>
    <p dir="auto" role="status" data-table-status>{filtered.length} of {records.length} loaded collections match. Page {current+1} of {pages}. {selected.size} selected; {hiddenSelected} outside this page.</p>
    <Table ref={table} containerRef={container} containerProps={{role:'region',tabIndex:0,'aria-label':'Loaded local collection comparison','aria-describedby':'table-scroll-help','data-table-container':true}} className={compact?'mt-table-compact':undefined} style={{minWidth:'42rem'}}>
      <TableCaption>Local collections — loaded fixture only, three rows per page</TableCaption>
      <TableHeader><TableRow>
        <TableHead scope="col"><Checkbox label="Select visible page" checked={visible.length>0&&visibleSelected===visible.length} indeterminate={visibleSelected>0&&visibleSelected<visible.length} disabled={visible.length===0} onCheckedChange={toggleVisible} /></TableHead>
        <TableHead scope="col" aria-sort={descending?'descending':'ascending'}><Button id="table-sort" style={action} type="button" variant="ghost" onClick={()=>{setDescending(value=>!value);setPage(0);}}>Collection title {descending?'↓':'↑'}</Button></TableHead>
        <TableHead scope="col" style={{textAlign:'end'}}>Loaded entries</TableHead>
        <TableHead scope="col">Action</TableHead>
      </TableRow></TableHeader>
      <TableBody>{visible.length?visible.map(record=><TableRow key={record.id} data-record-id={record.id} data-selected={selected.has(record.id)?'':undefined}>
        <TableCell><Checkbox label={`Select ${record.title}`} checked={selected.has(record.id)} onCheckedChange={checked=>setSelected(previous=>{const next=new Set(previous);if(checked)next.add(record.id);else next.delete(record.id);return next;})} /></TableCell>
        <TableHead scope="row" style={{whiteSpace:'normal'}}>{record.title}</TableHead>
        <TableCell style={{textAlign:'end',fontVariantNumeric:'tabular-nums'}}>{record.count}</TableCell>
        <TableCell><Button style={action} type="button" variant="outline" aria-label={`View ${record.title}`} onClick={()=>setLoaded(record.id)}>View</Button></TableCell>
      </TableRow>):<TableRow><TableCell colSpan={4}>No loaded titles match. Clear the title filter to restore all six local records.</TableCell></TableRow>}</TableBody>
      <TableFooter><TableRow><TableHead scope="row" colSpan={2}>Matching loaded entries, all filtered pages</TableHead><TableCell data-table-total style={{textAlign:'end',fontVariantNumeric:'tabular-nums'}}>{filtered.reduce((sum,record)=>sum+record.count,0)}</TableCell><TableCell>{filtered.length} collections</TableCell></TableRow></TableFooter>
    </Table>
    <Pagination aria-label="Loaded collection pages"><PaginationContent style={{flexWrap:'wrap'}}>
      <PaginationItem><PaginationPrevious disabled={current===0} onClick={()=>setPage(current-1)} /></PaginationItem>
      {Array.from({length:pages},(_,index)=><PaginationItem key={index}><PaginationButton aria-label={`Collection page ${index+1}`} isActive={current===index} onClick={()=>setPage(index)}>{index+1}</PaginationButton></PaginationItem>)}
      <PaginationItem><PaginationNext disabled={current===pages-1} onClick={()=>setPage(current+1)} /></PaginationItem>
    </PaginationContent></Pagination>
    <div className="flex flex-wrap gap-3"><Button style={action} type="button" disabled={!selected.size} onClick={()=>setBundle(records.filter(record=>selected.has(record.id)).map(record=>record.title))}>Create local selection summary</Button><Button style={action} variant="outline" type="button" disabled={!selected.size} onClick={()=>setSelected(new Set())}>Clear all collection selections</Button></div>
    <p dir="auto" role="status" data-table-result>{loadedRecord?`${loadedRecord.title}: ${loadedRecord.detail}`:'No collection opened yet.'}</p>
    <p dir="auto" data-table-bundle>{bundle.length?`Actual local summary snapshot: ${bundle.join('; ')}.`:'No selection summary created yet.'}</p>
    <p dir="auto">Filtering, paging and sorting retain selection and opened content by stable ID. The summary button snapshots all selected loaded records, including selections outside this page. Clear selection does not erase that prior outcome. No remote save, qualified review, playback or authorization is inferred.</p>
  </div>;
}
