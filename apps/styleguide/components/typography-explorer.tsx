'use client';

import { useEffect, useState } from 'react';
import catalogue from '../content/tokens.json';
import font from '../public/fonts/roboto-flex.json';
import './typography-explorer.css';

const sizes = catalogue.tokens.filter(token => token.name.startsWith('--text-')).sort((a, b) => parseFloat(a.value) - parseFloat(b.value));
const defaults = Object.fromEntries(font.axes.map(axis => [axis.tag, axis.default]));

export function TypographyExplorer() {
  const [text, setText] = useState('Language first. Always.');
  const [size, setSize] = useState('--text-2xl');
  const [family, setFamily] = useState('--font-sans');
  const [weight, setWeight] = useState('600');
  const [leading, setLeading] = useState('1.5');
  const [tracking, setTracking] = useState('0');
  const [tabular, setTabular] = useState(false);
  const [axes, setAxes] = useState(defaults);
  const [loaded, setLoaded] = useState<'idle' | 'loading' | 'ready' | 'failed'>('idle');
  const [attempt, setAttempt] = useState(0);
  const variable = family === 'local-variable';
  useEffect(() => {
    if (!variable) return;
    let current = true;
    Promise.resolve().then(() => document.fonts?.load(`400 24px "${font.family}"`) ?? []).then(faces => {
      if (current) setLoaded(faces.length > 0 && faces.every(face => face.status === 'loaded') ? 'ready' : 'failed');
    }, () => { if (current) setLoaded('failed'); });
    return () => { current = false; };
  }, [variable, attempt]);
  const activeFamily = variable ? loaded === 'ready' ? `"${font.family}", system-ui, sans-serif` : 'var(--font-sans)' : `var(${family})`;
  const manualOptical = variable && loaded === 'ready';
  const variation = font.axes.map(axis => `"${axis.tag}" ${axes[axis.tag]}`).join(', ');
  const axisControls = (hidden: boolean) => font.axes.filter(axis => axis.hidden === hidden).map(axis => <label key={axis.tag}>
    {axis.name} ({axis.tag}) · {axes[axis.tag]} <span className="type-axis-range">({axis.min} to {axis.max})</span>
    <input data-type-axis={axis.tag} type="range" min={axis.min} max={axis.max} step="1" value={axes[axis.tag]} disabled={loaded !== 'ready'} onChange={event => setAxes(previous => ({...previous, [axis.tag]: Number(event.target.value)}))} />
  </label>);
  return <div className="type-lab" data-type-lab>
    <label>Preview text<textarea data-type-text className="mt-input" rows={3} value={text} onChange={event => setText(event.target.value)} /></label>
    <div className="grid gap-4 sm:grid-cols-2">
      <label>Type size<select data-type-size className="mt-input" value={size} onChange={event => setSize(event.target.value)}>{sizes.map(token => <option key={token.name} value={token.name}>{token.name} · {token.value}</option>)}</select></label>
      <label>Font family<select data-type-family className="mt-input" value={family} onChange={event => {setFamily(event.target.value);setLoaded(event.target.value === 'local-variable' ? 'loading' : 'idle');}}>{catalogue.tokens.filter(token => token.name.startsWith('--font-')).map(token => <option key={token.name} value={token.name}>{token.name}</option>)}<option value="local-variable">Local Roboto Flex specimen</option></select></label>
      <label>Font weight<select data-type-weight className="mt-input" disabled={variable} value={weight} onChange={event => setWeight(event.target.value)}>{[400,500,600,700].map(value => <option key={value}>{value}</option>)}</select>{variable && <span>Use the wght axis below; it overrides this ordinary weight setting.</span>}</label>
      <label>Line height<select data-type-leading className="mt-input" value={leading} onChange={event => setLeading(event.target.value)}>{[1.25,1.5,1.75,2,2.5,3].map(value => <option key={value}>{value}</option>)}</select></label>
      <label>Letter spacing<select data-type-tracking className="mt-input" value={tracking} onChange={event => setTracking(event.target.value)}>{[0,0.02,0.05,0.12].map(value => <option key={value} value={value}>{value}em</option>)}</select></label>
      <label className="type-checkbox"><input data-type-tabular type="checkbox" checked={tabular} onChange={event => setTabular(event.target.checked)} />Tabular numbers, when supported by the face</label>
    </div>
    {variable && <div>
      <p role="status" data-type-font-status>{loaded === 'ready' ? 'Local variable font loaded. Axis controls are available.' : loaded === 'failed' ? 'Local font could not load. Text uses fallback; axes are unavailable. Choose another family or retry.' : 'Loading the local variable font. Text remains available in fallback.'}</p>
      <fieldset><legend>Variable-font axes</legend><div className="type-axis-grid">{axisControls(false)}</div></fieldset>
      <details data-type-advanced><summary>Advanced font inspection axes</summary><p>These axes carry the font’s hidden flag. They are exposed here for specialized font inspection, rather than as ordinary product preferences.</p><div className="type-axis-grid">{axisControls(true)}</div></details>
      <button data-type-axis-reset type="button" onClick={() => setAxes({...defaults})}>Reset all axes</button>
      <button data-type-font-retry type="button" aria-disabled={loaded === 'loading'} onClick={() => {if (loaded === 'loading') return;setLoaded('loading');setAttempt(previous => previous + 1);}}>Retry local font</button><button data-type-font-fallback type="button" onClick={() => {setFamily('--font-sans');setLoaded('idle');}}>Return to fallback family</button>
    </div>}
    <div data-typography-preview style={{fontSize:`var(${size})`,fontFamily:activeFamily,fontWeight:Number(weight),lineHeight:leading,letterSpacing:`${tracking}em`,fontVariantNumeric:tabular ? 'tabular-nums' : 'normal',fontOpticalSizing:manualOptical ? 'none' : 'auto',fontVariationSettings:variable && loaded === 'ready' ? variation : 'normal'}}>{text || 'Enter text to preview it.'}</div>
    <p>The ordinary stacks are requests; the browser may use fallback. The local variable specimen has its own licensed font file and does not change product fonts. This is your input, not language evidence or script identification.</p>
    <details data-type-css><summary>Current CSS and font provenance</summary><pre><code>{`font-family: ${activeFamily};\nfont-size: var(${size});\nfont-weight: ${weight};\nline-height: ${leading};\nletter-spacing: ${tracking}em;\nfont-variant-numeric: ${tabular ? 'tabular-nums' : 'normal'};\nfont-optical-sizing: ${manualOptical ? 'none' : 'auto'};\nfont-variation-settings: ${variable && loaded === 'ready' ? variation : 'normal'};`}</code></pre><p>Manual opsz uses this font’s coordinates, independently of CSS text size. Changing size does not change that axis automatically.</p><p>Roboto Flex, unchanged binary, {font.font.bytes} bytes. <a href={font.license.source}>License</a> · <a href={font.font.source}>Frozen upstream file</a>. SHA-256: <code>{font.font.sha256}</code>.</p></details>
  </div>;
}
