'use client';
import { Suspense, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button, Pagination, PaginationButton, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@mobtranslate/ui';

const records = Array.from({length:17}, (_, index) => `English-only local record ${index + 1}`);
const pageSize = 4;

export function LocalPaginationExample() {
  const [page, setPage] = useState(1);
  const [requested, setRequested] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [empty, setEmpty] = useState(false);
  const [small, setSmall] = useState(false);
  const [rtl, setRtl] = useState(false);
  const [result, setResult] = useState('Local page 1 loaded. No remote request occurred.');
  const heading = useRef<HTMLHeadingElement>(null);
  const available = empty ? [] : small ? records.slice(0,3) : records;
  const pages = Math.ceil(available.length / pageSize);
  const shown = available.slice((page-1)*pageSize,page*pageSize);
  function request(target: number) {
    if (pending || target === page || target < 1 || target > pages) return;
    setRequested(target); setPending(true); setFailed(false);
    setResult(`Local page ${target} requested; loaded page ${page} remains visible.`); heading.current?.focus();
  }
  function resolve(outcome: 'complete' | 'fail' | 'cancel') {
    if (!pending || requested === null) return;
    if (outcome === 'complete') { setPage(requested); setRequested(null); setResult(`Local page ${requested} loaded. No remote request occurred.`); }
    if (outcome === 'fail') { setFailed(true); setResult(`Local page ${requested} failed. Loaded page ${page} and its records remain; retry is available.`); }
    if (outcome === 'cancel') { setRequested(null); setResult(`Local page request cancelled. Loaded page ${page} remains.`); }
    setPending(false); heading.current?.focus();
  }
  return <div data-pagination-lab className="space-y-4">
    <div className="flex flex-wrap gap-3"><Button type="button" variant="outline" disabled={pending} aria-pressed={empty} onClick={() => { setEmpty(current => !current); setPage(1); setFailed(false); setRequested(null); setResult(empty ? 'Local collection restored; page 1 loaded.' : 'Local collection view is empty; no page selected.'); }}>Toggle empty local collection</Button><Button type="button" variant="outline" disabled={pending || empty} aria-pressed={small} onClick={() => { setSmall(current => !current); setPage(1); setFailed(false); setRequested(null); setResult(small ? 'Full local collection restored; page 1 loaded.' : 'Small local collection loaded on page 1.'); }}>Use small local collection</Button><Button type="button" variant="outline" aria-pressed={rtl} onClick={() => setRtl(current => !current)}>Use RTL local pagination</Button></div>
    <h3 id="local-paging-heading" ref={heading} tabIndex={-1} className="font-semibold">{pages ? `Local results, page ${page} of ${pages}` : 'No local records'}</h3>
    {shown.length ? <ol data-local-page-records start={(page-1)*pageSize+1} className="guidance-list">{shown.map(record => <li key={record}>{record}</li>)}</ol> : <p>Restore the local collection with the empty-collection control. No source data was deleted.</p>}
    <p id="local-paging-help">{pages ? `Showing ${(page-1)*pageSize+1}–${Math.min(page*pageSize,available.length)} of ${available.length} local records.` : 'Zero local records; no page is selected.'} Requested and loaded pages are separate states.</p>
    {pages > 0 && <form onSubmit={event => { event.preventDefault(); setResult('Unexpected pagination form submission.'); }}><div dir={rtl ? 'rtl' : 'ltr'}><Pagination aria-label="Local record pages" aria-describedby="local-paging-help"><PaginationContent>
      <PaginationItem><PaginationPrevious disabled={pending || page === 1} onClick={() => request(page-1)} /></PaginationItem>
      {Array.from({length:pages},(_,index)=>index+1).map(target=><PaginationItem key={target}><PaginationButton aria-label={`Local page ${target}`} isActive={target === page} disabled={pending} onClick={()=>request(target)}>{target}</PaginationButton></PaginationItem>)}
      <PaginationItem><PaginationNext disabled={pending || page === pages} onClick={()=>request(page+1)} /></PaginationItem>
    </PaginationContent></Pagination></div></form>}
    {pending && <div className="flex flex-wrap gap-3"><Button type="button" onClick={()=>resolve('complete')}>Complete local page load</Button><Button type="button" variant="outline" onClick={()=>resolve('fail')}>Fail local page load</Button><Button type="button" variant="outline" onClick={()=>resolve('cancel')}>Cancel local page load</Button></div>}
    {failed && requested !== null && <Button type="button" variant="outline" onClick={()=>request(requested)}>Retry requested local page</Button>}
    <p role="status">{result}</p>
  </div>;
}

export function RoutePaginationExample() {
  const search = useSearchParams();
  const raw = search.get('demoPage');
  const parsed = Number(raw);
  const count = Math.ceil(records.length/pageSize);
  const valid = raw === null || (Number.isInteger(parsed) && parsed >= 1 && parsed <= count);
  const page = valid && raw !== null ? parsed : 1;
  function href(target: number) { const next = new URLSearchParams(search.toString()); next.set('demoPage',String(target)); return `/components/pagination?${next.toString()}#routed-local-results`; }
  return <div data-route-pagination-lab className="space-y-3">
    <p data-route-page>Addressable local collection: page {page} of {count}.</p>
    {!valid && <p role="status">The requested URL page is invalid; showing local page 1. Choose a valid page link to correct the URL.</p>}
    <ol className="guidance-list" start={(page-1)*pageSize+1}>{records.slice((page-1)*pageSize,page*pageSize).map(record=><li key={record}>{record}</li>)}</ol>
    <Pagination aria-label="Addressable local record pages"><PaginationContent>
      {Array.from({length:count},(_,index)=>index+1).map(target=><PaginationItem key={target}><PaginationLink href={href(target)} aria-label={`Open route page ${target}`} isActive={target === page}>{target}</PaginationLink></PaginationItem>)}
    </PaginationContent></Pagination>
    <p>These native links address the same immutable local fixture through a validated query. They support direct entry, history and modified clicks; no backend collection or retained draft is implied.</p>
    <p>Ellipsis specimen, separate from this complete five-page range: <PaginationEllipsis />. Hidden visual punctuation is not a page or a substitute for access to missing pages.</p>
  </div>;
}

export function AddressablePaginationExample() {
  return <div id="routed-local-results" tabIndex={-1} role="region" aria-label="Addressable local results"><Suspense fallback={<p>Loading the addressable local fixture…</p>}><RoutePaginationExample /></Suspense></div>;
}
