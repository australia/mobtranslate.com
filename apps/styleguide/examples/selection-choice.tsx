'use client';
import { useRef, useState } from 'react';
import { Button, RadioGroup, RadioItem, Switch } from '@mobtranslate/ui';

export function RadioSelectionExample() {
  const [value, setValue] = useState('compact');
  const [readOnly, setReadOnly] = useState(false);
  const [result, setResult] = useState('No local radio form submitted.');
  return <div data-radio-lab className="space-y-4">
    <Button type="button" variant="outline" aria-pressed={readOnly} onClick={() => setReadOnly(current => !current)}>Make local radio group read-only</Button>
    <form className="space-y-3" onSubmit={event => { event.preventDefault(); setResult(`Local FormData density=${new FormData(event.currentTarget).get('density')}.`); }}>
      <fieldset><legend className="font-semibold">Local reading density</legend>
        <RadioGroup name="density" value={value} readOnly={readOnly} onValueChange={next => { if (typeof next === 'string') setValue(next); }} aria-label="Local reading density">
          <RadioItem value="compact" label="Compact reading" /><RadioItem value="comfortable" label="Comfortable reading" /><RadioItem value="unavailable" label="Unavailable reading option" disabled />
        </RadioGroup>
      </fieldset>
      <Button type="submit">Submit radio sample</Button>
    </form>
    <p data-density-sample style={{lineHeight:value === 'compact' ? 1.5 : 1.75, paddingBlock:value === 'compact' ? 8 : 16}}>This English-only reading sample changes its local spacing without changing the text or any source record.</p>
    <p role="status">Selected local density: {value}. {result}</p>
  </div>;
}

export function SwitchSelectionExample() {
  const [checked, setChecked] = useState(false);
  const [pending, setPending] = useState(false);
  const [requested, setRequested] = useState(false);
  const [result, setResult] = useState('Local reminders are off.');
  const control = useRef<HTMLElement>(null);
  return <div data-switch-lab className="space-y-4">
    <Switch ref={control} label="Local example reminders" checked={checked} readOnly={pending} aria-describedby="local-switch-state" onCheckedChange={next => { if (!pending) { setRequested(next); setPending(true); setResult('Local change pending; current setting is retained until an outcome.'); } }} />
    <p id="local-switch-state" role="status">{result}</p>
    {pending && <div className="flex flex-wrap gap-3"><Button type="button" onClick={() => { setChecked(requested); setPending(false); control.current?.focus(); setResult(`Local reminders are ${requested ? 'on' : 'off'}. No reminder was scheduled.`); }}>Apply local switch change</Button><Button type="button" variant="secondary" onClick={() => { setPending(false); control.current?.focus(); setResult('Simulated change failed. Previous local setting remains; retry is available.'); }}>Fail local switch change</Button></div>}
    <Switch label="Disabled on sample" checked disabled />
    <p>The stable label names the feature. The checked state describes the retained setting, not the requested change.</p>
  </div>;
}
