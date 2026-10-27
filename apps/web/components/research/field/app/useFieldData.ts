'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ConditionsFeed, ConditionsModel, ConditionsUnfitted } from '@/lib/research/field/conditions';
import type { Activity, AreaSpot, Bounds, FieldObservation, FieldTarget } from '@/lib/research/field/types';
import {
  cache,
  cacheKeys,
  queue,
  type Basemap,
  type CachedConditionsFeed,
  type CachedConditionsModel,
  type CachedLogs,
  type CachedTargets,
  type QueuedObservation,
  type TargetBundle,
} from '../offline-store';

const API = '/api/admin/research/field';
/** A new log waits this long before uploading, so Undo stays local. */
export const UNDO_WINDOW_MS = 6_000;

/** A log as the map and lists show it: uploaded, or still on this phone. */
export type FieldLog = FieldObservation & { pending: boolean; uploadError: string | null };

export type Readiness = {
  /** Targets with a model whose map is saved at the latest version. */
  ready: number;
  /** Targets that have a model at all. */
  withModel: number;
  basemap: boolean;
  /** The fishing outlook (weather, river and every animal's model) is on this phone. */
  outlook: boolean;
  oldestSavedAt: string | null;
};

/** Which logs the app shows: one target's, or every fishing log together. */
type LogScope = { key: string; url: string };

function scopeOf(target: FieldTarget): LogScope {
  return target.activity === 'fish'
    ? { key: cacheKeys.fishingLogs, url: `${API}/observations?activity=fish` }
    : { key: cacheKeys.logs(target.id), url: `${API}/observations?targetId=${target.id}` };
}

/** Feeds older than this are fetched again when there is signal. */
const FEED_FRESH_MS = 60 * 60_000;

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', ...init });
  if (!response.ok) throw new Error(`${response.status}`);
  return (await response.json()) as T;
}

async function fetchImage(url: string): Promise<{ image: Blob; bounds: Bounds } | null> {
  const response = await fetch(url);
  const header = response.headers.get('x-bounds');
  if (!response.ok || !header) return null;
  return { image: await response.blob(), bounds: JSON.parse(header) as Bounds };
}

function pendingToLog(item: QueuedObservation): FieldLog {
  return {
    id: item.serverId ?? `pending:${item.clientId}`,
    clientId: item.clientId,
    targetId: item.targetId,
    kind: item.kind,
    latitude: item.latitude,
    longitude: item.longitude,
    accuracyM: item.accuracyM ?? null,
    altitudeM: item.altitudeM ?? null,
    observedAt: item.observedAt,
    notes: item.notes ?? null,
    loggedByName: item.loggedByName ?? null,
    hasPhoto: item.photo !== null,
    bait: item.bait ?? null,
    method: item.method ?? null,
    catchCount: item.catchCount ?? null,
    sizeCm: item.sizeCm ?? null,
    kept: item.kept ?? null,
    pending: true,
    uploadError: item.lastError,
  };
}

export function useFieldData(online: boolean, initialTarget: string | null) {
  const [targets, setTargets] = useState<FieldTarget[] | null>(null);
  const [targetsSavedAt, setTargetsSavedAt] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(initialTarget);
  const [serverLogs, setServerLogs] = useState<FieldObservation[]>([]);
  const [pending, setPending] = useState<QueuedObservation[]>([]);
  const [bundles, setBundles] = useState<Record<string, TargetBundle>>({});
  const [basemap, setBasemap] = useState<Basemap | null>(null);
  const [preparing, setPreparing] = useState<{ done: number; total: number } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [loggedByName, setLoggedByNameState] = useState('');
  const [feed, setFeed] = useState<CachedConditionsFeed | null>(null);
  const [conditionModels, setConditionModels] = useState<Record<string, CachedConditionsModel>>({});
  /** Whether the server last answered: phones on Wi-Fi with no internet still report online. */
  const [reachable, setReachable] = useState(true);
  const syncingRef = useRef(false);

  const selected = useMemo(() => targets?.find((t) => t.id === selectedId) ?? null, [targets, selectedId]);
  const fishIds = useMemo(() => new Set((targets ?? []).filter((t) => t.activity === 'fish').map((t) => t.id)), [targets]);
  const scope = selected ? scopeOf(selected) : null;

  // ---- targets -------------------------------------------------------------
  const refreshTargets = useCallback(async () => {
    try {
      const body = await fetchJson<{ targets: FieldTarget[] }>(`${API}/targets`);
      const savedAt = new Date().toISOString();
      setTargets(body.targets);
      setTargetsSavedAt(savedAt);
      setReachable(true);
      await cache.set(cacheKeys.targets, { savedAt, targets: body.targets } satisfies CachedTargets);
    } catch {
      setReachable(false);
      const cached = await cache.get<CachedTargets>(cacheKeys.targets).catch(() => undefined);
      setTargets(cached?.targets ?? []);
      setTargetsSavedAt(cached?.savedAt ?? null);
    }
  }, []);

  useEffect(() => {
    void refreshTargets();
    void queue.all().then(setPending).catch(() => undefined);
    void cache.get<string>(cacheKeys.loggedByName).then((name) => name && setLoggedByNameState(name)).catch(() => undefined);
    void cache.get<Basemap>(cacheKeys.basemap).then((b) => b && setBasemap(b)).catch(() => undefined);
    void cache.get<CachedConditionsFeed>(cacheKeys.conditionsFeed).then((f) => f && setFeed(f)).catch(() => undefined);
    if (!initialTarget) void cache.get<string>(cacheKeys.selectedTarget).then((id) => id && setSelectedId((c) => c ?? id)).catch(() => undefined);
  }, [refreshTargets, initialTarget]);

  useEffect(() => {
    if (!targets || targets.length === 0) return;
    if (!selectedId || !targets.some((t) => t.id === selectedId)) setSelectedId(targets[0].id);
    // Load every saved bundle so switching targets offline is instant.
    void Promise.all(targets.map((t) => cache.get<TargetBundle>(cacheKeys.bundle(t.id)).catch(() => undefined))).then((list) => {
      const next: Record<string, TargetBundle> = {};
      for (const b of list) if (b) next[b.targetId] = b;
      setBundles(next);
    });
    const fish = targets.filter((t) => t.activity === 'fish');
    void Promise.all(fish.map((t) => cache.get<CachedConditionsModel>(cacheKeys.conditionsModel(t.id)).catch(() => undefined))).then((list) => {
      const next: Record<string, CachedConditionsModel> = {};
      list.forEach((m, i) => {
        if (m) next[fish[i].id] = m;
      });
      setConditionModels((current) => ({ ...next, ...current }));
    });
  }, [targets, selectedId]);

  const select = useCallback((id: string) => {
    setSelectedId(id);
    void cache.set(cacheKeys.selectedTarget, id).catch(() => undefined);
  }, []);

  // ---- logs ----------------------------------------------------------------
  const loadLogs = useCallback(async (target: FieldTarget, show: boolean) => {
    const { key, url } = scopeOf(target);
    try {
      const body = await fetchJson<{ observations: FieldObservation[] }>(url);
      if (show) setServerLogs(body.observations);
      await cache.set(key, { savedAt: new Date().toISOString(), observations: body.observations } satisfies CachedLogs);
    } catch {
      const cached = await cache.get<CachedLogs>(key).catch(() => undefined);
      if (show) setServerLogs(cached?.observations ?? []);
    }
  }, []);

  const refreshLogs = useCallback(async () => {
    if (selected) await loadLogs(selected, true);
  }, [selected, loadLogs]);

  useEffect(() => {
    if (selected) void loadLogs(selected, true);
    // Reload only when the set of logs shown changes, not on every target refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope?.key, loadLogs]);

  const logs: FieldLog[] = useMemo(() => {
    const uploaded = new Set(serverLogs.map((o) => o.clientId));
    const inScope = (p: QueuedObservation) => (selected?.activity === 'fish' ? fishIds.has(p.targetId) : p.targetId === selectedId);
    const local = pending.filter((p) => inScope(p) && !uploaded.has(p.clientId)).map(pendingToLog);
    const remote = serverLogs.map((o) => ({ ...o, pending: false, uploadError: null }));
    return [...local, ...remote].sort((a, b) => b.observedAt.localeCompare(a.observedAt));
  }, [serverLogs, pending, selectedId, selected?.activity, fishIds]);

  // ---- fishing outlook -----------------------------------------------------
  const saveFeed = useCallback(async (): Promise<boolean> => {
    const body = await fetchJson<ConditionsFeed>(`${API}/conditions`).catch(() => null);
    if (!body) return false;
    const next: CachedConditionsFeed = { ...body, savedAt: new Date().toISOString() };
    await cache.set(cacheKeys.conditionsFeed, next);
    setFeed(next);
    return true;
  }, []);

  const saveConditionsModel = useCallback(async (targetId: string): Promise<boolean> => {
    const body = await fetchJson<{ model: ConditionsModel | ConditionsUnfitted }>(`${API}/targets/${targetId}/conditions`).catch(() => null);
    if (!body) return false;
    const next: CachedConditionsModel = { savedAt: new Date().toISOString(), model: body.model };
    await cache.set(cacheKeys.conditionsModel(targetId), next);
    setConditionModels((current) => ({ ...current, [targetId]: next }));
    return true;
  }, []);

  // While online, keep the selected animal's outlook current without asking.
  useEffect(() => {
    if (!online || selected?.activity !== 'fish') return;
    if (!feed || Date.now() - Date.parse(feed.savedAt) > FEED_FRESH_MS) void saveFeed();
    const saved = conditionModels[selected.id];
    if (!saved || Date.now() - Date.parse(saved.savedAt) > FEED_FRESH_MS) void saveConditionsModel(selected.id);
  }, [online, selected, feed, conditionModels, saveFeed, saveConditionsModel]);

  // ---- map bundles ---------------------------------------------------------
  const saveBundle = useCallback(async (target: FieldTarget): Promise<boolean> => {
    if (!target.latestModelId) return false;
    const modelId = target.latestModelId;
    const [spots, area] = await Promise.all([
      fetchJson<AreaSpot[]>(`${API}/models/${modelId}/area-spots`).catch(() => null),
      fetchImage(`${API}/models/${modelId}/area.png`),
    ]);
    if (!spots || !area) return false;
    const bundle: TargetBundle = { targetId: target.id, modelId, savedAt: new Date().toISOString(), spots, areaBounds: area.bounds, areaImage: area.image };
    await cache.set(cacheKeys.bundle(target.id), bundle);
    setBundles((current) => ({ ...current, [target.id]: bundle }));
    return true;
  }, []);

  const saveBasemap = useCallback(async (): Promise<boolean> => {
    const result = await fetchImage(`${API}/engine/basemap`);
    if (!result) return false;
    const next: Basemap = { savedAt: new Date().toISOString(), bounds: result.bounds, image: result.image };
    await cache.set(cacheKeys.basemap, next);
    setBasemap(next);
    return true;
  }, []);

  /** "Get ready for the field": every target's map and logs, the fishing outlook, the basemap and the app shell. */
  const prepareForField = useCallback(async () => {
    if (!targets) return;
    const fish = targets.filter((t) => t.activity === 'fish');
    const steps: Array<() => Promise<unknown>> = [
      saveBasemap,
      ...targets.filter((t) => t.latestModelId).map((t) => () => saveBundle(t)),
      ...targets.filter((t) => t.activity === 'gather').map((t) => () => loadLogs(t, false)),
      ...(fish.length > 0 ? [saveFeed, () => loadLogs(fish[0], false), ...fish.map((t) => () => saveConditionsModel(t.id))] : []),
    ];
    setPreparing({ done: 0, total: steps.length });
    try {
      await navigator.storage?.persist?.().catch(() => false);
      for (const [i, step] of steps.entries()) {
        await step().catch(() => false);
        setPreparing({ done: i + 1, total: steps.length });
      }
      navigator.serviceWorker?.controller?.postMessage('refresh-shell');
    } finally {
      setPreparing(null);
      void refreshLogs();
    }
  }, [targets, saveBasemap, saveBundle, loadLogs, saveFeed, saveConditionsModel, refreshLogs]);

  // While online, keep the selected target's map current without asking.
  useEffect(() => {
    if (!online || !selected?.latestModelId) return;
    if (bundles[selected.id]?.modelId === selected.latestModelId) return;
    void saveBundle(selected).catch(() => undefined);
  }, [online, selected, bundles, saveBundle]);

  useEffect(() => {
    if (online && !basemap && targets && targets.length > 0) void saveBasemap().catch(() => undefined);
  }, [online, basemap, targets, saveBasemap]);

  const readiness: Readiness = useMemo(() => {
    const withModel = (targets ?? []).filter((t) => t.latestModelId);
    const current = withModel.filter((t) => bundles[t.id]?.modelId === t.latestModelId);
    const dates = withModel.map((t) => bundles[t.id]?.savedAt).filter((d): d is string => Boolean(d)).sort();
    const fish = (targets ?? []).filter((t) => t.activity === 'fish');
    // The weather forecast in the feed runs a week, so a feed saved more than a few days ago has gone stale.
    const feedCurrent = feed !== null && Date.now() - Date.parse(feed.savedAt) < 3 * 86_400_000;
    const outlook = fish.length === 0 || (feedCurrent && fish.every((t) => conditionModels[t.id]));
    return { ready: current.length, withModel: withModel.length, basemap: basemap !== null, outlook, oldestSavedAt: dates[0] ?? null };
  }, [targets, bundles, basemap, feed, conditionModels]);

  // ---- queue and sync ------------------------------------------------------
  const sync = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    const touched = new Set<string>();
    try {
      const now = Date.now();
      for (const item of await queue.all()) {
        if (item.holdUntil > now) continue;
        try {
          let serverId = item.serverId;
          if (!serverId) {
            const { photo: _photo, serverId: _s, lastError: _e, holdUntil: _h, ...observation } = item;
            const body = await fetchJson<{ observations: FieldObservation[] }>(`${API}/observations`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ observations: [observation] }),
            });
            serverId = body.observations[0]?.id ?? null;
            if (!serverId) throw new Error('The server did not confirm the upload.');
            await queue.put({ ...item, serverId, lastError: null });
          }
          if (item.photo) {
            const form = new FormData();
            form.append('photo', item.photo, 'photo.jpg');
            const response = await fetch(`${API}/observations/${serverId}/photo`, { method: 'POST', body: form });
            if (!response.ok) throw new Error('The photo did not upload.');
          }
          await queue.remove(item.clientId);
          touched.add(item.targetId);
          // A new fishing log changes every animal's when-and-bait model.
          if (fishIds.has(item.targetId)) for (const id of fishIds) touched.add(id);
        } catch (error) {
          const message = error instanceof Error && !/^\d+$/.test(error.message) ? error.message : 'Upload failed. Will retry.';
          await queue.put({ ...item, lastError: message }).catch(() => undefined);
          break;
        }
      }
    } finally {
      setPending(await queue.all().catch(() => []));
      syncingRef.current = false;
      setSyncing(false);
    }
    if (selectedId && touched.has(selectedId)) {
      void refreshLogs();
      if (fishIds.has(selectedId)) void saveConditionsModel(selectedId);
    }
    if (touched.size > 0) void refreshTargets();
  }, [selectedId, fishIds, refreshLogs, refreshTargets, saveConditionsModel]);

  useEffect(() => {
    if (!online || reachable) return;
    const timer = setInterval(() => void refreshTargets(), 30_000);
    return () => clearInterval(timer);
  }, [online, reachable, refreshTargets]);

  // Retry while online and anything is waiting; also after each undo window.
  useEffect(() => {
    if (!online) return;
    void sync();
    const timer = setInterval(() => void sync(), 20_000);
    return () => clearInterval(timer);
  }, [online, sync]);

  const addLog = useCallback(
    async (entry: Omit<QueuedObservation, 'clientId' | 'serverId' | 'lastError' | 'holdUntil' | 'observedAt'> & { observedAt?: string }) => {
      const item: QueuedObservation = {
        ...entry,
        clientId: crypto.randomUUID(),
        observedAt: entry.observedAt ?? new Date().toISOString(),
        serverId: null,
        lastError: null,
        holdUntil: Date.now() + UNDO_WINDOW_MS,
      };
      await queue.put(item);
      setPending(await queue.all());
      setTimeout(() => {
        if (navigator.onLine) void sync();
      }, UNDO_WINDOW_MS + 250);
      return item.clientId;
    },
    [sync],
  );

  const undo = useCallback(async (clientId: string) => {
    const item = (await queue.all()).find((q) => q.clientId === clientId);
    if (item && !item.serverId) await queue.remove(clientId);
    setPending(await queue.all());
    return Boolean(item && !item.serverId);
  }, []);

  const deleteLog = useCallback(
    async (log: FieldLog): Promise<boolean> => {
      if (log.pending) {
        const item = (await queue.all()).find((q) => q.clientId === log.clientId);
        if (item && !item.serverId) {
          await queue.remove(log.clientId);
          setPending(await queue.all());
          return true;
        }
        return false;
      }
      const response = await fetch(`${API}/observations/${log.id}`, { method: 'DELETE' }).catch(() => null);
      if (!response?.ok) return false;
      setServerLogs((current) => current.filter((o) => o.id !== log.id));
      void refreshTargets();
      return true;
    },
    [refreshTargets],
  );

  const setLoggedByName = useCallback((name: string) => {
    setLoggedByNameState(name);
    void cache.set(cacheKeys.loggedByName, name).catch(() => undefined);
  }, []);

  const createTarget = useCallback(
    async (name: string, scientificNames: string[], activity: Activity): Promise<FieldTarget | null> => {
      try {
        const body = await fetchJson<{ target: FieldTarget }>(`${API}/targets`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name, scientificNames, activity }),
        });
        await refreshTargets();
        select(body.target.id);
        return body.target;
      } catch {
        return null;
      }
    },
    [refreshTargets, select],
  );

  return {
    reachable,
    targets,
    targetsSavedAt,
    selected,
    select,
    logs,
    refreshLogs,
    pending,
    syncing,
    sync,
    addLog,
    undo,
    deleteLog,
    bundle: selected ? bundles[selected.id] ?? null : null,
    feed,
    conditionsModel: selected ? conditionModels[selected.id]?.model ?? null : null,
    saveConditionsModel,
    basemap,
    readiness,
    preparing,
    prepareForField,
    loggedByName,
    setLoggedByName,
    createTarget,
    refreshTargets,
  };
}

export type FieldData = ReturnType<typeof useFieldData>;
