'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Database, Play } from 'lucide-react';
import type { FieldModelSummary, FieldObservation, FieldTarget, ScaleCard } from '@/lib/research/field/types';
import { JobLine } from './FieldTargets';
import FieldMap from './FieldMap';
import { useEngineJob } from './useEngineJob';

const API = '/api/admin/research/field';

type Detail = { target: FieldTarget; observations: FieldObservation[]; models: FieldModelSummary[] };
type FeatureInfo = { id: string; title: string; group: string; unit: string };

export default function TargetDetail({ targetId }: { targetId: string }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [features, setFeatures] = useState<Record<string, FeatureInfo>>({});
  const [modelId, setModelId] = useState<string | null>(null);
  const [usePublic, setUsePublic] = useState(true);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [publicRecords, setPublicRecords] = useState<Array<{ latitude: number; longitude: number }>>([]);

  const load = useCallback(async () => {
    const response = await fetch(`${API}/targets/${targetId}`, { cache: 'no-store' });
    if (!response.ok) return;
    const body = (await response.json()) as Detail;
    setDetail(body);
    setModelId((current) => current ?? body.models[0]?.id ?? null);
    fetch(`${API}/targets/${targetId}/public-records`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { records: [] }))
      .then((b: { records: Array<{ latitude: number; longitude: number }> }) => setPublicRecords(b.records))
      .catch(() => undefined);
  }, [targetId]);

  const fit = useEngineJob((job) => {
    const card = job.result as { modelId?: string } | undefined;
    if (card?.modelId) setModelId(card.modelId);
    void load();
  });

  useEffect(() => {
    void load();
    fetch(`${API}/engine`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((body: { features?: FeatureInfo[] }) => setFeatures(Object.fromEntries((body.features ?? []).map((f) => [f.id, f]))))
      .catch(() => undefined);
  }, [load]);

  async function importPublic() {
    setImporting(true);
    setMessage(null);
    const response = await fetch(`${API}/targets/${targetId}/public-records`, { method: 'POST' });
    const body = (await response.json().catch(() => ({}))) as { stored?: number; error?: string };
    setImporting(false);
    setMessage(response.ok ? `Stored ${body.stored} public records.` : `Import failed: ${body.error ?? response.status}`);
    void load();
  }

  async function startFit() {
    setMessage(null);
    const response = await fetch(`${API}/targets/${targetId}/fit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ usePublicRecords: usePublic }),
    });
    const body = (await response.json().catch(() => ({}))) as { jobId?: string; error?: string };
    if (body.jobId) fit.watch(body.jobId);
    else setMessage(body.error === 'no_presences' ? 'Log at least one find (or import public records) first.' : `Could not start: ${body.error ?? response.status}`);
  }

  const model = useMemo(() => detail?.models.find((m) => m.id === modelId) ?? null, [detail, modelId]);

  if (!detail) return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;
  const { target, observations } = detail;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <div>
        <Link href="/admin/research/field/targets" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Field models
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">{target.name}</h1>
        <p className="text-sm text-muted-foreground">
          {target.scientificNames.length > 0 ? <em>{target.scientificNames.join(', ')}</em> : 'No scientific names'} · {target.presences} finds ·{' '}
          {target.absences} none-here · {target.publicRecords} public records
        </p>
      </div>

      <section className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="overflow-hidden rounded-lg border bg-card">
          <FieldMap modelId={model?.id ?? null} observations={observations} publicRecords={publicRecords} />
        </div>
        <div className="space-y-4">
          <div className="space-y-3 rounded-lg border bg-card p-4">
            <h2 className="font-semibold">Fit a model</h2>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={usePublic} onChange={(e) => setUsePublic(e.target.checked)} className="mt-1" />
              <span>
                Include public records
                <span className="block text-xs text-muted-foreground">
                  Herbarium and ALA records, weighted below your own finds. Untick to learn from your finds alone.
                </span>
              </span>
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void startFit()}
                disabled={fit.running}
                className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-40"
              >
                <Play className="h-4 w-4" /> {fit.running ? 'Fitting…' : 'Fit now'}
              </button>
              <button
                type="button"
                onClick={() => void importPublic()}
                disabled={importing || target.scientificNames.length === 0}
                className="inline-flex items-center gap-1 rounded-md border px-3 py-2 text-sm disabled:opacity-40"
              >
                <Database className="h-4 w-4" /> {importing ? 'Importing…' : 'Refresh ALA records'}
              </button>
            </div>
            {fit.status && <JobLine status={fit.status} />}
            {message && <p className="text-sm text-muted-foreground">{message}</p>}
          </div>

          {detail.models.length > 0 && (
            <div className="rounded-lg border bg-card p-4">
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground" htmlFor="model-select">
                Model
              </label>
              <select
                id="model-select"
                value={modelId ?? ''}
                onChange={(e) => setModelId(e.target.value)}
                className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
              >
                {detail.models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {new Date(m.createdAt).toLocaleString()} · {m.fieldPresences} finds
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </section>

      {model && (
        <section className="grid gap-4 md:grid-cols-2">
          <ScalePanel
            title="Landscape model (30 m)"
            subtitle="Where in the country it grows: terrain, water, soil, fire, vegetation."
            card={model.card.local}
            features={features}
          />
          <ScalePanel
            title="Climate model (1 km, Queensland)"
            subtitle="Which country suits it at all: climate and elevation."
            card={model.card.regional}
            features={features}
          />
          {model.card.notes.length > 0 && (
            <ul className="space-y-1 rounded-lg border bg-card p-4 text-sm text-muted-foreground md:col-span-2">
              {model.card.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          )}
          <div className="rounded-lg border bg-card p-4 md:col-span-2">
            <h3 className="font-semibold">Climate suitability, Queensland</h3>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${API}/models/${model.id}/regional.png`} alt="Climate suitability across Queensland" className="mt-2 max-h-[32rem] w-auto rounded border bg-[#e9e4d8]" />
          </div>
        </section>
      )}
    </div>
  );
}

function auc(value: number | null) {
  return value === null ? '—' : value.toFixed(2);
}

function ScalePanel({ title, subtitle, card, features }: { title: string; subtitle: string; card: ScaleCard | null; features: Record<string, FeatureInfo> }) {
  if (!card) {
    return (
      <div className="rounded-lg border bg-card p-4">
        <h3 className="font-semibold">{title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">Not fitted for this model.</p>
      </div>
    );
  }
  const top = card.importance.filter((i) => i.aucDrop > 0.001).slice(0, 10);
  const max = Math.max(0.001, ...top.map((i) => i.aucDrop));
  const held = card.validation.heldOutFieldPercentiles;
  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <div>
        <h3 className="font-semibold">{title}</h3>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <dl className="grid grid-cols-3 gap-2 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">Your finds</dt>
          <dd className="font-medium">{card.presencesField}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Public</dt>
          <dd className="font-medium">{card.presencesPublic}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">None-here</dt>
          <dd className="font-medium">{card.absences}</dd>
        </div>
        <div className="col-span-3">
          <dt className="text-xs text-muted-foreground">Held-out accuracy (AUC, 0.5 = chance, 1 = perfect)</dt>
          <dd className="font-medium">
            {auc(card.validation.spatialBlockAuc)} all records
            {card.validation.fieldFindAuc !== null && <> · {auc(card.validation.fieldFindAuc)} your finds</>}
          </dd>
        </div>
        {held.length > 0 && (
          <div className="col-span-3">
            <dt className="text-xs text-muted-foreground">Your finds when hidden from the model scored better than…</dt>
            <dd className="font-medium">{held.map((p) => `${Math.round(p)}%`).join(', ')} of the area</dd>
          </div>
        )}
      </dl>
      <div>
        <p className="mb-1 text-xs text-muted-foreground">What the model leans on</p>
        <ul className="space-y-1">
          {top.map((i) => (
            <li key={i.featureId} className="grid grid-cols-[9rem_1fr] items-center gap-2 text-xs sm:grid-cols-[12rem_1fr]">
              <span className="truncate">{features[i.featureId]?.title ?? i.featureId}</span>
              <span className="h-2 rounded bg-primary/70" style={{ width: `${(i.aucDrop / max) * 100}%` }} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
