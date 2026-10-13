'use client';
import { useRef, useState } from 'react';
import { Button, Chip, ChipAction, ChipToggle, type ChipProps } from '@mobtranslate/ui';

export function ChipSelectionExample() {
  const [variant, setVariant] = useState<NonNullable<ChipProps['variant']>>('filled');
  const [size, setSize] = useState<NonNullable<ChipProps['size']>>('md');
  const [filtered, setFiltered] = useState(false);
  const [included, setIncluded] = useState(true);
  const [result, setResult] = useState('No local chip action yet.');
  const restore = useRef<HTMLElement>(null);
  return <div data-chip-lab className="space-y-4">
    <label>Chip variant <select data-chip-variant className="mt-input" value={variant} onChange={event => setVariant(event.target.value as typeof variant)}>{['filled','outlined','soft'].map(item => <option key={item}>{item}</option>)}</select></label>
    <label>Chip size <select data-chip-size className="mt-input" value={size} onChange={event => setSize(event.target.value as typeof size)}>{['sm','md','lg'].map(item => <option key={item}>{item}</option>)}</select></label>
    <div className="flex flex-wrap gap-3">{(['default','primary','success','warning','error'] as const).map(color => <Chip key={color} color={color} variant={variant} size={size} data-tone={color}>{color} local label</Chip>)}</div>
    <div className="flex flex-wrap gap-3"><ChipAction onClick={() => setResult('Local assistance opened; no request was sent.')} variant={variant} size={size}>Explain local filter</ChipAction><ChipAction onClick={() => { setIncluded(true); setResult('English-only local suggestion added.'); }} variant={variant} size={size}>Add local suggestion</ChipAction><ChipToggle pressed={filtered} onPressedChange={setFiltered} variant={variant} size={size}>Bookmarked examples</ChipToggle><ChipAction disabled>Unavailable local action</ChipAction></div>
    {included && <Chip onDelete={() => { setIncluded(false); setResult('Local input chip removed. Restore remains available.'); restore.current?.focus(); }} deleteLabel="Remove English-only local suggestion" variant={variant} size={size}>English-only local suggestion</Chip>}
    <Button ref={restore} type="button" variant="outline" aria-disabled={included || undefined} onClick={() => { if (!included) { setIncluded(true); setResult('Local input chip restored.'); } }}>Restore local chip</Button>
    <ul aria-label="Local filtered examples">{[{id:"reading",title:"Local reading sample",bookmarked:true},{id:"note",title:"Local note sample",bookmarked:false}].filter(item => !filtered || item.bookmarked).map(item => <li key={item.id}>{item.title}</li>)}</ul>
    <p role="status">{result} Local filter: {filtered ? 'bookmarked examples' : 'all examples'}.</p>
  </div>;
}
