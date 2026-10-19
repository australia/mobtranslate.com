'use client';

import { useId, useState, type CSSProperties } from 'react';
import { Button } from '@mobtranslate/ui';

type TokenStyle = CSSProperties & { [key: `--${string}`]: string };

export function LocalThemeExample() {
  const id = useId();
  const [rounded, setRounded] = useState(true);
  const [status, setStatus] = useState('');
  const style: TokenStyle = {
    '--color-primary': '#386b4f',
    '--color-primary-hover': '#2e5641',
    '--color-primary-active': '#274536',
    '--color-primary-foreground': '#faf8f5',
    '--radius-md': rounded ? 'var(--radius-lg)' : 'var(--radius-none)',
  };
  return <div className="space-y-4">
    <label htmlFor={id} className="flex items-center gap-3 min-h-11">
      <input id={id} type="checkbox" checked={rounded} onChange={event => setRounded(event.target.checked)} />
      Rounded local action
    </label>
    <div data-local-theme style={style} className="p-4 border border-[var(--color-border)] rounded-lg">
      <Button style={{minHeight:44,height:"auto",minWidth:0,maxWidth:"100%",whiteSpace:"normal",overflowWrap:"anywhere",paddingInline:".5rem"}} onClick={() => setStatus('Local themed action activated. No entry was changed.')}>Try themed action</Button>
    </div>
    <p role="status" className="text-sm">{status}</p>
    <p className="text-sm">Only this wrapper changes. Portalled overlays outside it would not inherit these overrides.</p>
  </div>;
}
