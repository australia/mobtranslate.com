'use client';
import { useState } from 'react';
import { Button, Field, FieldDescription, FieldLabel, Form, NumberField, NumberFieldDecrement, NumberFieldGroup, NumberFieldIncrement, NumberFieldInput } from '@mobtranslate/ui';

export function NumberInputExample() {
  const [value, setValue] = useState<number | null>(2.5);
  const [disabled, setDisabled] = useState(false);
  const [readOnly, setReadOnly] = useState(false);
  const [locale, setLocale] = useState('en-AU');
  const [committed, setCommitted] = useState('No committed local adjustment.');
  const [result, setResult] = useState('No local numeric payload inspected.');
  return <div data-number-lab className="space-y-4">
    <label>Number format locale <select data-number-locale className="mt-input" value={locale} onChange={event => setLocale(event.target.value)}><option>en-AU</option><option>de-DE</option></select></label>
    <Form onSubmit={event => { event.preventDefault(); setResult(`Native numeric payload: ${String(new FormData(event.currentTarget).get('sampleAmount') ?? 'omitted')}. No data was sent.`); }}>
      <Field name="sampleAmount"><FieldLabel>Local sample amount (0–10 units)</FieldLabel>
        <NumberField value={value} onValueChange={setValue} onValueCommitted={next => setCommitted(`Committed numeric value: ${next === null ? 'empty' : next}.`)} min={0} max={10} step={0.5} largeStep={2} smallStep={0.1} locale={locale} format={{maximumFractionDigits:1}} disabled={disabled} readOnly={readOnly} className={state => state.value === null ? 'local-number-empty' : undefined}>
          <NumberFieldGroup><NumberFieldDecrement aria-label="Decrease local sample amount" /><NumberFieldInput data-number-input /><NumberFieldIncrement aria-label="Increase local sample amount" /></NumberFieldGroup>
        </NumberField><FieldDescription>Optional quantity. Empty is null, distinct from zero. Type or use buttons and arrow keys; wheel scrubbing is off.</FieldDescription>
      </Field><Button type="submit">Inspect numeric payload</Button>
    </Form>
    <div className="flex flex-wrap gap-3"><Button type="button" variant="outline" onClick={() => setReadOnly(current => !current)}>{readOnly ? 'Allow numeric editing' : 'Make number read-only'}</Button><Button type="button" variant="outline" onClick={() => setDisabled(current => !current)}>{disabled ? 'Enable local number' : 'Disable local number'}</Button></div>
    <p data-number-value>Raw value: {value === null ? 'empty' : value}. {committed}</p><p role="status">{result}</p>
  </div>;
}
