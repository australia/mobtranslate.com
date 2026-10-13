'use client';
import { useState } from 'react';
import { Button, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, type CardProps } from '@mobtranslate/ui';

export function CardContainmentExample() {
  const [variant, setVariant] = useState<NonNullable<CardProps['variant']>>('outlined');
  const [saved, setSaved] = useState(false);
  return <div data-card-lab className="space-y-4">
    <label>Card surface <select className="mt-input" value={variant} onChange={event => setVariant(event.target.value as typeof variant)}>{['default','filled','outlined','elevated'].map(item => <option key={item}>{item}</option>)}</select></label>
    <Card variant={variant} role="region" aria-labelledby="local-card-title">
      <CardHeader><CardTitle id="local-card-title">Local reading collection</CardTitle><CardDescription>An English-only example with explicit actions.</CardDescription></CardHeader>
      <CardContent><p>The container itself is not clickable. Open the related guidance or change this local bookmark.</p></CardContent>
      <CardFooter><a className="mt-btn mt-btn-outline mt-btn-md" href="/patterns/notifications">Read recovery guidance</a><Button type="button" variant="secondary" aria-pressed={saved} onClick={() => setSaved(current => !current)}>{saved ? 'Remove local bookmark' : 'Bookmark locally'}</Button></CardFooter>
    </Card>
    <p role="status">{saved ? 'Local bookmark added; nothing was sent or persisted.' : 'Collection is not locally bookmarked.'}</p>
  </div>;
}
