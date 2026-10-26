'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, Plus } from 'lucide-react';
import type { FieldTarget } from '@/lib/research/field/types';
import { useEngineJob } from './useEngineJob';

const API = '/api/admin/research/field';

type EngineStatus = {
  available: boolean;
  health?: {
    registryId: string;
    regionalMissing: string[];
    area: { id: string; title: string } | null;
    areaReady: boolean;
  };
  features?: Array<{ id: string; title: string; group: string; scale: string }>;
};

export default function FieldTargets() {
  const [targets, setTargets] = useState<FieldTarget[] | null>(null);
  const [engine, setEngine] = useState<EngineStatus | null>(null);
  const [name, setName] = useState('');
  const [names, setNames] = useState('');
  const [error, setError] = useState<string | null>(null);
  const job = useEngineJob(() => void refresh());

  const refresh = useCallback(async () => {
    const [t, e] = await Promise.all([
      fetch(`${API}/targets`, { cache: 'no-store' }).then((r) => r.json()),
      fetch(`${API}/engine`, { cache: 'no-store' }).then((r) => r.json()),
    ]);
    setTargets((t as { targets: FieldTarget[] }).targets);
    setEngine(e as EngineStatus);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const response = await fetch(`${API}/targets`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name,
        scientificNames: names.split(/[,\n]/).map((n) => n.trim()).filter(Boolean),
      }),
    });
    if (!response.ok) {
      setError('Could not create the target.');
      return;
    }
    setName('');
    setNames('');
    await refresh();
  }

  async function build(action: 'build-area' | 'build-regional') {
    const response = await fetch(`${API}/engine`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    const body = (await response.json()) as { jobId?: string };
    if (body.jobId) job.watch(body.jobId);
  }

  const health = engine?.health;
  const localFeatures = engine?.features?.filter((f) => f.scale === 'local') ?? [];
  const regionalFeatures = engine?.features?.filter((f) => f.scale === 'regional') ?? [];

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold">Field models</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Each target is something you log on foot. Its model learns where it grows from your finds, your
          &ldquo;none here&rdquo; searches and, kept separate, public herbarium records, read against national
          terrain, water, soil, fire, vegetation and climate layers.
        </p>
        <Link href="/admin/research/field" className="mt-3 inline-flex items-center gap-1 text-sm text-primary underline">
          Open the field log <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <section className="rounded-lg border bg-card p-4">
        <h2 className="font-semibold">Targets</h2>
        {targets === null ? (
          <p className="mt-2 text-sm text-muted-foreground">Loading…</p>
        ) : targets.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No targets yet.</p>
        ) : (
          <ul className="mt-2 divide-y">
            {targets.map((t) => (
              <li key={t.id}>
                <Link href={`/admin/research/field/targets/${t.id}`} className="flex items-center justify-between gap-3 py-3 hover:bg-muted/50">
                  <div>
                    <p className="font-medium">{t.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.scientificNames.join(', ') || 'No scientific names'} · {t.presences} finds · {t.absences} none-here ·{' '}
                      {t.publicRecords} public records
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {t.latestModelAt ? `Model ${new Date(t.latestModelAt).toLocaleDateString()}` : 'No model'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={create} className="mt-4 grid gap-2 border-t pt-4 sm:grid-cols-[1fr_1.4fr_auto]">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name, e.g. Long yam"
            required
            className="rounded-md border bg-background px-3 py-2 text-sm"
          />
          <input
            value={names}
            onChange={(e) => setNames(e.target.value)}
            placeholder="Scientific names for ALA, e.g. Dioscorea transversa"
            className="rounded-md border bg-background px-3 py-2 text-sm"
          />
          <button type="submit" className="inline-flex items-center justify-center gap-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">
            <Plus className="h-4 w-4" /> Add target
          </button>
          {error && <p className="text-sm text-red-600 sm:col-span-3">{error}</p>}
        </form>
      </section>

      <section className="rounded-lg border bg-card p-4">
        <h2 className="font-semibold">Engine</h2>
        {!engine ? (
          <p className="mt-2 text-sm text-muted-foreground">Checking…</p>
        ) : !engine.available || !health ? (
          <p className="mt-2 text-sm text-red-600">The model engine (field-modeld) is not running.</p>
        ) : (
          <div className="mt-2 space-y-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p>
                {health.area ? health.area.title : 'No prototype area'}:{' '}
                <span className={health.areaReady ? 'text-emerald-700' : 'text-amber-700'}>{health.areaReady ? 'layers ready' : 'layers not built'}</span>
              </p>
              <button type="button" onClick={() => void build('build-area')} disabled={job.running} className="rounded-md border px-3 py-1.5 disabled:opacity-40">
                {health.areaReady ? 'Rebuild area layers' : 'Build area layers'}
              </button>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p>
                Queensland climate grids:{' '}
                <span className={health.regionalMissing.length === 0 ? 'text-emerald-700' : 'text-amber-700'}>
                  {health.regionalMissing.length === 0 ? 'ready' : `${health.regionalMissing.length} to build`}
                </span>
              </p>
              {health.regionalMissing.length > 0 && (
                <button type="button" onClick={() => void build('build-regional')} disabled={job.running} className="rounded-md border px-3 py-1.5 disabled:opacity-40">
                  Build grids
                </button>
              )}
            </div>
            {job.status && <JobLine status={job.status} />}
            <details className="text-muted-foreground">
              <summary className="cursor-pointer">
                {localFeatures.length} landscape features · {regionalFeatures.length} climate features
              </summary>
              <div className="mt-2 grid gap-1 sm:grid-cols-2">
                {[...localFeatures, ...regionalFeatures].map((f) => (
                  <span key={f.id} className="text-xs">
                    <span className="text-foreground">{f.title}</span> · {f.group}
                    {f.scale === 'regional' ? ' · Queensland' : ''}
                  </span>
                ))}
              </div>
            </details>
          </div>
        )}
      </section>
    </div>
  );
}

export function JobLine({ status }: { status: { state: string; progress: number; message: string; error: string | null } }) {
  if (status.state === 'failed') return <p className="text-sm text-red-600">Failed: {status.error}</p>;
  return (
    <div className="space-y-1">
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-primary transition-all" style={{ width: `${Math.round(status.progress * 100)}%` }} />
      </div>
      <p className="text-xs text-muted-foreground">
        {status.state === 'done' ? 'Done.' : status.state === 'queued' ? 'Waiting for the engine…' : status.message}
      </p>
    </div>
  );
}
