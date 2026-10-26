'use client';

import { useCallback, useEffect, useState } from 'react';
import { Database, Play } from 'lucide-react';
import type { FieldModelSummary, FieldTarget, ScaleCard } from '@/lib/research/field/types';
import { useEngineJob } from '../useEngineJob';
import { Button, PanelHeading } from './ui';

const API = '/api/admin/research/field';

export type FeatureTitles = Record<string, string>;

function strength(auc: number | null): { word: string; tone: 'good' | 'fair' | 'weak' | 'none' } {
  if (auc === null) return { word: 'Not tested yet', tone: 'none' };
  if (auc >= 0.9) return { word: 'Strong', tone: 'good' };
  if (auc >= 0.8) return { word: 'Good', tone: 'good' };
  if (auc >= 0.7) return { word: 'Fair', tone: 'fair' };
  return { word: 'Weak', tone: 'weak' };
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function titleFor(id: string, titles: FeatureTitles): string {
  return titles[id] ?? id.replace(/^r_/, '').replaceAll('_', ' ');
}

/** One model scale, described in plain words rather than statistics. */
function ScaleSummary({ heading, lead, card, titles, targetName, context, alwaysShowFieldTest }: { heading: string; lead: string; card: ScaleCard; titles: FeatureTitles; targetName: string; context: string; alwaysShowFieldTest: boolean }) {
  const held = median(card.validation.heldOutFieldPercentiles);
  const overall = strength(card.validation.spatialBlockAuc);
  const top = card.importance.filter((i) => i.aucDrop > 0.001).slice(0, 6);
  const max = Math.max(0.001, ...top.map((i) => i.aucDrop));
  const sources = [
    card.presencesField > 0 && `${card.presencesField} of your finds`,
    card.absences > 0 && `${card.absences} “none here”`,
    card.presencesPublic > 0 && `${card.presencesPublic} public records`,
  ].filter(Boolean);

  return (
    <section className="space-y-3">
      <PanelHeading>{heading}</PanelHeading>
      <p className="text-sm text-[var(--field-ink-soft)]">{lead}</p>
      <dl className="field-facts">
        <div className="col-span-2">
          <dt>Learned from</dt>
          <dd>{sources.join(', ') || 'Nothing yet'}</dd>
        </div>
        <div className="col-span-2">
          <dt>How well it holds up</dt>
          <dd>
            <span className={`field-strength field-strength-${overall.tone}`}>{overall.word}</span>
            {card.validation.spatialBlockAuc !== null && (
              <span className="text-[var(--field-ink-soft)]"> on records it hadn’t seen (score {card.validation.spatialBlockAuc.toFixed(2)})</span>
            )}
          </dd>
        </div>
        {(alwaysShowFieldTest || held !== null) && (
        <div className="col-span-2">
          <dt>On your own finds</dt>
          <dd>
            {held === null
              ? `Not tested yet. Log at least three ${targetName.toLowerCase()} finds in different places.`
              : `With each find hidden from it, the model still ranked that spot above ${Math.round(held)}% of ${context}.`}
          </dd>
        </div>
        )}
      </dl>
      {top.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-medium">What it pays attention to</p>
          <ul className="space-y-1.5">
            {top.map((item) => (
              <li key={item.featureId} className="grid grid-cols-[minmax(0,13rem)_1fr] items-center gap-3 text-sm">
                <span className="line-clamp-2 leading-snug">{titleFor(item.featureId, titles)}</span>
                <span className="field-bar" style={{ width: `${Math.max(6, (item.aucDrop / max) * 100)}%` }} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/**
 * The model behind the map: what it learned from, how far to trust it, and
 * the controls to refresh public records and fit a new one.
 */
export default function ModelPanel({
  target,
  online,
  titles,
  onFitted,
}: {
  target: FieldTarget;
  online: boolean;
  titles: FeatureTitles;
  onFitted: () => void;
}) {
  const [models, setModels] = useState<FieldModelSummary[] | null>(null);
  const [usePublic, setUsePublic] = useState(true);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`${API}/targets/${target.id}`, { cache: 'no-store' });
      if (response.ok) setModels(((await response.json()) as { models: FieldModelSummary[] }).models);
    } catch {
      setModels(null);
    }
  }, [target.id]);

  useEffect(() => {
    if (online) void load();
  }, [online, load]);

  const fit = useEngineJob(() => {
    void load();
    onFitted();
    setMessage('New model ready. The map has been updated.');
  });

  const latest = models?.[0] ?? null;

  return (
    <div className="space-y-6 px-5 py-4">
      {!online && <p className="field-note">The model details need signal. The map and spots on this phone still work.</p>}

      {online && models === null && (
        <div className="space-y-3" aria-busy="true" aria-label="Loading the model">
          <div className="h-4 w-40 animate-pulse rounded bg-[var(--field-sunk)] motion-reduce:animate-none" />
          <div className="h-3 w-full animate-pulse rounded bg-[var(--field-sunk)] motion-reduce:animate-none" />
          <div className="h-3 w-4/5 animate-pulse rounded bg-[var(--field-sunk)] motion-reduce:animate-none" />
          <div className="h-3 w-3/5 animate-pulse rounded bg-[var(--field-sunk)] motion-reduce:animate-none" />
        </div>
      )}

      {online && latest === null && models !== null && (
        <p className="field-empty">No model yet. It needs at least two finds (yours or public records).</p>
      )}

      {latest?.card.local && (
        <ScaleSummary
          heading="Where in the country"
          lead="Reads 30 m detail across the station: terrain, water, soil, fire history and vegetation cover."
          card={latest.card.local}
          titles={titles}
          targetName={target.name}
          context="the ground around it"
          alwaysShowFieldTest
        />
      )}
      {latest?.card.regional && (
        <ScaleSummary
          heading="Which country suits it"
          lead="Reads climate and elevation across Queensland at 1 km."
          card={latest.card.regional}
          titles={titles}
          targetName={target.name}
          context="Queensland"
          alwaysShowFieldTest={false}
        />
      )}
      {latest && latest.card.notes.length > 0 && (
        <ul className="space-y-1 text-sm text-[var(--field-ink-soft)]">
          {latest.card.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}

      {online && (
        <section className="space-y-3 border-t border-[var(--field-line)] pt-5">
          <PanelHeading>Update the model</PanelHeading>
          <label className="flex items-start gap-3 text-[0.9375rem]">
            <input type="checkbox" checked={usePublic} onChange={(e) => setUsePublic(e.target.checked)} className="field-check mt-0.5" />
            <span>
              Also learn from public records
              <span className="block text-sm text-[var(--field-ink-soft)]">
                {target.publicRecords > 0
                  ? `${target.publicRecords} herbarium and Atlas of Living Australia records, weighted below your own finds.`
                  : 'No public records downloaded yet.'}
              </span>
            </span>
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              disabled={fit.running}
              onClick={async () => {
                setMessage(null);
                const response = await fetch(`${API}/targets/${target.id}/fit`, {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({ usePublicRecords: usePublic }),
                });
                const body = (await response.json().catch(() => ({}))) as { jobId?: string; error?: string };
                if (body.jobId) fit.watch(body.jobId);
                else setMessage(body.error === 'no_presences' ? 'Log a find first, or download public records.' : 'The model engine is not available right now.');
              }}
            >
              <Play className="h-4 w-4" aria-hidden /> {fit.running ? 'Fitting…' : 'Fit a new model'}
            </Button>
            {target.scientificNames.length > 0 && (
              <Button
                variant="secondary"
                disabled={importing}
                onClick={async () => {
                  setImporting(true);
                  setMessage(null);
                  const response = await fetch(`${API}/targets/${target.id}/public-records`, { method: 'POST' });
                  const body = (await response.json().catch(() => ({}))) as { stored?: number };
                  setImporting(false);
                  setMessage(response.ok ? `Downloaded ${body.stored} public records.` : 'The Atlas of Living Australia didn’t answer. Try again later.');
                  onFitted();
                }}
              >
                <Database className="h-4 w-4" aria-hidden /> {importing ? 'Downloading…' : 'Refresh public records'}
              </Button>
            )}
          </div>
          {fit.status && fit.status.state !== 'done' && (
            <div className="space-y-1" aria-live="polite">
              <div className="field-progress">
                <span style={{ transform: `scaleX(${fit.status.progress})` }} />
              </div>
              <p className="text-sm text-[var(--field-ink-soft)]">
                {fit.status.state === 'failed' ? `Failed: ${fit.status.error}` : fit.status.state === 'queued' ? 'Waiting for the engine…' : fit.status.message}
              </p>
            </div>
          )}
          {message && <p className="text-sm" role="status">{message}</p>}
          {models && models.length > 1 && (
            <p className="text-sm text-[var(--field-ink-soft)]">
              {models.length} models fitted so far; the map always shows the newest ({new Date(models[0].createdAt).toLocaleString()}).
            </p>
          )}
        </section>
      )}
    </div>
  );
}
