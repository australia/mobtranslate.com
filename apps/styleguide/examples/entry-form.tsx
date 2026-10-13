'use client';

import { useId, useState } from 'react';
import { Button, Input } from '@mobtranslate/ui';

export function EntryFormExample() {
  const id = useId();
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  return <form noValidate className="space-y-3" onSubmit={event => {
    event.preventDefault();
    if (!text.trim()) {
      setError('Enter search text before trying this example.');
      setStatus('');
      event.currentTarget.querySelector<HTMLInputElement>('input')?.focus();
      return;
    }
    setError('');
    setStatus(`Local example received “${text}”. No search or publication was sent.`);
  }}>
    <label htmlFor={id} className="block font-medium">Search text</label>
    <Input id={id} value={text} required state={error ? 'error' : 'default'}
      aria-describedby={`${id}-help${error ? ` ${id}-error` : ''}`}
      onChange={event => { setText(event.target.value); setError(''); setStatus(''); }} />
    <p id={`${id}-help`} className="text-sm">Use your own text. This local demo does not return language content.</p>
    {error && <p id={`${id}-error`} role="alert" className="text-sm">{error}</p>}
    <Button type="submit">Try local form</Button>
    <p role="status" className="text-sm">{status}</p>
  </form>;
}
