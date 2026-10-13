'use client';

import { useEffect, useState } from 'react';
import { Button } from '@mobtranslate/ui';
import catalogue from '../content/tokens.json';

function luminance(hex: string) {
  if (hex.length === 4) hex = `#${Array.from(hex.slice(1), (channel) => channel + channel).join('')}`;
  const linear = [1, 3, 5].map((start) => {
    const channel = parseInt(hex.slice(start, start + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}
export function contrastRatio(first: string, second: string) {
  const a = luminance(first), b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const tokenNames = new Set(catalogue.tokens.map((token) => token.name));
const roles = [
  { name: '--color-background', foreground: '--color-foreground' },
  ...catalogue.tokens.filter((token) => tokenNames.has(`${token.name}-foreground`)).map((token) => ({ name: token.name, foreground: `${token.name}-foreground` })),
];
export function ColorRoles() {
  const [values, setValues] = useState<Record<string, string>>({});
  useEffect(() => {
    const update = () => {
      const style = getComputedStyle(document.documentElement);
      setValues(Object.fromEntries(catalogue.tokens.filter((token) => token.name.startsWith('--color-')).map((token) => [token.name, style.getPropertyValue(token.name).trim()])));
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] });
    return () => observer.disconnect();
  }, []);
  return <div className="doc-table"><table><thead><tr><th scope="col">Role</th><th scope="col">Live background / foreground</th><th scope="col">Text contrast</th><th scope="col">Specimen</th></tr></thead><tbody>
    {roles.map((token) => {
      const background = values[token.name] ?? '';
      const foreground = values[token.foreground] ?? '';
      const measured = /^#(?:[a-f\d]{3}|[a-f\d]{6})$/i.test(background) && /^#(?:[a-f\d]{3}|[a-f\d]{6})$/i.test(foreground) ? contrastRatio(background, foreground) : null;
      return <tr key={token.name}><th scope="row" className="font-mono">{token.name}</th><td className="font-mono">{background || 'Loading…'}<br />{foreground}</td><td>{measured === null ? 'Not measured' : `${measured.toFixed(2)}:1 — ${measured >= 4.5 ? 'AA normal text passes' : 'AA normal text fails'}`}</td><td><div className="p-3 rounded" style={{ background: `var(${token.name})`, color: `var(${token.foreground})` }}>Aa · Example text</div></td></tr>;
    })}
  </tbody></table></div>;
}

export function ContrastChecker() {
  const [foreground, setForeground] = useState('#b45e2a');
  const [background, setBackground] = useState('#fffdfb');
  const valid = /^#[a-f\d]{6}$/i.test(foreground) && /^#[a-f\d]{6}$/i.test(background);
  const ratio = valid ? contrastRatio(foreground, background) : null;
  return <div className="space-y-4">
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="block">Foreground hex<input className="mt-input mt-2 w-full" value={foreground} onChange={(event) => setForeground(event.target.value)} aria-invalid={!/^#[a-f\d]{6}$/i.test(foreground)} aria-describedby="contrast-format" spellCheck={false} /></label>
      <label className="block">Background hex<input className="mt-input mt-2 w-full" value={background} onChange={(event) => setBackground(event.target.value)} aria-invalid={!/^#[a-f\d]{6}$/i.test(background)} aria-describedby="contrast-format" spellCheck={false} /></label>
    </div>
    <p id="contrast-format" className="text-sm">Enter opaque sRGB colors in #RRGGBB format. Transparency, images and gradients need a separate rendered-background assessment.</p>
    <Button variant="outline" onClick={() => { setForeground(background); setBackground(foreground); }}>Swap colors</Button>
    <div role="status" className="space-y-2">
      {ratio === null ? <p>Enter two valid hex colors to calculate contrast.</p> : <>
        <p className="font-semibold">Contrast ratio: {ratio.toFixed(2)}:1</p>
        <ul className="guidance-list"><li>AA normal text (4.5:1): {ratio >= 4.5 ? 'Pass' : 'Fail'}</li><li>AA large text (3:1): {ratio >= 3 ? 'Pass' : 'Fail'}</li><li>AAA normal text (7:1): {ratio >= 7 ? 'Pass' : 'Fail'}</li></ul>
      </>}
    </div>
    {valid && <div className="p-6 border border-[var(--color-border)] rounded-lg" style={{ color: foreground, backgroundColor: background }}><p className="text-2xl font-bold mb-2">Example heading</p><p>Example body text: source details and review status remain visible beside a result.</p></div>}
    <p className="text-sm">Pass/fail uses the unrounded ratio. This tool checks a color pair; it does not certify a page or a component’s accessibility.</p>
  </div>;
}
