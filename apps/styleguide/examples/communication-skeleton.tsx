'use client';
import { useRef, useState } from 'react';
import { Button, Skeleton } from '@mobtranslate/ui';

export function SkeletonCommunicationExample() {
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const reload = useRef<HTMLElement>(null);
  function finish(next: 'ready' | 'error') { setPhase(next); reload.current?.focus(); }
  return <div data-skeleton-lab className="space-y-4">
    <p>Skeletons reserve a content shape. They do not prove a request is progressing.</p>
    <div aria-busy={phase === 'loading'} aria-label="Local content example" role="region" className="min-h-36 space-y-3">
      {phase === 'loading' ? <div aria-hidden="true" className="space-y-3">
        <Skeleton variant="circular" width={48} height={48} />
        <Skeleton variant="text" width="70%" />
        <Skeleton variant="rounded" height={32} />
        <Skeleton variant="rectangular" height={24} width="45%" />
      </div> : phase === 'ready' ? <><h3 className="font-bold">Local example content</h3><p>The content is now available. No language entry or recording was invented.</p></> : <p>Simulated loading failure. Try loading the example again.</p>}
    </div>
    <div className="flex flex-wrap gap-3">
      <Button ref={reload} type="button" variant="outline" onClick={() => setPhase('loading')}>Load local content</Button>
      {phase === 'loading' && <><Button type="button" onClick={() => finish('ready')}>Simulate content ready</Button><Button type="button" variant="secondary" onClick={() => finish('error')}>Simulate content failure</Button></>}
    </div>
    <p role="status">{phase === 'loading' ? 'Local content loading; choose an outcome.' : phase === 'ready' ? 'Local content ready.' : 'Local content failed; retry is available.'}</p>
  </div>;
}
