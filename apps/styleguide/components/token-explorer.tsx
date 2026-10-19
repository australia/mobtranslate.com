'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@mobtranslate/ui';
import catalogue from '../content/tokens.json';
import {inspectTokenGraph} from '../lib/token-references';
import './token-explorer.css';

export function TokenExplorer() {
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('all');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [resolved, setResolved] = useState<Record<string, string>>({});
  const [status, setStatus] = useState('');
  const [dependencies,setDependencies]=useState(false);
  const groups = useMemo(() => [...new Set(catalogue.tokens.map((token) => token.name.slice(2).split('-')[0]))].sort(), []);

  useEffect(() => {
    const update = () => {
      const styles = getComputedStyle(document.documentElement);
      setResolved(Object.fromEntries(catalogue.tokens.map((token) => [token.name, styles.getPropertyValue(token.name).trim()])));
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] });
    return () => observer.disconnect();
  }, []);

  const tokens = catalogue.tokens.filter((token) =>
    (group === 'all' || token.name.slice(2).split('-')[0] === group) &&
    `${token.name} ${token.value} ${token.dark ?? ''}`.toLowerCase().includes(query.trim().toLowerCase())
  );
  const graph=inspectTokenGraph(catalogue.tokens,tokens.map(token=>token.name),theme);
  const exported=dependencies?graph.tokens:tokens;
  const css = `:root {\n${exported.map((token) => `  ${token.name}: ${theme === 'dark' ? token.dark ?? token.value : token.value};`).join('\n')}\n}`;

  const copy = async (value: string) => {
    try { await navigator.clipboard.writeText(value); setStatus('Copied to clipboard.'); }
    catch { setStatus('Clipboard unavailable. Select the token name and value to copy them manually.'); }
  };

  return <div className="token-explorer space-y-4">
    <div className="grid gap-4 sm:grid-cols-3">
      <label className="block">Search tokens<input className="mt-input w-full mt-2" data-token-query type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name or declared value" /></label>
      <label className="block">Token group<select className="mt-input w-full mt-2" value={group} onChange={(event) => setGroup(event.target.value)}><option value="all">All groups</option>{groups.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
      <label className="block">Export theme<select className="mt-input w-full mt-2" data-token-export-theme value={theme} onChange={(event) => setTheme(event.target.value as typeof theme)}><option value="light">Light declarations</option><option value="dark">Dark declarations</option></select></label>
    </div>
    <label className="flex gap-3 items-center min-h-11"><input data-token-dependencies type="checkbox" checked={dependencies} onChange={event=>setDependencies(event.target.checked)} />Include known alias dependencies in exports</label>
    <div className="flex flex-wrap gap-3 items-center">
      <Button data-token-copy variant="outline" onClick={() => copy(css)} disabled={!tokens.length}>Copy filtered CSS</Button>
      <a className="mt-btn mt-btn-outline mt-btn-md" href={`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify({ source: catalogue.source, theme, requested:tokens.map(token=>token.name), tokens:exported }, null, 2))}`} download="mobtranslate-tokens.json">Download filtered JSON</a>
      <Button variant="ghost" onClick={() => { setQuery(''); setGroup('all'); }}>Reset filters</Button>
    </div>
    <p data-token-status role="status" className="text-sm">{tokens.length} of {catalogue.tokens.length} tokens. {status}</p>
    <p data-token-export-scope>{exported.length} declarations in this export. {dependencies?'Known declared references, including fallback branches, are included.':'This is a filtered fragment; references may require the shared stylesheet.'} {graph.missing.length?`${graph.missing.length} referenced names are absent from this catalogue; external scope or fallback behavior needs inspection.`:''} {graph.cycles.length?`${graph.cycles.length} reference cycles found; inspect the actual CSS before adoption.`:''}</p>
    <details data-token-reference-details><summary className="min-h-11">Declared references for the current filter and export theme</summary>
      <p>The source graph preserves var() relationships. It does not evaluate the live cascade, CSS fallback selection, units or contrast. Export theme selects authored declarations independently of the page theme.</p>
      <div className="doc-table" role="region" aria-label="Declared token reference graph" tabIndex={0}><table><thead><tr><th scope="col">Name</th><th scope="col">Authored value</th><th scope="col">References</th></tr></thead><tbody>{graph.nodes.map(node=><tr key={node.name}><th scope="row">{node.name}</th><td>{node.value}</td><td>{node.references.join(', ')||'No declared var() reference'}</td></tr>)}</tbody></table></div>
      {graph.missing.length>0&&<p>Absent names: {graph.missing.join(', ')}</p>}{graph.cycles.map((cycle,index)=><p key={index}>Cycle: {cycle.join(' → ')}</p>)}
    </details>
    {!tokens.length ? <p>No tokens match. Try a shorter name or reset the filters.</p> :
      <div data-token-catalogue className="doc-table" tabIndex={0} role="region" aria-label="Scrollable token catalogue">
        <table><thead><tr><th scope="col">Token</th><th scope="col">Light declaration</th><th scope="col">Dark override</th><th scope="col">Live value</th><th scope="col">Copy</th></tr></thead><tbody>{tokens.map((token) => <tr key={token.name}>
          <th scope="row" className="font-mono whitespace-nowrap">{token.name}</th>
          <td className="font-mono">{token.value}</td>
          <td className="font-mono">{token.dark ?? 'Inherits light declaration'}</td>
          <td className="font-mono">{resolved[token.name] || 'Not available in this render'}</td>
          <td><button className="min-h-11 px-3 font-semibold" aria-label={`Copy ${token.name}`} onClick={() => copy(`${token.name}: ${theme === 'dark' ? token.dark ?? token.value : token.value};`)}>Copy</button></td>
        </tr>)}</tbody></table>
      </div>}
  </div>;
}
