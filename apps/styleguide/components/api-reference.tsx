'use client';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@mobtranslate/ui';
import type { APIEntry, APIIndex } from '../lib/api/types';
import { CodeBlock } from './code-block';

export function APIReference({index,initial}: {index:APIIndex;initial:APIEntry}) {
  const [ready,setReady] = useState(false);
  const [query,setQuery] = useState('');
  const [selected,setSelected] = useState(initial.name);
  const [entry,setEntry] = useState<APIEntry | null>(initial);
  const [propQuery,setPropQuery] = useState('');
  const [scope,setScope] = useState('local');
  const [status,setStatus] = useState('');
  const [retry,setRetry] = useState(0);
  const epoch = useRef(0);
  const exports = index.exports.filter(item=>item.name.toLocaleLowerCase('en').includes(query.trim().toLocaleLowerCase('en')));
  useEffect(()=>{
    setReady(true);
    const reveal=()=>{
      const name=location.hash.startsWith('#api-') ? location.hash.slice(5) : '';
      if (index.exports.some(item=>item.name===name)) {setQuery('');setSelected(name);setPropQuery('');}
    };
    reveal();window.addEventListener('hashchange',reveal);
    return ()=>window.removeEventListener('hashchange',reveal);
  },[index]);
  useEffect(()=>{
    const id=++epoch.current;
    const controller=new AbortController();
    if (selected===initial.name && retry===0) {setEntry(initial);setStatus('');return ()=>controller.abort();}
    setEntry(null);setStatus(`Loading ${selected}…`);
    async function load() {
      try {
        const response=await fetch(`/api-reference/${encodeURIComponent(selected)}.json`,{signal:controller.signal});
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data:APIEntry=await response.json();
        if (data.name!==selected || data.revision!==index.revision || !Array.isArray(data.props) || !Array.isArray(data.sites) || !Array.isArray(data.signatures) || !Array.isArray(data.topics) || typeof data.definition!=='string') throw new Error('Reference version or format differs.');
        if (id===epoch.current && !controller.signal.aborted) {setEntry(data);setStatus(`${selected} reference loaded.`);}
      } catch {
        if (id===epoch.current && !controller.signal.aborted) setStatus(`Could not load ${selected}. Retry, or read the declaration in your installed workspace.`);
      }
    }
    void load();return ()=>controller.abort();
  },[selected,retry,index.revision,initial]);
  function choose(name:string) {
    setSelected(name);setPropQuery('');
    history.replaceState(null,'',`#api-${name}`);
  }
  const current=entry?.name===selected ? entry : null;
  const props=current?.props.filter(prop=>(scope==='all'||prop.locallyDeclared) && `${prop.name} ${prop.type} ${prop.documentation}`.toLocaleLowerCase('en').includes(propQuery.trim().toLocaleLowerCase('en'))) ?? [];
  return <div data-api-ready={ready}>
    <div className="space-y-3 mb-6">
      <label htmlFor="api-query" className="block">Find an exported name</label>
      <input id="api-query" type="search" className="mt-input w-full" disabled={!ready} value={query} onChange={event=>setQuery(event.target.value)} aria-describedby="api-query-help" />
      <p id="api-query-help">Case-insensitive name matching. {exports.length} of {index.exports.length} exports match. Filtering this list keeps the current reference visible.</p>
      <label htmlFor="api-export" className="block">Export to inspect</label>
      <select id="api-export" className="mt-input w-full" disabled={!ready} value={selected} onChange={event=>choose(event.target.value)}>
        {!exports.some(item=>item.name===selected)&&<option value={selected}>{selected} (current, outside filter)</option>}
        {exports.map(item=><option value={item.name} key={item.name}>{item.name} · {item.kind}</option>)}
      </select>
      {!exports.length&&<p>No exported names match. Clear the name filter to browse the register.</p>}
      <Button type="button" variant="outline" disabled={!ready} onClick={()=>{setQuery('');setPropQuery('');setScope('local');document.getElementById('api-query')?.focus();}}>Clear API filters</Button>
      <p role="status" data-api-status>{status}</p>
      {!current&&<Button type="button" disabled={!ready||status.startsWith('Loading ')} onClick={()=>setRetry(value=>value+1)}>Retry API reference</Button>}
    </div>
    {current&&<section aria-labelledby="api-selected-name" data-api-entry={current.name}>
      <h3 id="api-selected-name" className="text-2xl font-semibold mb-3">{current.name}</h3>
      <p className="mb-3">{current.kind} · {current.runtime?'Runtime export':'Type-only export; import with import type'}.</p>
      {!!current.topics.length&&<div className="doc-links mb-4">{current.topics.map(topic=><a key={topic.href} href={topic.href}>{topic.label} behavior and usage</a>)}</div>}
      {current.documentation&&<p className="mb-3 whitespace-pre-wrap">{current.documentation}</p>}
      <p>Declaration locations in the installed source:</p>
      <ul className="guidance-list">{current.sites.map(site=><li key={`${site.file}:${site.line}`}><code>{site.file}:{site.line}</code></li>)}</ul>
      {current.signatures.map((signature,position)=><CodeBlock key={position} language="typescript" code={signature} />)}
      {current.definition&&<CodeBlock language="typescript" code={current.definition} />}
      {current.props.length>0&&<>
        <div className="space-y-3 mt-6 mb-4">
          <label htmlFor="api-prop-query" className="block">Find a prop, accepted type or declaration comment</label>
          <input id="api-prop-query" type="search" className="mt-input w-full" value={propQuery} onChange={event=>setPropQuery(event.target.value)} />
          <label htmlFor="api-prop-scope" className="block">Prop scope</label>
          <select id="api-prop-scope" className="mt-input w-full" value={scope} onChange={event=>setScope(event.target.value)}><option value="local">Declared in this UI package</option><option value="all">All accepted props, including inherited</option></select>
          <p role="status" data-api-prop-count>{props.length} of {current.props.length} accepted props shown.</p>
          <p>Optional means TypeScript permits omission; it does not specify the runtime default. Source comments below are declarations, not observed behavior. Use the authored component guidance for defaults, state ownership, events and accessibility.</p>
        </div>
        {!props.length?<p>No props match this scope and filter. Choose all accepted props to inspect inherited contracts.</p>:<div className="doc-table" role="region" tabIndex={0} aria-label={`${current.name} accepted props`}>
          <table><thead><tr><th scope="col">Prop</th><th scope="col">Accepted type</th><th scope="col">Declaration and comments</th></tr></thead><tbody>{props.map(prop=><tr key={prop.name} data-api-prop={prop.name}>
            <th scope="row"><code>{prop.name}</code><p>{prop.optional?'Optional':'Required'}</p></th>
            <td><code className="whitespace-pre-wrap break-words">{prop.type}</code></td>
            <td><p>{prop.locallyDeclared?'Declared in the UI package':'Inherited declaration'}</p><ul className="guidance-list">{prop.declarations.map(site=><li key={`${site.file}:${site.line}`}><code>{site.file}:{site.line}</code></li>)}</ul>{prop.documentation&&<p className="whitespace-pre-wrap">{prop.documentation}</p>}{prop.tags.map((tag,position)=><p key={position}><strong>@{tag.name} </strong>{tag.text}</p>)}</td>
          </tr>)}</tbody></table>
        </div>}
      </>}
      {!current.props.length&&<p className="mt-4">No component-prop object is exposed by this export. Inspect its declaration or call signature above.</p>}
    </section>}
  </div>;
}
