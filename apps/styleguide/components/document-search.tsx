'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Input } from '@mobtranslate/ui';
import { useSearchParams } from 'next/navigation';
import { sections } from '../content/navigation';
import { loadDocuments, searchDocuments, searchTerms, type SearchEntry } from '../lib/document-search';

const paths = sections.flatMap(section => section.items.map(item => item.href));

function MatchText({ text, query }: { text: string; query: string }) {
  const terms = searchTerms(query);
  if (!terms.length) return text;
  const expression = new RegExp(`(${terms.map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'giu');
  return text.split(expression).map((part, index) => index % 2 ? <mark key={index}>{part}</mark> : part);
}

export function DocumentSearch() {
  const urlQuery = useSearchParams().get('q') ?? '';
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const [started, setStarted] = useState(false);
  const [revision, setRevision] = useState(0);
  const [entries, setEntries] = useState<SearchEntry[]>([]);
  const [phase, setPhase] = useState<'idle' | 'loading' | 'ready' | 'error' | 'cancelled'>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [limit, setLimit] = useState(20);
  const queryInput = useRef<HTMLInputElement>(null);
  const cancelAction = useRef<HTMLElement>(null);
  const resultList = useRef<HTMLOListElement>(null);

  useEffect(() => {
    setDraft(urlQuery); setQuery(urlQuery.trim()); setLimit(20);
    if (searchTerms(urlQuery).length) setStarted(true);
  }, [urlQuery]);
  useEffect(() => {
    if (!started) return;
    const controller = new AbortController();
    setPhase('loading'); setError(''); setEntries([]);
    loadDocuments(paths, controller.signal, done => setProgress(done)).then(index => {
      if (!controller.signal.aborted) {
        if (document.activeElement === cancelAction.current) queryInput.current?.focus();
        setEntries(index); setPhase('ready');
      }
    }).catch(reason => {
      if (controller.signal.aborted) return;
      controller.abort();
      if (document.activeElement === cancelAction.current) queryInput.current?.focus();
      setError(reason instanceof Error ? reason.message : 'The documentation request failed.');
      setPhase('error');
    });
    return () => controller.abort();
  }, [started, revision]);
  const results = useMemo(() => searchDocuments(entries, query), [entries, query]);
  const validQuery = searchTerms(query).length > 0;
  return <div data-document-search className="space-y-5">
    <form role="search" aria-label="Documentation content" className="space-y-3" onSubmit={event => {
      event.preventDefault();
      const next = draft.trim();
      setQuery(next); setLimit(20);
      const url = new URL(location.href);
      if (next) url.searchParams.set('q', next); else url.searchParams.delete('q');
      history.replaceState(null, '', url);
      if (searchTerms(next).length) setStarted(true);
    }}>
      <label htmlFor="guidance-query" className="block font-semibold">Search guidance</label>
      <Input ref={queryInput} id="guidance-query" name="q" type="search" value={draft} onChange={event => setDraft(event.target.value)} aria-describedby="guidance-search-help" />
      <p id="guidance-search-help" className="text-sm">Search prose, API tables and checked code examples. All entered terms must match the same section or its page title. Try “capture”, “time zones” or “aria-describedby”.</p>
      <div className="flex flex-wrap gap-3"><Button type="submit">Search documentation</Button>
        {started && <Button type="button" variant="outline" disabled={phase === 'loading'} onClick={() => { queryInput.current?.focus(); setLimit(20); setRevision(current => current + 1); }}>Reload guidance</Button>}
        {phase === 'loading' && <Button ref={cancelAction} type="button" variant="ghost" onClick={() => { queryInput.current?.focus(); setStarted(false); setPhase('cancelled'); setEntries([]); }}>Cancel loading guidance</Button>}
      </div>
    </form>
    <p role="status" aria-atomic="true" className="text-sm" data-search-status>
      {phase === 'loading' ? `Loading guidance: ${progress} of ${paths.length} pages.` : phase === 'error' ? 'Guidance could not be fully loaded.' : phase === 'cancelled' ? 'Guidance loading cancelled. Your query is retained; search again to reload.' : !validQuery ? 'Enter words or an API name to search.' : phase === 'ready' ? `${results.length} matching sections across ${paths.length} indexed pages.` : 'Preparing guidance search.'}
    </p>
    {phase === 'error' && <div className="space-y-3"><p>{error} Your query is retained. Reload guidance to retry, or use the topic navigation.</p><Button type="button" onClick={() => { queryInput.current?.focus(); setRevision(current => current + 1); }}>Retry loading guidance</Button></div>}
    {phase === 'ready' && validQuery && results.length === 0 && <p>No matching sections for “{query}”. Try fewer terms, a component name or an exact API property. Search uses the documented wording; it does not invent synonyms.</p>}
    {phase === 'ready' && validQuery && results.length > 0 && <>
      <ol ref={resultList} className="search-results" aria-label="Matching documentation sections">
        {results.slice(0, limit).map(result => <li key={result.href}>
          <a href={result.href}><MatchText text={result.page} query={query} /> <span aria-hidden="true">›</span> <MatchText text={result.heading} query={query} /></a>
          <p><MatchText text={result.snippet} query={query} /></p>
        </li>)}
      </ol>
      <p className="text-sm">Showing {Math.min(limit, results.length)} of {results.length} sections. Links open the matching heading.</p>
      {results.length > 20 && <Button type="button" variant="secondary" onClick={() => {
        if (results.length > limit) setLimit(current => current + 20);
        else resultList.current?.querySelector<HTMLAnchorElement>('a')?.focus();
      }}>{results.length > limit ? 'Show more results' : 'Return to first result'}</Button>}
    </>}
    <p className="text-sm">The index is a snapshot of this preview’s rendered pages, including initial example content. Reload it after documentation changes. It does not index a demo’s later input, external references or other websites.</p>
  </div>;
}
