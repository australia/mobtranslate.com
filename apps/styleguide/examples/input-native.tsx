'use client';
import { useRef, useState } from 'react';
import { Button, Input, Textarea, type InputProps } from '@mobtranslate/ui';

export function NativeInputExample() {
  const [value, setValue] = useState('');
  const [variant, setVariant] = useState<NonNullable<InputProps['variant']>>('outline');
  const [size, setSize] = useState<NonNullable<InputProps['size']>>('md');
  const [readOnly, setReadOnly] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState('No local input submitted.');
  const input = useRef<HTMLInputElement>(null);
  return <form data-native-input-lab noValidate className="space-y-4" onSubmit={event => {
    event.preventDefault();
    if (!disabled && !value.trim()) { setError('Enter a local display label.'); input.current?.focus(); return; }
    setError(''); setResult(`Local FormData: ${new FormData(event.currentTarget).get('displayLabel') ?? 'displayLabel omitted (disabled)'}. No data was sent.`);
  }}>
    <div className="flex flex-wrap gap-3"><label>Appearance <select data-input-variant className="mt-input" value={variant} onChange={event => setVariant(event.target.value as typeof variant)}><option>outline</option><option>filled</option></select></label><label>Density <select data-input-size className="mt-input" value={size} onChange={event => setSize(event.target.value as typeof size)}><option>sm</option><option>md</option><option>lg</option></select></label></div>
    <label htmlFor="native-display-label">Local display label (required when available)</label>
    <Input ref={input} id="native-display-label" name="displayLabel" value={value} onChange={event => { setValue(event.target.value); setError(''); }} variant={variant} size={size} readOnly={readOnly} disabled={disabled} required autoComplete="off" maxLength={80} aria-describedby={error ? 'native-input-help native-input-error' : 'native-input-help'} state={error ? 'error' : 'default'} />
    <p id="native-input-help">English-only local example. A visible label remains when the value is filled.</p>
    {error && <p id="native-input-error" role="alert">{error}</p>}
    <div className="flex flex-wrap gap-3"><Button type="button" variant="outline" onClick={() => setReadOnly(current => !current)}>{readOnly ? 'Allow local input editing' : 'Make local input read-only'}</Button><Button type="button" variant="outline" onClick={() => setDisabled(current => !current)}>{disabled ? 'Enable local input' : 'Disable local input'}</Button><Button type="submit">Submit native input</Button></div>
    <p role="status">{result}</p>
  </form>;
}

export function NativeTextareaExample() {
  const [value, setValue] = useState('');
  const [readOnly, setReadOnly] = useState(false);
  const [resize, setResize] = useState<'none' | 'vertical' | 'horizontal' | 'both'>('vertical');
  const [error, setError] = useState('');
  const [result, setResult] = useState('No local note submitted.');
  const textarea = useRef<HTMLTextAreaElement>(null);
  return <form data-textarea-lab noValidate className="space-y-4" onSubmit={event => {
    event.preventDefault();
    if (!value.trim()) { setError('Write a local example note before submitting.'); textarea.current?.focus(); return; }
    setError(''); setResult(`Local note retained: ${String(new FormData(event.currentTarget).get('note'))}. No data was sent.`);
  }}>
    <label htmlFor="native-note">Local example note (required)</label>
    <Textarea ref={textarea} id="native-note" name="note" value={value} onChange={event => { setValue(event.target.value); setError(''); }} rows={4} maxLength={120} required readOnly={readOnly} resize={resize} state={error ? 'error' : 'default'} aria-describedby={error ? 'native-note-help native-note-error' : 'native-note-help'} />
    <p id="native-note-help">{value.length} of 120 UTF-16 code units. This browser limit is not a count of spoken words or graphemes.</p>
    {error && <p id="native-note-error" role="alert">{error}</p>}
    <label>Resize behavior <select data-textarea-resize className="mt-input" value={resize} onChange={event => setResize(event.target.value as typeof resize)}>{['none','vertical','horizontal','both'].map(item => <option key={item}>{item}</option>)}</select></label>
    <div className="flex flex-wrap gap-3"><Button type="button" variant="outline" onClick={() => setReadOnly(current => !current)}>{readOnly ? 'Allow local note editing' : 'Make local note read-only'}</Button><Button type="submit">Submit native note</Button></div>
    <p role="status">{result}</p>
  </form>;
}
