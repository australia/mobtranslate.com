'use client';
import { useState } from 'react';
import { Button, Field, FieldControl, FieldDescription, FieldError, FieldLabel, FieldValidity, Fieldset, FieldsetLegend, Form, Input } from '@mobtranslate/ui';

export function RegisteredFieldExample() {
  const [disabled, setDisabled] = useState(false);
  const [result, setResult] = useState('No registered local value submitted.');
  return <div data-field-lab className="space-y-4">
    <Form onFormSubmit={values => setResult(`Registered local value: ${String(values.title ?? 'omitted')}. No data was sent.`)}>
      <Field name="title" disabled={disabled} validate={value => typeof value === 'string' && value.trim().length >= 3 ? null : 'Use at least three non-space code units for the local title.'} className={state => state.valid === false ? 'local-field-invalid' : undefined}>
        <FieldLabel>Local example title (required)</FieldLabel>
        <FieldControl data-registered-title required render={<Input />} />
        <FieldDescription>This control registers its value and description with Field.</FieldDescription>
        <FieldError />
        <FieldValidity>{validity => <p data-field-validity>Validation: {String(validity.validity.valid)}; current value: {String(validity.value ?? '')}.</p>}</FieldValidity>
      </Field>
      <Button type="submit">Submit registered field</Button>
    </Form>
    <Button type="button" variant="outline" onClick={() => setDisabled(current => !current)}>{disabled ? 'Enable registered field' : 'Disable registered field'}</Button>
    <p role="status">{result}</p>
  </div>;
}

export function FieldsetInputExample() {
  const [disabled, setDisabled] = useState(false);
  const [result, setResult] = useState('No grouped native payload inspected.');
  return <form data-fieldset-lab className="space-y-4" onSubmit={event => {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    setResult(`Native payload: ${JSON.stringify(Object.fromEntries(data))}. No data was sent.`);
  }}>
    <Fieldset disabled={disabled} className={state => state.disabled ? 'local-fieldset-disabled' : undefined}>
      <FieldsetLegend>Local example details</FieldsetLegend>
      <div className="space-y-4"><label className="block" htmlFor="group-title">Local title</label><Input id="group-title" name="groupTitle" defaultValue="Reading sample" /><label className="block" htmlFor="group-note">Local reference</label><Input id="group-note" name="groupReference" defaultValue="Example only" /></div>
    </Fieldset>
    <div className="flex flex-wrap gap-3"><Button type="button" variant="outline" onClick={() => setDisabled(current => !current)}>{disabled ? 'Enable grouped details' : 'Disable grouped details'}</Button><Button type="submit">Inspect grouped payload</Button></div>
    <p role="status">{result}</p>
  </form>;
}
