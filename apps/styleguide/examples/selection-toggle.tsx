'use client';
import { useState } from 'react';
import { Button, Toggle, ToggleGroup, ToggleGroupItem } from '@mobtranslate/ui';

export function ToggleSelectionExample() {
  const [pressed, setPressed] = useState(false);
  return <div data-toggle-lab className="space-y-4"><Toggle pressed={pressed} onPressedChange={setPressed} className={state => state.pressed ? 'local-toggle-on' : 'local-toggle-off'}>Emphasize local example</Toggle><p style={{ fontWeight: pressed ? 700 : 400 }}>This English-only sample changes its actual local emphasis.</p><Toggle disabled>Unavailable emphasis</Toggle><p role="status">Local emphasis {pressed ? 'on' : 'off'}.</p></div>;
}

export function ToggleGroupSelectionExample() {
  const [multiple, setMultiple] = useState(false);
  const [value, setValue] = useState<string[]>(['title']);
  const [vertical, setVertical] = useState(false);
  return <div data-toggle-group-lab className="space-y-4">
    <Button type="button" variant="outline" aria-pressed={multiple} onClick={() => { setMultiple(current => !current); setValue([]); }}>Allow multiple local segments</Button>
    <Button type="button" variant="outline" aria-pressed={vertical} onClick={() => setVertical(current => !current)}>Use vertical local segments</Button>
    <ToggleGroup multiple={multiple} value={value} onValueChange={setValue} orientation={vertical ? 'vertical' : 'horizontal'} aria-label="Local reading sections" className={state => state.multiple ? 'local-segments-multiple' : 'local-segments-single'}>
      <ToggleGroupItem value="title">Title section</ToggleGroupItem><ToggleGroupItem value="notes">Notes section</ToggleGroupItem><ToggleGroupItem value="unavailable" disabled>Unavailable section</ToggleGroupItem>
    </ToggleGroup>
    <div data-local-sections>{value.includes('title') && <h3 className="font-semibold">Local title section</h3>}{value.includes('notes') && <p>English-only local notes section.</p>}{value.length === 0 && <p>No local sections selected.</p>}</div>
    <p role="status">Pressed local sections: {value.join(', ') || 'none'}. {multiple ? 'Multiple choices permitted.' : 'At most one; empty is allowed.'}</p>
  </div>;
}
