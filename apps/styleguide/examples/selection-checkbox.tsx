'use client';
import { useRef, useState } from 'react';
import { Button, Checkbox, CheckboxGroup } from '@mobtranslate/ui';

export function CheckboxSelectionExample() {
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState('No local form has been submitted.');
  const control = useRef<HTMLElement>(null);
  return <div data-checkbox-lab className="space-y-4">
    <form noValidate className="space-y-3" onSubmit={event => {
      event.preventDefault();
      if (!checked) { setError('Include explanatory notes before submitting this local sample.'); control.current?.focus(); return; }
      setError(''); setResult(`Local FormData: notes=${new FormData(event.currentTarget).get('notes')}. No request was sent.`);
    }}>
      <Checkbox ref={control} label="Include explanatory notes" name="notes" value="include" uncheckedValue="omit" required checked={checked} onCheckedChange={next => { setChecked(next); setError(''); }} aria-invalid={!!error || undefined} aria-describedby={error ? 'local-checkbox-error' : undefined} className={state => state.checked ? 'local-checkbox-checked' : 'local-checkbox-unchecked'} />
      {error && <p id="local-checkbox-error" role="alert">{error}</p>}
      <Button type="submit">Submit local checkbox sample</Button>
    </form>
    <Checkbox label="Read-only checked sample" checked readOnly />
    <Checkbox label="Disabled unchecked sample" disabled />
    <p role="status">{result}</p>
  </div>;
}

export function CheckboxGroupSelectionExample() {
  const options = ['text','audio','images'];
  const [selected, setSelected] = useState<string[]>(['text']);
  const [disabled, setDisabled] = useState(false);
  const [result, setResult] = useState('No local grouped form submitted.');
  return <div data-checkbox-group-lab className="space-y-4">
    <Button type="button" variant="outline" aria-pressed={disabled} onClick={() => setDisabled(current => !current)}>Disable local checkbox group</Button>
    <form className="space-y-3" onSubmit={event => { event.preventDefault(); setResult(`Local FormData resources: ${new FormData(event.currentTarget).getAll('resource').join(', ') || 'none'}.`); }}>
      <fieldset><legend className="font-semibold">Local resource format filters</legend><p>Selection describes this sample, not permission to use any recording or image.</p>
        <CheckboxGroup value={selected} allValues={options} onValueChange={setSelected} disabled={disabled} aria-label="Local resource format filters" className={state => state.disabled ? 'local-group-disabled' : 'local-group-enabled'}>
          <Checkbox parent label="Select all local formats" />
          {options.map(value => <Checkbox key={value} value={value} name="resource" label={`Include ${value} samples`} />)}
        </CheckboxGroup>
      </fieldset>
      <Button type="submit">Submit grouped sample</Button>
    </form>
    <p role="status">Selected local formats: {selected.join(', ') || 'none'}. {result}</p>
  </div>;
}
