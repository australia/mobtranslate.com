'use client';
import { useRef, useState } from 'react';
import { Button, RadioGroup, RadioItem, Switch } from '@mobtranslate/ui';

export function RadioSelectionExample() {
  const [value, setValue] = useState('compact');
  const [readOnly, setReadOnly] = useState(false);
  const [result, setResult] = useState('No local radio form submitted.');
  const [required,setRequired]=useState(false);
  const [invalid,setInvalid]=useState(false);
  const first=useRef<HTMLElement>(null);
  const effective=value||'compact';
  return <div data-radio-lab className="space-y-4">
    <Button type="button" variant="outline" aria-pressed={readOnly} onClick={() => setReadOnly(current => !current)}>Make local radio group read-only</Button>
    <div className="flex flex-wrap gap-3"><Button type="button" variant="outline" aria-pressed={required} onClick={()=>{setRequired(current=>!current);setValue('');setInvalid(false);setResult('No new local radio form submitted.');}}>Require an explicit radio choice</Button><Button data-radio-restore type="button" variant="outline" onClick={()=>{setRequired(false);setValue('compact');setReadOnly(false);setInvalid(false);}}>Restore initial radio sample</Button></div>
    <form noValidate className="space-y-3" onSubmit={event => { event.preventDefault(); if(required&&!value){setInvalid(true);first.current?.focus();return;}setInvalid(false);setResult(`Local FormData density=${new FormData(event.currentTarget).get('density')}.`); }}>
      <fieldset><legend className="font-semibold">Local reading density</legend>
        <RadioGroup name="density" value={value} readOnly={readOnly} required={required} aria-invalid={invalid||undefined} aria-describedby={invalid?'radio-required-error':undefined} onValueChange={next => { if (typeof next === 'string') {setValue(next);setInvalid(false);} }} aria-label="Local reading density">
          <RadioItem ref={first} value="compact" label="Compact reading" /><RadioItem value="comfortable" label="Comfortable reading" /><RadioItem value="unavailable" label="Unavailable reading option" disabled />
        </RadioGroup>
        {invalid&&<p id="radio-required-error" role="alert">Choose a reading density before submitting.</p>}
      </fieldset>
      <Button type="submit">Submit radio sample</Button>
    </form>
    <p dir="auto" data-density-sample style={{lineHeight:effective === 'compact' ? 1.5 : 1.75, paddingBlock:effective === 'compact' ? 8 : 16}}>This English-only reading sample changes its local spacing without changing the text or any source record.</p>
    <p role="status" dir="auto">Selected local density: {value||'(none)'}. {value?'':'The preview retains compact baseline spacing until a choice is made. '}{result}</p>
  </div>;
}

export function SwitchSelectionExample() {
  const [checked, setChecked] = useState(false);
  const [details,setDetails]=useState(false);
  const [pending, setPending] = useState(false);
  const [requested, setRequested] = useState(false);
  const [result, setResult] = useState('Local reminders are off.');
  const control = useRef<HTMLElement>(null);
  return <div data-switch-lab className="space-y-4">
    <Switch ref={control} label="Local example reminders" checked={checked} readOnly={pending} aria-describedby="local-switch-state" onCheckedChange={next => { if (!pending) { setRequested(next); setPending(true); setResult('Local change pending; current setting is retained until an outcome.'); } }} />
    <p id="local-switch-state" role="status">{result}</p>
    {pending && <div className="flex flex-wrap gap-3"><Button type="button" onClick={() => { setChecked(requested); setPending(false); control.current?.focus(); setResult(`Local reminders are ${requested ? 'on' : 'off'}. No reminder was scheduled.`); }}>Apply local switch change</Button><Button type="button" variant="secondary" onClick={() => { setPending(false); control.current?.focus(); setResult('Simulated change failed. Previous local setting remains; retry is available.'); }}>Fail local switch change</Button></div>}
    <Switch label="Disabled on sample" checked disabled />
    <Switch label="Show local example details" checked={details} onCheckedChange={setDetails} aria-controls="local-switch-details" />
    <div id="local-switch-details" hidden={!details}>These English-only local details appear immediately. No apply action or request is required for this display setting.</div>
    <p dir="auto">The stable label names the feature. The checked state describes the retained setting, not the requested change.</p>
  </div>;
}
