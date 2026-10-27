'use client';

import { useEffect, useState } from 'react';
import { Check, CloudOff, CloudUpload, Plus } from 'lucide-react';
import type { Activity, FieldTarget } from '@/lib/research/field/types';
import { whenLogged } from '../geo';
import { useEngineJob } from '../useEngineJob';
import type { QueuedObservation } from '../offline-store';
import type { MapLayers } from './FieldMap';
import type { Readiness } from './useFieldData';
import { Button, Dialog, PanelHeading } from './ui';

const API = '/api/admin/research/field';

// ---------------------------------------------------------------------------
// What are you logging?

export function TargetDialog({
  open,
  onClose,
  targets,
  selectedId,
  online,
  onSelect,
  onCreate,
  onEngineChanged,
}: {
  open: boolean;
  onClose: () => void;
  targets: FieldTarget[];
  selectedId: string | null;
  online: boolean;
  onSelect: (id: string) => void;
  onCreate: (name: string, scientificNames: string[], activity: Activity) => Promise<FieldTarget | null>;
  onEngineChanged: () => void;
}) {
  const [adding, setAdding] = useState<Activity | null>(null);
  const [name, setName] = useState('');
  const [names, setNames] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setAdding(null);
      setError(null);
    }
  }, [open]);

  return (
    <Dialog open={open} onClose={onClose} title="What are you logging?">
      {(['gather', 'fish'] as const).map((activity) => {
        const group = targets.filter((t) => t.activity === activity);
        return (
          <section key={activity} className="px-3 pt-3" aria-labelledby={`targets-${activity}`}>
            <h3 id={`targets-${activity}`} className="px-2 text-sm font-semibold text-[var(--field-ink-soft)]">
              {activity === 'gather' ? 'On foot' : 'Fishing'}
            </h3>
            <ul className="field-list py-1" role="listbox" aria-labelledby={`targets-${activity}`}>
              {group.map((t) => (
                <li key={t.id} role="option" aria-selected={t.id === selectedId}>
                  <button
                    type="button"
                    className="field-row"
                    onClick={() => {
                      onSelect(t.id);
                      onClose();
                    }}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{t.name}</span>
                      <span className="block truncate text-sm text-[var(--field-ink-soft)]">
                        {[
                          t.scientificNames.join(', '),
                          activity === 'fish' ? `${t.presences} caught` : `${t.presences} found`,
                          activity === 'fish' ? null : `${t.absences} none here`,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                    {t.id === selectedId && <Check className="h-5 w-5 shrink-0 text-[var(--field-ochre)]" aria-hidden />}
                  </button>
                </li>
              ))}
              {group.length === 0 && (
                <li className="field-empty px-2">{activity === 'gather' ? 'Nothing set up yet.' : 'No animals set up yet.'}</li>
              )}
            </ul>
          </section>
        );
      })}

      <div className="border-t border-[var(--field-line)] px-5 py-4">
        {!online ? (
          <p className="field-note">Adding something new needs signal.</p>
        ) : adding ? (
          <form
            aria-label={adding === 'fish' ? 'Add an animal to fish' : 'Add something found on foot'}
            className="space-y-3"
            onSubmit={async (event) => {
              event.preventDefault();
              setError(null);
              const created = await onCreate(
                name.trim(),
                names
                  .split(/[,\n]/)
                  .map((n) => n.trim())
                  .filter(Boolean),
                adding,
              );
              if (created) onClose();
              else setError('Couldn’t add it. Check the name and try again.');
            }}
          >
            <div className="space-y-1.5">
              <label htmlFor="new-target-name" className="field-label">
                Name
              </label>
              <input
                id="new-target-name"
                required
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="field-input"
                placeholder={adding === 'fish' ? 'e.g. Saratoga' : 'e.g. Long yam'}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="new-target-sci" className="field-label">
                Scientific name <span className="font-normal text-[var(--field-ink-soft)]">(optional)</span>
              </label>
              <input id="new-target-sci" value={names} onChange={(e) => setNames(e.target.value)} className="field-input" placeholder={adding === 'fish' ? 'e.g. Scleropages jardinii' : 'e.g. Dioscorea transversa'} aria-describedby="new-target-sci-help" />
              <p id="new-target-sci-help" className="text-sm text-[var(--field-ink-soft)]">
                Used to download public records from the Atlas of Living Australia. Separate several with commas.
              </p>
            </div>
            {error && <p className="field-error">{error}</p>}
            <div className="flex gap-2">
              <Button type="submit" variant="primary">
                Add
              </Button>
              <Button variant="ghost" onClick={() => setAdding(null)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => setAdding('gather')}>
              <Plus className="h-5 w-5" aria-hidden /> Something on foot
            </Button>
            <Button variant="secondary" onClick={() => setAdding('fish')}>
              <Plus className="h-5 w-5" aria-hidden /> An animal to fish
            </Button>
          </div>
        )}
      </div>
      {online && <EngineSection onChanged={onEngineChanged} />}
    </Dialog>
  );
}

type EngineHealth = { regionalMissing: string[]; area: { title: string } | null; areaReady: boolean };

/** Housekeeping for the model engine, tucked away from field use. */
function EngineSection({ onChanged }: { onChanged: () => void }) {
  const [health, setHealth] = useState<EngineHealth | null | 'down'>(null);
  const load = async () => {
    const body = (await fetch(`${API}/engine`, { cache: 'no-store' }).then((r) => r.json()).catch(() => null)) as { available?: boolean; health?: EngineHealth } | null;
    setHealth(body?.available && body.health ? body.health : 'down');
  };
  const job = useEngineJob(() => {
    void load();
    onChanged();
  });
  useEffect(() => {
    void load();
  }, []);
  const build = async (action: 'build-area' | 'build-regional') => {
    const response = await fetch(`${API}/engine`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action }) });
    const body = (await response.json().catch(() => ({}))) as { jobId?: string };
    if (body.jobId) job.watch(body.jobId);
  };
  return (
    <details className="field-details border-t border-[var(--field-line)] px-5 py-3">
      <summary>Model engine</summary>
      <div className="space-y-3 pt-3 text-sm">
        {health === null ? (
          <p>Checking…</p>
        ) : health === 'down' ? (
          <p className="field-error">The model engine isn’t running.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p>
                {health.area?.title ?? 'Prototype area'}: {health.areaReady ? 'layers ready' : 'layers not built'}
              </p>
              <Button disabled={job.running} onClick={() => void build('build-area')}>
                {health.areaReady ? 'Rebuild' : 'Build'}
              </Button>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p>Queensland climate grids: {health.regionalMissing.length === 0 ? 'ready' : `${health.regionalMissing.length} to build`}</p>
              {health.regionalMissing.length > 0 && (
                <Button disabled={job.running} onClick={() => void build('build-regional')}>
                  Build
                </Button>
              )}
            </div>
            {job.status && job.status.state !== 'done' && (
              <p aria-live="polite">{job.status.state === 'failed' ? `Failed: ${job.status.error}` : job.status.message}</p>
            )}
          </>
        )}
      </div>
    </details>
  );
}

// ---------------------------------------------------------------------------
// This phone: uploads waiting, maps saved, storage.

export function PhoneDialog({
  open,
  onClose,
  online,
  pending,
  syncing,
  onSync,
  readiness,
  preparing,
  onPrepare,
}: {
  open: boolean;
  onClose: () => void;
  online: boolean;
  pending: QueuedObservation[];
  syncing: boolean;
  onSync: () => void;
  readiness: Readiness;
  preparing: { done: number; total: number } | null;
  onPrepare: () => void;
}) {
  const [storage, setStorage] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    void navigator.storage
      ?.estimate?.()
      .then((e) => setStorage(e.usage ? `${(e.usage / 1_048_576).toFixed(1)} MB used on this phone` : null))
      .catch(() => undefined);
  }, [open, readiness]);
  const failing = pending.find((p) => p.lastError);
  const allReady = readiness.withModel > 0 && readiness.ready === readiness.withModel && readiness.basemap;

  return (
    <Dialog open={open} onClose={onClose} title="This phone">
      <div className="space-y-6 px-5 py-4">
        <section className="space-y-2">
          <PanelHeading aside={online ? <span className="field-pill-mini">Online</span> : <span className="field-pill-mini field-pill-mini-warn">Offline</span>}>Uploads</PanelHeading>
          {pending.length === 0 ? (
            <p className="flex items-center gap-2">
              <Check className="h-5 w-5 text-[var(--field-find)]" aria-hidden /> Every log is uploaded.
            </p>
          ) : (
            <>
              <p>
                {pending.length} {pending.length === 1 ? 'log is' : 'logs are'} waiting on this phone.{' '}
                {online ? 'They upload automatically.' : 'They’ll upload when you have signal.'}
              </p>
              {failing && <p className="field-error">Last try: {failing.lastError}</p>}
              <ul className="space-y-1 text-sm text-[var(--field-ink-soft)]">
                {pending.slice(0, 6).map((p) => (
                  <li key={p.clientId}>
                    {p.method || p.bait ? (p.kind === 'presence' ? 'Catch' : 'Nothing caught') : p.kind === 'presence' ? 'Found' : 'None here'} · {whenLogged(p.observedAt)}
                    {p.photo ? ' · with photo' : ''}
                  </li>
                ))}
              </ul>
              <Button variant="primary" disabled={!online || syncing} onClick={onSync}>
                <CloudUpload className="h-4 w-4" aria-hidden /> {syncing ? 'Uploading…' : 'Upload now'}
              </Button>
            </>
          )}
        </section>

        <section className="space-y-2">
          <PanelHeading>Maps for the field</PanelHeading>
          <p>
            {readiness.withModel === 0
              ? 'No models yet, so there are no maps to save.'
              : allReady
                ? `All ${readiness.withModel} maps are saved and up to date${readiness.oldestSavedAt ? ` (${whenLogged(readiness.oldestSavedAt)})` : ''}.`
                : `${readiness.ready} of ${readiness.withModel} maps are saved and current${readiness.basemap ? '' : ', and the base map is missing'}.`}
          </p>
          {preparing ? (
            <div className="space-y-1" aria-live="polite">
              <div className="field-progress">
                <span style={{ transform: `scaleX(${preparing.done / Math.max(1, preparing.total)})` }} />
              </div>
              <p className="text-sm text-[var(--field-ink-soft)]">
                Saving {preparing.done} of {preparing.total}…
              </p>
            </div>
          ) : online ? (
            <Button variant={allReady ? 'secondary' : 'primary'} onClick={onPrepare}>
              {allReady ? 'Check for newer maps' : 'Get ready for the field'}
            </Button>
          ) : (
            <p className="flex items-center gap-2 text-sm text-[var(--field-ink-soft)]">
              <CloudOff className="h-4 w-4" aria-hidden /> Saving maps needs signal.
            </p>
          )}
          {storage && <p className="text-sm text-[var(--field-ink-soft)]">{storage}.</p>}
        </section>

        <p className="text-sm text-[var(--field-ink-soft)]">
          Where food plants grow and where people fish are restricted knowledge. Logs and maps stay on this phone until uploaded, and only research admins can see them.
        </p>
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Map layers.

export function LayersDialog({
  open,
  onClose,
  layers,
  onLayers,
  opacity,
  onOpacity,
  fishing = false,
}: {
  open: boolean;
  onClose: () => void;
  fishing?: boolean;
  layers: MapLayers;
  onLayers: (layers: MapLayers) => void;
  opacity: number;
  onOpacity: (value: number) => void;
}) {
  const toggle = (key: keyof MapLayers, label: string, help: string) => (
    <label className="flex items-start gap-3 py-2">
      <input type="checkbox" checked={layers[key]} onChange={(e) => onLayers({ ...layers, [key]: e.target.checked })} className="field-check mt-0.5" />
      <span>
        <span className="block font-medium">{label}</span>
        <span className="block text-sm text-[var(--field-ink-soft)]">{help}</span>
      </span>
    </label>
  );
  return (
    <Dialog open={open} onClose={onClose} title="Map">
      <div className="space-y-1 px-5 py-3">
        {toggle(
          'suitability',
          fishing ? 'Likely water' : 'Likely ground',
          fishing ? 'Rivers and waterholes shaded from pale (ordinary) to dark red (the best on the station).' : 'Shaded from pale (ordinary) to dark red (the best on the station).',
        )}
        <div className="pb-2 pl-8">
          <label htmlFor="overlay-opacity" className="text-sm text-[var(--field-ink-soft)]">
            Shading strength
          </label>
          <input id="overlay-opacity" type="range" min={0.2} max={1} step={0.05} value={opacity} onChange={(e) => onOpacity(Number(e.target.value))} className="field-range w-full" />
        </div>
        {toggle('spots', fishing ? 'Places to fish' : 'Places to search', 'The best-scoring spots, each at least 300 m apart.')}
        {toggle(
          'logs',
          'Your logs',
          fishing ? 'Green: a catch. White ring: nothing caught. Orange edge: still on this phone.' : 'Green: found. White ring: looked, none. Orange edge: still on this phone.',
        )}
        <p className="pt-2 text-sm text-[var(--field-ink-soft)]">
          The base map is drawn on this server from elevation (Geoscience Australia), surface water and plant cover (Digital Earth Australia). No outside map service sees where you look.
        </p>
      </div>
    </Dialog>
  );
}
