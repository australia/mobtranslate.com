'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Camera, CloudOff, CloudUpload, Crosshair, Download, MapPin, Navigation, SearchX, X } from 'lucide-react';
import type { AreaSpot, Bounds, FieldObservation, FieldTarget } from '@/lib/research/field/types';
import { bearingDeg, compassPoint, distanceM, formatCoordinate, formatDistance } from './geo';
import { cache, cacheKeys, queue, type CachedTargets, type OfflineModel, type QueuedObservation } from './offline-store';

type Position = { lat: number; lon: number; accuracy: number; altitude: number | null; at: number };

const API = '/api/admin/research/field';

function newClientId(): string {
  return crypto.randomUUID();
}

async function readBounds(response: Response): Promise<Bounds | null> {
  const header = response.headers.get('x-bounds');
  try {
    return header ? (JSON.parse(header) as Bounds) : null;
  } catch {
    return null;
  }
}

export default function FieldLogger() {
  const [targets, setTargets] = useState<FieldTarget[]>([]);
  const [targetsSavedAt, setTargetsSavedAt] = useState<string | null>(null);
  const [targetId, setTargetId] = useState<string>('');
  const [position, setPosition] = useState<Position | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState<QueuedObservation[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [notes, setNotes] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [recent, setRecent] = useState<FieldObservation[]>([]);
  const [offlineModel, setOfflineModel] = useState<OfflineModel | null>(null);
  const [saving, setSaving] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);

  const target = targets.find((t) => t.id === targetId) ?? null;

  // Targets: from the server when reachable, otherwise the last saved copy.
  const loadTargets = useCallback(async () => {
    try {
      const response = await fetch(`${API}/targets`, { cache: 'no-store' });
      if (!response.ok) throw new Error(String(response.status));
      const body = (await response.json()) as { targets: FieldTarget[] };
      setTargets(body.targets);
      const savedAt = new Date().toISOString();
      setTargetsSavedAt(savedAt);
      await cache.set(cacheKeys.targets, { savedAt, targets: body.targets } satisfies CachedTargets);
    } catch {
      const cached = await cache.get<CachedTargets>(cacheKeys.targets).catch(() => undefined);
      if (cached) {
        setTargets(cached.targets);
        setTargetsSavedAt(cached.savedAt);
      }
    }
  }, []);

  useEffect(() => {
    void loadTargets();
    void cache.get<string>(cacheKeys.selectedTarget).then((id) => id && setTargetId(id)).catch(() => undefined);
    void queue.all().then(setPending).catch(() => undefined);
    setOnline(navigator.onLine);
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, [loadTargets]);

  useEffect(() => {
    if (!targetId && targets.length > 0) setTargetId(targets[0].id);
  }, [targets, targetId]);

  useEffect(() => {
    if (!targetId) return;
    void cache.set(cacheKeys.selectedTarget, targetId).catch(() => undefined);
    void cache.get<OfflineModel>(cacheKeys.model(targetId)).then((m) => setOfflineModel(m ?? null)).catch(() => setOfflineModel(null));
    fetch(`${API}/observations?targetId=${targetId}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((body: { observations: FieldObservation[] }) => setRecent(body.observations.slice(0, 15)))
      .catch(() => undefined);
  }, [targetId]);

  // Continuous high-accuracy GPS while the page is open.
  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setGpsError('This device has no GPS access.');
      return;
    }
    const watch = navigator.geolocation.watchPosition(
      (p) => {
        setGpsError(null);
        setPosition({
          lat: p.coords.latitude,
          lon: p.coords.longitude,
          accuracy: p.coords.accuracy,
          altitude: p.coords.altitude,
          at: p.timestamp,
        });
      },
      (error) => setGpsError(error.code === error.PERMISSION_DENIED ? 'Location permission is off for this site.' : 'Waiting for a GPS fix…'),
      { enableHighAccuracy: true, maximumAge: 2_000, timeout: 30_000 },
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, []);

  const sync = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      for (const item of await queue.all()) {
        try {
          let serverId = item.serverId;
          if (!serverId) {
            const { photo: _photo, serverId: _s, lastError: _e, ...observation } = item;
            const response = await fetch(`${API}/observations`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ observations: [observation] }),
            });
            if (!response.ok) throw new Error(`upload refused (${response.status})`);
            const body = (await response.json()) as { observations: FieldObservation[] };
            serverId = body.observations[0]?.id ?? null;
            if (!serverId) throw new Error('upload not confirmed');
            await queue.put({ ...item, serverId, lastError: null });
          }
          if (item.photo) {
            const form = new FormData();
            form.append('photo', item.photo, 'photo.jpg');
            const response = await fetch(`${API}/observations/${serverId}/photo`, { method: 'POST', body: form });
            if (!response.ok) throw new Error(`photo refused (${response.status})`);
          }
          await queue.remove(item.clientId);
        } catch (error) {
          await queue.put({ ...item, lastError: error instanceof Error ? error.message : 'upload failed' }).catch(() => undefined);
          break;
        }
      }
    } finally {
      setPending(await queue.all().catch(() => []));
      setSyncing(false);
    }
    if (targetId) {
      fetch(`${API}/observations?targetId=${targetId}`, { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((body: { observations: FieldObservation[] }) => setRecent(body.observations.slice(0, 15)))
        .catch(() => undefined);
    }
  }, [syncing, targetId]);

  useEffect(() => {
    if (online && pending.length > 0) void sync();
    // Retry quietly while anything is waiting.
    const timer = setInterval(() => {
      if (!navigator.onLine) return;
      void queue.all().then((items) => {
        if (items.length > 0) void sync();
      });
    }, 60_000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  async function log(kind: 'presence' | 'absence') {
    if (!target || !position) return;
    const item: QueuedObservation = {
      clientId: newClientId(),
      targetId: target.id,
      kind,
      latitude: position.lat,
      longitude: position.lon,
      accuracyM: Math.round(position.accuracy * 10) / 10,
      altitudeM: position.altitude,
      observedAt: new Date().toISOString(),
      notes: notes.trim() || null,
      photo,
      serverId: null,
      lastError: null,
    };
    await queue.put(item);
    setPending(await queue.all());
    setNotes('');
    setPhoto(null);
    if (photoInput.current) photoInput.current.value = '';
    setFlash(kind === 'presence' ? `Logged a ${target.name} find.` : `Logged: searched here, no ${target.name}.`);
    setTimeout(() => setFlash(null), 3_000);
    if (navigator.onLine) void sync();
  }

  async function saveForOffline() {
    if (!target?.latestModelId) return;
    setSaving(true);
    try {
      const modelId = target.latestModelId;
      const [spotsResponse, areaResponse, baseResponse] = await Promise.all([
        fetch(`${API}/models/${modelId}/area-spots`),
        fetch(`${API}/models/${modelId}/area.png`),
        fetch(`${API}/engine/basemap`),
      ]);
      if (!spotsResponse.ok) throw new Error('This model has no area spots yet.');
      const model: OfflineModel = {
        targetId: target.id,
        modelId,
        savedAt: new Date().toISOString(),
        spots: (await spotsResponse.json()) as AreaSpot[],
        areaBounds: areaResponse.ok ? await readBounds(areaResponse) : null,
        areaImage: areaResponse.ok ? await areaResponse.blob() : null,
        basemap: baseResponse.ok ? await baseResponse.blob() : null,
      };
      await cache.set(cacheKeys.model(target.id), model);
      setOfflineModel(model);
      setFlash('Saved for offline use on this device.');
    } catch (error) {
      setFlash(error instanceof Error ? error.message : 'Could not save for offline use.');
    } finally {
      setSaving(false);
      setTimeout(() => setFlash(null), 4_000);
    }
  }

  const nearby = useMemo(() => {
    if (!position || !offlineModel) return [];
    return offlineModel.spots
      .map((s) => ({
        ...s,
        distance: distanceM(position.lat, position.lon, s.lat, s.lon),
        bearing: bearingDeg(position.lat, position.lon, s.lat, s.lon),
      }))
      .filter((s) => s.distance <= 5_000)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 8);
  }, [position, offlineModel]);

  const accuracyTone =
    !position ? 'text-muted-foreground' : position.accuracy <= 15 ? 'text-emerald-600' : position.accuracy <= 50 ? 'text-amber-600' : 'text-red-600';

  return (
    <div className="mx-auto max-w-xl space-y-4 p-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Field log</h1>
          <p className="text-sm text-muted-foreground">Log a find where you stand. Works without signal; uploads when you are back in range.</p>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${online ? 'bg-emerald-500/10 text-emerald-700' : 'bg-amber-500/15 text-amber-700'}`}
        >
          {online ? <CloudUpload className="h-3.5 w-3.5" /> : <CloudOff className="h-3.5 w-3.5" />}
          {online ? 'Online' : 'Offline'}
        </span>
      </header>

      <section className="space-y-2 rounded-lg border bg-card p-3">
        <label className="block text-xs font-medium uppercase tracking-wide text-muted-foreground" htmlFor="field-target">
          What are you logging?
        </label>
        <select
          id="field-target"
          value={targetId}
          onChange={(e) => setTargetId(e.target.value)}
          className="w-full rounded-md border bg-background px-3 py-3 text-base"
        >
          {targets.length === 0 && <option value="">No targets yet</option>}
          {targets.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        {targets.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Add a target (e.g. Long yam) on the <Link className="underline" href="/admin/research/field/targets">targets page</Link> while online.
          </p>
        )}
        {targetsSavedAt && !online && (
          <p className="text-xs text-muted-foreground">Target list saved {new Date(targetsSavedAt).toLocaleString()}.</p>
        )}
      </section>

      <section className="space-y-3 rounded-lg border bg-card p-3">
        <div className="flex items-center gap-2">
          <Crosshair className={`h-5 w-5 ${accuracyTone}`} />
          {position ? (
            <div className="min-w-0">
              <p className="font-mono text-sm">{formatCoordinate(position.lat, position.lon)}</p>
              <p className={`text-xs ${accuracyTone}`}>
                ±{Math.round(position.accuracy)} m
                {position.accuracy > 50 && ' — wait for a better fix if you can'}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{gpsError ?? 'Waiting for a GPS fix…'}</p>
          )}
        </div>

        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (optional): plant size, vine, soil, who was there…"
          rows={2}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
        />
        <div className="flex items-center gap-2">
          <input
            ref={photoInput}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            onClick={() => photoInput.current?.click()}
            className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted"
          >
            <Camera className="h-4 w-4" />
            {photo ? 'Change photo' : 'Add photo'}
          </button>
          {photo && (
            <button type="button" onClick={() => setPhoto(null)} className="inline-flex items-center gap-1 text-sm text-muted-foreground">
              <X className="h-4 w-4" /> {photo.name.slice(0, 24)}
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            type="button"
            disabled={!target || !position}
            onClick={() => void log('presence')}
            className="inline-flex min-h-16 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-lg font-semibold text-primary-foreground disabled:opacity-40"
          >
            <MapPin className="h-6 w-6" />
            Found it here
          </button>
          <button
            type="button"
            disabled={!target || !position}
            onClick={() => void log('absence')}
            className="inline-flex min-h-16 items-center justify-center gap-2 rounded-lg border-2 px-4 text-base font-medium disabled:opacity-40"
          >
            <SearchX className="h-5 w-5" />
            Searched — none here
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          &ldquo;None here&rdquo; logs are as useful as finds: they tell the model where it was wrong.
        </p>
        {flash && <p className="rounded-md bg-primary/10 px-3 py-2 text-sm text-primary" role="status">{flash}</p>}
      </section>

      {pending.length > 0 && (
        <section className="flex items-center justify-between gap-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
          <div>
            <p className="font-medium">{pending.length} waiting to upload</p>
            {pending.some((p) => p.lastError) && <p className="text-xs text-muted-foreground">{pending.find((p) => p.lastError)?.lastError}</p>}
          </div>
          <button type="button" onClick={() => void sync()} disabled={syncing || !online} className="rounded-md border px-3 py-2 disabled:opacity-40">
            {syncing ? 'Uploading…' : 'Upload now'}
          </button>
        </section>
      )}

      {target && (
        <section className="space-y-3 rounded-lg border bg-card p-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="font-semibold">Where to look</h2>
              <p className="text-xs text-muted-foreground">
                {offlineModel
                  ? `Best-scoring ground within 5 km, from the model saved ${new Date(offlineModel.savedAt).toLocaleDateString()}.`
                  : 'Save the latest model to this phone before you head out.'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void saveForOffline()}
              disabled={!online || saving || !target.latestModelId}
              className="inline-flex shrink-0 items-center gap-1 rounded-md border px-3 py-2 text-sm disabled:opacity-40"
            >
              <Download className="h-4 w-4" />
              {saving ? 'Saving…' : offlineModel?.modelId === target.latestModelId ? 'Saved' : 'Save offline'}
            </button>
          </div>
          {!target.latestModelId && <p className="text-sm text-muted-foreground">No model yet for {target.name}. Log some finds, then fit one on the target page.</p>}
          {offlineModel && position && <OfflineMap model={offlineModel} position={position} spots={nearby} />}
          {offlineModel && position && nearby.length === 0 && (
            <p className="text-sm text-muted-foreground">No top-scoring ground within 5 km of here (or you are outside the mapped area).</p>
          )}
          <ul className="divide-y">
            {nearby.map((s) => (
              <li key={`${s.lat},${s.lon}`} className="flex items-center gap-3 py-2">
                <Navigation className="h-5 w-5 shrink-0 text-primary" style={{ transform: `rotate(${s.bearing - 45}deg)` }} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {formatDistance(s.distance)} {compassPoint(s.bearing)} <span className="text-muted-foreground">({Math.round(s.bearing)}°)</span>
                  </p>
                  <p className="text-xs text-muted-foreground">Better than {Math.floor(s.percentile)}% of the area</p>
                </div>
              </li>
            ))}
          </ul>
          <Link href={`/admin/research/field/targets/${target.id}`} className="inline-block text-sm text-primary underline">
            Model and map for {target.name}
          </Link>
        </section>
      )}

      {recent.length > 0 && (
        <section className="rounded-lg border bg-card p-3">
          <h2 className="mb-2 font-semibold">Recent logs</h2>
          <ul className="divide-y text-sm">
            {recent.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-2 py-2">
                <span className="flex items-center gap-2">
                  {o.kind === 'presence' ? <MapPin className="h-4 w-4 text-primary" /> : <SearchX className="h-4 w-4 text-muted-foreground" />}
                  {new Date(o.observedAt).toLocaleString()}
                </span>
                <span className="text-xs text-muted-foreground">±{o.accuracyM === null ? '?' : Math.round(o.accuracyM)} m</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="pb-6 text-xs text-muted-foreground">
        Finds and saved maps are restricted knowledge. They stay on this phone until uploaded, and are visible only to super admins.
      </p>
    </div>
  );
}

/** A small offline map: saved basemap and suitability, with you and the spots on top. */
function OfflineMap({ model, position, spots }: { model: OfflineModel; position: Position; spots: Array<AreaSpot & { distance: number }> }) {
  const [urls, setUrls] = useState<{ base: string | null; area: string | null }>({ base: null, area: null });
  useEffect(() => {
    const base = model.basemap ? URL.createObjectURL(model.basemap) : null;
    const area = model.areaImage ? URL.createObjectURL(model.areaImage) : null;
    setUrls({ base, area });
    return () => {
      if (base) URL.revokeObjectURL(base);
      if (area) URL.revokeObjectURL(area);
    };
  }, [model]);
  const bounds = model.areaBounds;
  if (!bounds || !urls.base) return null;
  // Show a ~6 km window centred on the user, cropped from the whole-area images.
  const span = 0.055;
  const view = { west: position.lon - span / 2, east: position.lon + span / 2, north: position.lat + span / 2, south: position.lat - span / 2 };
  const scaleX = (bounds.east - bounds.west) / (view.east - view.west);
  const scaleY = (bounds.north - bounds.south) / (view.north - view.south);
  const imageStyle = {
    width: `${scaleX * 100}%`,
    height: `${scaleY * 100}%`,
    left: `${((bounds.west - view.west) / (view.east - view.west)) * 100}%`,
    top: `${((view.north - bounds.north) / (view.north - view.south)) * 100}%`,
  };
  const place = (lat: number, lon: number) => ({
    left: `${((lon - view.west) / (view.east - view.west)) * 100}%`,
    top: `${((view.north - lat) / (view.north - view.south)) * 100}%`,
  });
  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-md border bg-muted">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={urls.base} alt="" className="absolute max-w-none" style={imageStyle} />
      {urls.area && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={urls.area} alt="" className="absolute max-w-none opacity-80" style={{ ...imageStyle, imageRendering: 'pixelated' }} />
      )}
      {spots.map((s) => (
        <span
          key={`${s.lat},${s.lon}`}
          className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-red-700 shadow"
          style={place(s.lat, s.lon)}
        />
      ))}
      <span
        className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-blue-600 shadow-lg"
        style={place(position.lat, position.lon)}
        aria-label="You are here"
      />
      <span className="absolute bottom-1 right-1 rounded bg-black/50 px-1.5 text-[10px] text-white">≈6 km across</span>
    </div>
  );
}
