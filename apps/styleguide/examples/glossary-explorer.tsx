'use client';
import { useEffect, useRef, useState } from 'react';
import { glossaryEntries, glossaryId } from '../content/glossary';
import { searchTerms } from '../lib/document-search';
import { Button } from '@mobtranslate/ui';

const categories = [...new Set(glossaryEntries.map(entry => entry.category))].sort();
export function GlossaryExplorer() {
  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [status, setStatus] = useState('');
  const [copying, setCopying] = useState(false);
  const [target, setTarget] = useState('');
  const copyEpoch = useRef(0);
  const copyBusy = useRef(false);
  const terms = searchTerms(query);
  const entries = glossaryEntries.filter(entry => (category === 'all' || entry.category === category)
    && terms.every(term => `${entry.term} ${entry.category} ${entry.definition} ${entry.decision} ${entry.failure}`.toLocaleLowerCase('en').includes(term)));
  useEffect(() => {
    setReady(true);
    const reveal = () => {
      let id;
      try { id = decodeURIComponent(location.hash.slice(1)); } catch { return; }
      if (!glossaryEntries.some(entry => glossaryId(entry.term) === id)) return;
      setQuery(''); setCategory('all'); setTarget(id);
    };
    reveal(); window.addEventListener('hashchange', reveal);
    return () => { window.removeEventListener('hashchange', reveal); copyEpoch.current++; };
  }, []);
  useEffect(() => {
    if (!target) return;
    const frame = requestAnimationFrame(() => {
      const heading = document.getElementById(target);
      heading?.focus({ preventScroll: true }); heading?.scrollIntoView({ block: 'start' }); setTarget('');
    });
    return () => cancelAnimationFrame(frame);
  }, [target, entries.length]);
  async function copy(term: string) {
    if (copyBusy.current) return;
    copyBusy.current = true; setCopying(true); setStatus(`Copying the entry link for ${term}…`);
    const epoch = ++copyEpoch.current;
    const url = new URL(`/guides/glossary#${glossaryId(term)}`, location.origin).href;
    try {
      await navigator.clipboard.writeText(url);
      if (copyEpoch.current === epoch) setStatus(`Copied the entry link for ${term}.`);
    } catch {
      if (copyEpoch.current === epoch) setStatus(`Clipboard unavailable. Use the heading link for ${term}, or copy its address manually.`);
    } finally {
      copyBusy.current = false;
      if (copyEpoch.current === epoch) setCopying(false);
    }
  }
  return <div data-glossary-ready={ready}>
    <div className="space-y-4 mb-6">
      <label className="block" htmlFor="glossary-query" lang="en" dir="auto">Find a term or implementation concern</label>
      <input id="glossary-query" className="mt-input w-full" type="search" disabled={!ready} value={query} onChange={event => setQuery(event.target.value)} aria-describedby="glossary-search-help" />
      <p id="glossary-search-help" lang="en" dir="auto">Matches all typed words against authored names, definitions, decisions and failures. No inferred synonyms or external search.</p>
      <label className="block" htmlFor="glossary-category" lang="en" dir="auto">Topic category</label>
      <select id="glossary-category" className="mt-input w-full" disabled={!ready} value={category} onChange={event => setCategory(event.target.value)}><option value="all">All categories</option>{categories.map(value => <option key={value} value={value}>{value}</option>)}</select>
      <Button type="button" variant="outline" disabled={!ready} onClick={() => { setQuery(''); setCategory('all'); document.getElementById('glossary-query')?.focus(); }}>Clear glossary filters</Button>
      <p role="status" data-glossary-count lang="en" dir="auto">{entries.length} of {glossaryEntries.length} entries shown.</p>
      <p role="status" data-glossary-copy lang="en" dir="auto">{status}</p>
    </div>
    {!entries.length && <p lang="en" dir="auto">No entries match these filters. Clear the filters or use fewer words; the complete register remains available.</p>}
    <nav aria-label="Visible glossary terms" className="doc-links mb-6">{entries.map(entry => <a key={entry.term} href={`#${glossaryId(entry.term)}`}><bdi>{entry.term}</bdi></a>)}</nav>
    <div data-glossary-entries>{entries.map(entry => <section key={entry.term} className="mb-8" aria-labelledby={glossaryId(entry.term)} lang="en" dir="auto">
      <h3 id={glossaryId(entry.term)} tabIndex={-1} className="text-xl font-semibold mb-2 scroll-mt-24 lg:scroll-mt-6"><a href={`#${glossaryId(entry.term)}`} className="underline">{entry.term}</a></h3>
      <p className="text-sm mb-2">{entry.category} · {entry.material ? 'Material reference heading, locally authored explanation' : 'Local implementation vocabulary'}</p>
      <p className="mb-2">{entry.definition}</p>
      <p className="mb-2"><strong>Use here: </strong>{entry.decision}</p>
      <p className="mb-3"><strong>Watch for: </strong>{entry.failure}</p>
      <div className="flex flex-wrap items-center gap-3"><a href={entry.href} className="underline">Related guidance for {entry.term}</a><Button type="button" variant="outline" disabled={!ready} aria-disabled={copying || undefined} style={{ height: 'auto', minHeight: 44, maxWidth: '100%', whiteSpace: 'normal', overflowWrap: 'anywhere', opacity: copying ? .6 : 1 }} onClick={() => copy(entry.term)}>Copy link for {entry.term}</Button></div>
    </section>)}</div>
  </div>;
}
