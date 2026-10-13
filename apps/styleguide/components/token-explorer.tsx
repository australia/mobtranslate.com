'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@mobtranslate/ui';
import catalogue from '../content/tokens.json';

export function TokenExplorer() {
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('all');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [resolved, setResolved] = useState<Record<string, string>>({});
  const [status, setStatus] = useState('');
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
  const css = `:root {\n${tokens.map((token) => `  ${token.name}: ${theme === 'dark' ? token.dark ?? token.value : token.value};`).join('\n')}\n}`;

  const copy = async (value: string) => {
    try { await navigator.clipboard.writeText(value); setStatus('Copied to clipboard.'); }
    catch { setStatus('Clipboard unavailable. Select the token name and value to copy them manually.'); }
  };

  return <div className="space-y-4">
    <div className="grid gap-4 sm:grid-cols-3">
      <label className="block">Search tokens<input className="mt-input w-full mt-2" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name or declared value" /></label>
      <label className="block">Token group<select className="mt-input w-full mt-2" value={group} onChange={(event) => setGroup(event.target.value)}><option value="all">All groups</option>{groups.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
      <label className="block">Export theme<select className="mt-input w-full mt-2" value={theme} onChange={(event) => setTheme(event.target.value as typeof theme)}><option value="light">Light declarations</option><option value="dark">Dark declarations</option></select></label>
    </div>
    <div className="flex flex-wrap gap-3 items-center">
      <Button variant="outline" onClick={() => copy(css)} disabled={!tokens.length}>Copy filtered CSS</Button>
      <a className="mt-btn mt-btn-outline mt-btn-md" href={`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify({ source: catalogue.source, tokens }, null, 2))}`} download="mobtranslate-tokens.json">Download filtered JSON</a>
      <Button variant="ghost" onClick={() => { setQuery(''); setGroup('all'); }}>Reset filters</Button>
    </div>
    <p role="status" className="text-sm">{tokens.length} of {catalogue.tokens.length} tokens. {status}</p>
    {!tokens.length ? <p>No tokens match. Try a shorter name or reset the filters.</p> :
      <div className="doc-table" tabIndex={0} role="region" aria-label="Scrollable token catalogue">
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
