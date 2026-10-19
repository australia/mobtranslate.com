'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { cssTokens, darkCssTokens } from '@mobtranslate/ui';

type TokenName = keyof typeof cssTokens;
const names = Object.keys(cssTokens) as TokenName[];

/** The compiled workspace exports and live inherited CSS can be inspected separately. */
export function TokenContractExample() {
  const [name, setName] = useState<TokenName>('--color-primary');
  const [dark, setDark] = useState(false);
  const [live, setLive] = useState('Reading the rendered stylesheet…');
  const [scoped, setScoped] = useState(false);
  const scope = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const read = () => {
      setDark(document.documentElement.classList.contains('dark'));
      if (scope.current) setLive(getComputedStyle(scope.current).getPropertyValue(name).trim());
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, [name, scoped]);
  return <div ref={scope} data-token-contract className="space-y-4" style={scoped ? { '--color-primary': '#123456' } as CSSProperties : undefined}>
    <label className="block" htmlFor="token-contract-name">CSS token</label>
    <select id="token-contract-name" className="mt-input w-full" value={name} onChange={(event) => setName(event.target.value as TokenName)}>
      {names.map((token) => <option key={token} value={token} data-light={cssTokens[token]} data-dark={darkCssTokens[token]}>{token}</option>)}
    </select>
    <label className="flex items-start gap-2"><input type="checkbox" checked={scoped} onChange={(event) => setScoped(event.target.checked)} />Override primary inside this example with #123456</label>
    <dl className="space-y-2" style={{ overflowWrap: 'anywhere' }}>
      <div><dt>Authored {dark ? 'dark' : 'light'} value from TypeScript</dt><dd><code data-token-authored>{(dark ? darkCssTokens : cssTokens)[name]}</code></dd></div>
      <div><dt>Live inherited CSS value</dt><dd><code data-token-live>{live || 'Missing CSS declaration'}</code></dd></div>
    </dl>
    <p role="status">{scoped ? 'Local primary override applied. The authored snapshot remains unchanged.' : 'Reading the page theme without a local override.'}</p>
    <p>Values containing var() resolve in the browser. Imported objects are snapshots; they do not watch theme changes, local overrides, fonts or viewport geometry.</p>
  </div>;
}
