'use client';
import { useRef, useState } from 'react';
import { Button, Field, FieldControl, FieldDescription, FieldError, FieldLabel, Form, Input } from '@mobtranslate/ui';

export function ValidatedFormExample() {
  const [title, setTitle] = useState('');
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState<{title: string; email: string} | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState('Nothing has been saved. This is a local form simulation.');
  const titleInput = useRef<HTMLInputElement>(null);
  const retained = useRef<{title: string; email: string} | null>(null);
  function resolve(outcome: 'success' | 'failure' | 'cancel') {
    if (!pending) return;
    if (outcome === 'success') { retained.current = pending; setResult(`Retained local record: ${pending.title}, ${pending.email}. No server write or email occurred.`); }
    if (outcome === 'failure') { setErrors({title:'Simulated rejection. Edit the local title and retry.'}); setResult('Local submission failed. Both draft values remain available.'); }
    if (outcome === 'cancel') setResult('Local submission cancelled. Both draft values remain available.');
    setPending(null); titleInput.current?.focus();
  }
  return <div data-form-lab className="space-y-4">
    <Form errors={errors} aria-busy={Boolean(pending)} onFormSubmit={values => {
      if (pending) return;
      setErrors({}); setPending({title:String(values.title),email:String(values.email)}); setResult('Local submission pending. Choose an explicit local outcome.');
    }}>
      <Field name="title" validate={value => typeof value === 'string' && value.trim().length >= 3 ? null : 'Use at least three non-space code units for the local title.'}>
        <FieldLabel>Local record title (required)</FieldLabel>
        <FieldControl ref={titleInput} data-form-title value={title} onValueChange={setTitle} readOnly={Boolean(pending)} required render={<Input />} />
        <FieldDescription>English-only example; entered values stay in this page.</FieldDescription><FieldError />
      </Field>
      <Field name="email"><FieldLabel>Local contact email (required)</FieldLabel><FieldControl data-form-email type="email" required value={email} onValueChange={setEmail} readOnly={Boolean(pending)} autoComplete="email" render={<Input />} /><FieldDescription>Format validation does not prove ownership or delivery.</FieldDescription><FieldError match="valueMissing">Enter an email for this local example.</FieldError><FieldError match="typeMismatch">Use a valid email format for this local example.</FieldError></Field>
      <div className="flex flex-wrap gap-3"><Button type="submit" disabled={Boolean(pending)}>Submit local record</Button><Button type="button" variant="outline" disabled={Boolean(pending)} onClick={() => { setTitle(retained.current?.title ?? ''); setEmail(retained.current?.email ?? ''); setErrors({}); setResult(retained.current ? 'Restored the retained local values.' : 'Cleared the unsaved local values.'); titleInput.current?.focus(); }}>Restore retained draft</Button></div>
    </Form>
    {pending && <div className="flex flex-wrap gap-3"><Button type="button" onClick={() => resolve('success')}>Complete local form</Button><Button type="button" variant="outline" onClick={() => resolve('failure')}>Fail local form</Button><Button type="button" variant="outline" onClick={() => resolve('cancel')}>Cancel local form</Button></div>}
    <p role="status">{result}</p>
  </div>;
}
