'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, CloudOff, CloudUpload, Fish, Layers, LocateFixed, Maximize2, Check } from 'lucide-react';
import type { AreaSpot, FishingMethod } from '@/lib/research/field/types';
import { formatCoordinate, inBounds, topShare } from '../geo';
import { cache, cacheKeys } from '../offline-store';
import CatchForm, { baitChoices } from './CatchForm';
import FishingBody from './FishingBody';
import FieldMap, { type FieldMapHandle, type MapLayers } from './FieldMap';
import GoToPanel from './GoToPanel';
import HomeBody, { type NearbySpot } from './HomeBody';
import LogControls from './LogControls';
import LogDetail from './LogDetail';
import LogForm from './LogForm';
import ModelPanel, { type FeatureTitles } from './ModelPanel';
import Sheet, { type SheetStop } from './Sheet';
import { LayersDialog, PhoneDialog, TargetDialog } from './Dialogs';
import { useBestFix, useGps, useHeading, useOnline } from './sensors';
import { UNDO_WINDOW_MS, useFieldData, type FieldLog } from './useFieldData';
import { Dialog, Toast } from './ui';

type Mode = { kind: 'home' } | { kind: 'log'; log: 'presence' | 'absence'; since: number } | { kind: 'goto'; spot: AreaSpot } | { kind: 'detail'; logId: string };
type Overlay = null | 'targets' | 'phone' | 'layers' | 'model';

const PANEL_WIDTH = 420;
const TITLES_KEY = 'feature-titles';

function useWide(): boolean {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(min-width: 64rem)');
    const update = () => setWide(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return wide;
}

export default function FieldApp({ initialTarget }: { initialTarget: string | null }) {
  const browserOnline = useOnline();
  const gps = useGps();
  const { heading, enable: enableCompass } = useHeading();
  const data = useFieldData(browserOnline, initialTarget);
  const online = browserOnline && data.reachable;
  const wide = useWide();
  const map = useRef<FieldMapHandle>(null);

  const [mode, setMode] = useState<Mode>({ kind: 'home' });
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [stop, setStop] = useState<SheetStop>('peek');
  const [sheetHeight, setSheetHeight] = useState(220);
  const [layers, setLayers] = useState<MapLayers>({ suitability: true, spots: true, logs: true });
  const [opacity, setOpacity] = useState(0.7);
  const [toast, setToast] = useState<{ message: string; undo?: string } | null>(null);
  const [titles, setTitles] = useState<FeatureTitles>({});
  const [lastBait, setLastBait] = useState<string | null>(null);
  const [lastMethod, setLastMethod] = useState<FishingMethod | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fix = gps.status === 'live' ? gps.fix : null;
  const best = useBestFix(gps, mode.kind === 'log' ? mode.since : null);
  const target = data.selected;
  const bundle = data.bundle;
  const outside = Boolean(fix && data.basemap && !inBounds(data.basemap.bounds, fix.lon, fix.lat));
  const selectedLog = mode.kind === 'detail' ? data.logs.find((l) => l.id === mode.logId) ?? null : null;
  const fishing = target?.activity === 'fish';
  const animals = useMemo(() => (data.targets ?? []).filter((t) => t.activity === 'fish'), [data.targets]);
  const baits = useMemo(() => baitChoices(data.logs.map((l) => l.bait)), [data.logs]);
  // A fishing log can be for any animal; show it under its own name.
  const logTarget = selectedLog ? (data.targets ?? []).find((t) => t.id === selectedLog.targetId) ?? target : null;

  useEffect(() => {
    void cache.get<string>(cacheKeys.lastBait).then((b) => b && setLastBait(b)).catch(() => undefined);
    void cache.get<FishingMethod>(cacheKeys.lastMethod).then((m) => m && setLastMethod(m)).catch(() => undefined);
  }, []);

  // The service worker lets the app open with no signal at all.
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    void navigator.serviceWorker.register('/admin/research/field/sw.js', { scope: '/admin/research/field' }).catch(() => undefined);
  }, []);

  // Plain-language names for model features, kept for offline use.
  useEffect(() => {
    void cache.get<FeatureTitles>(TITLES_KEY).then((t) => t && setTitles(t)).catch(() => undefined);
    if (!online) return;
    fetch('/api/admin/research/field/engine', { cache: 'no-store' })
      .then((r) => r.json())
      .then((body: { features?: Array<{ id: string; title: string }> }) => {
        if (!body.features?.length) return;
        const next = Object.fromEntries(body.features.map((f) => [f.id, f.title]));
        setTitles(next);
        void cache.set(TITLES_KEY, next);
      })
      .catch(() => undefined);
  }, [online]);

  const showToast = useCallback((message: string, undo?: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, undo });
    toastTimer.current = setTimeout(() => setToast(null), undo ? UNDO_WINDOW_MS : 3_500);
  }, []);

  const startLog = useCallback((kind: 'presence' | 'absence') => {
    setMode({ kind: 'log', log: kind, since: Date.now() });
    setStop('peek');
  }, []);

  const goTo = useCallback(
    (spot: AreaSpot) => {
      setMode({ kind: 'goto', spot });
      setStop('peek');
      void enableCompass();
      if (fix) map.current?.frame([[fix.lon, fix.lat], [spot.lon, spot.lat]]);
      else map.current?.centreOn(spot.lon, spot.lat, 15);
    },
    [enableCompass, fix],
  );

  const openLog = useCallback((log: FieldLog) => {
    setMode({ kind: 'detail', logId: log.id });
    setStop('peek');
    map.current?.centreOn(log.longitude, log.latitude);
  }, []);

  const sync = data.pending.length;
  const syncState = !online ? 'offline' : sync > 0 ? 'waiting' : 'clear';

  const header = (() => {
    if (mode.kind === 'log' && target && fishing)
      return (
        <CatchForm
          kind={mode.log}
          animals={animals}
          selectedId={target.id}
          gps={gps}
          best={best}
          loggedByName={data.loggedByName}
          baits={baits}
          lastBait={lastBait}
          lastMethod={lastMethod}
          onCancel={() => setMode({ kind: 'home' })}
          onSave={async (input) => {
            if (input.loggedByName && input.loggedByName !== data.loggedByName) data.setLoggedByName(input.loggedByName);
            // Bait and method rarely change between casts: offer them again next time.
            setLastBait(input.bait);
            setLastMethod(input.method);
            void cache.set(cacheKeys.lastBait, input.bait).catch(() => undefined);
            void cache.set(cacheKeys.lastMethod, input.method).catch(() => undefined);
            const clientId = await data.addLog({
              targetId: input.targetId,
              kind: mode.log,
              latitude: input.fix.lat,
              longitude: input.fix.lon,
              accuracyM: Math.round(input.fix.accuracy * 10) / 10,
              altitudeM: input.fix.altitude,
              observedAt: input.observedAt ?? undefined,
              notes: input.notes || null,
              loggedByName: input.loggedByName || null,
              bait: input.bait,
              method: input.method,
              catchCount: input.catchCount,
              sizeCm: input.sizeCm,
              kept: input.kept,
              photo: input.photo,
            });
            setMode({ kind: 'home' });
            const animal = animals.find((a) => a.id === input.targetId)?.name ?? 'Catch';
            showToast(mode.log === 'presence' ? `${animal} logged.` : 'Logged: nothing caught.', clientId);
          }}
        />
      );
    if (mode.kind === 'log' && target)
      return (
        <LogForm
          kind={mode.log}
          targetName={target.name}
          gps={gps}
          best={best}
          loggedByName={data.loggedByName}
          onCancel={() => setMode({ kind: 'home' })}
          onSave={async ({ fix: saved, notes, photo, loggedByName }) => {
            if (loggedByName && loggedByName !== data.loggedByName) data.setLoggedByName(loggedByName);
            const clientId = await data.addLog({
              targetId: target.id,
              kind: mode.log,
              latitude: saved.lat,
              longitude: saved.lon,
              accuracyM: Math.round(saved.accuracy * 10) / 10,
              altitudeM: saved.altitude,
              notes: notes || null,
              loggedByName: loggedByName || null,
              photo,
            });
            setMode({ kind: 'home' });
            showToast(mode.log === 'presence' ? 'Find logged.' : 'Logged: none here.', clientId);
          }}
        />
      );
    if (mode.kind === 'goto')
      return (
        <GoToPanel
          spot={mode.spot}
          fix={fix}
          heading={heading}
          fishing={fishing}
          onEnableCompass={() => void enableCompass()}
          onLog={startLog}
          onStop={() => setMode({ kind: 'home' })}
        />
      );
    if (mode.kind === 'detail' && selectedLog && logTarget)
      return (
        <LogDetail
          log={selectedLog}
          targetName={logTarget.name}
          activity={logTarget.activity}
          online={online}
          onDelete={data.deleteLog}
          onClose={() => setMode({ kind: 'home' })}
        />
      );
    return <LogControls gps={gps} outside={outside} targetName={target?.name ?? null} activity={target?.activity} onLog={startLog} />;
  })();

  const homeBody = fishing && target ? (
    <FishingBody
      animal={target}
      animals={animals}
      model={data.conditionsModel}
      feed={data.feed}
      bundle={bundle}
      fix={fix}
      heading={heading}
      logs={data.logs}
      readiness={data.readiness}
      online={online}
      onGoTo={(spot: NearbySpot) => goTo(spot)}
      onOpenLog={openLog}
      onPrepare={() => {
        setOverlay('phone');
        void data.prepareForField();
      }}
      onOpenModel={() => setOverlay('model')}
      showModelLink={!wide}
    />
  ) : (
    <HomeBody
      targetName={target?.name ?? null}
      hasModel={Boolean(target?.latestModelId)}
      bundle={bundle}
      fix={fix}
      heading={heading}
      logs={data.logs}
      readiness={data.readiness}
      online={online}
      onGoTo={(spot: NearbySpot) => goTo(spot)}
      onOpenLog={openLog}
      onPrepare={() => {
        setOverlay('phone');
        void data.prepareForField();
      }}
      onOpenModel={() => setOverlay('model')}
      showModelLink={!wide}
    />
  );

  const topGround = useMemo(() => (bundle ? bundle.spots.slice(0, 8) : []), [bundle]);

  return (
    <div className="field-app" style={{ ['--field-panel' as string]: wide ? `${PANEL_WIDTH}px` : '0px', ['--field-toast-offset' as string]: wide ? '1rem' : `${sheetHeight}px` }}>
      <FieldMap
        ref={map}
        basemap={data.basemap}
        suitability={bundle ? { image: bundle.areaImage, bounds: bundle.areaBounds } : null}
        spots={bundle?.spots ?? []}
        logs={data.logs}
        fix={fix}
        heading={heading}
        goTo={mode.kind === 'goto' ? mode.spot : null}
        selectedLogId={mode.kind === 'detail' ? mode.logId : null}
        layers={layers}
        overlayOpacity={opacity}
        inset={{ bottom: wide ? 0 : sheetHeight, left: wide ? PANEL_WIDTH : 0 }}
        onSelectLog={(id) => {
          const log = data.logs.find((l) => l.id === id);
          if (log) openLog(log);
        }}
        onSelectSpot={goTo}
        onBackground={() => {
          if (mode.kind === 'detail') setMode({ kind: 'home' });
        }}
      />

      <header className="field-topbar">
        <a href="/admin/research" className="field-chip field-chip-icon" aria-label="Back to research">
          <ChevronLeft className="h-5 w-5" aria-hidden />
        </a>
        <button type="button" className="field-chip field-chip-target" onClick={() => setOverlay('targets')} aria-haspopup="dialog">
          {fishing && <Fish className="h-4 w-4 shrink-0 text-[var(--field-ochre-deep)]" aria-label="Fishing" />}
          <span className="truncate">{target?.name ?? (data.targets === null ? 'Loading…' : 'Choose what to log')}</span>
          <ChevronDown className="h-4 w-4 shrink-0" aria-hidden />
        </button>
        <button
          type="button"
          className="field-chip field-chip-sync ml-auto"
          data-state={syncState}
          onClick={() => setOverlay('phone')}
          aria-haspopup="dialog"
          aria-label={syncState === 'offline' ? `Offline${sync ? `, ${sync} logs waiting` : ''}` : sync ? `${sync} logs waiting to upload` : 'All logs uploaded'}
        >
          {syncState === 'offline' ? <CloudOff className="h-4 w-4" aria-hidden /> : syncState === 'waiting' ? <CloudUpload className="h-4 w-4" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
          <span className="hidden text-sm sm:inline">{syncState === 'offline' ? 'Offline' : sync ? `${sync} waiting` : 'Up to date'}</span>
          {sync > 0 && <span className="text-sm tabular-nums sm:hidden">{sync}</span>}
        </button>
      </header>

      <div className="field-mapbtns">
        <button type="button" className="field-chip field-chip-icon" aria-label="Centre on me" disabled={!fix} onClick={() => fix && map.current?.centreOn(fix.lon, fix.lat, 16)}>
          <LocateFixed className="h-5 w-5" aria-hidden />
        </button>
        <button type="button" className="field-chip field-chip-icon" aria-label="Show the whole station" onClick={() => map.current?.showArea()}>
          <Maximize2 className="h-5 w-5" aria-hidden />
        </button>
        <button type="button" className="field-chip field-chip-icon" aria-label="Map layers" aria-haspopup="dialog" onClick={() => setOverlay('layers')}>
          <Layers className="h-5 w-5" aria-hidden />
        </button>
      </div>

      {wide ? (
        <aside className="field-panel" aria-label={target ? `${target.name} — logs and model` : 'Field'}>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="border-b border-[var(--field-line)] px-5 pb-4 pt-5">
              <p className="text-sm text-[var(--field-ink-soft)]">Field · Kalinga Station</p>
              <h1 className="mt-0.5 text-2xl font-semibold">{target?.name ?? 'Field'}</h1>
              {target && target.scientificNames.length > 0 && <p className="text-[var(--field-ink-soft)] italic">{target.scientificNames.join(', ')}</p>}
            </div>
            {mode.kind === 'detail' && selectedLog && logTarget ? (
              <div className="pt-4">
                <LogDetail
                  log={selectedLog}
                  targetName={logTarget.name}
                  activity={logTarget.activity}
                  online={online}
                  onDelete={data.deleteLog}
                  onClose={() => setMode({ kind: 'home' })}
                />
              </div>
            ) : (
              <>
                {target && (
                  <ModelPanel target={target} online={online} titles={titles} conditions={data.conditionsModel} onFitted={() => void data.refreshTargets()} />
                )}
                {topGround.length > 0 && (
                  <section className="space-y-2 border-t border-[var(--field-line)] px-5 py-4" aria-labelledby="top-ground">
                    <h3 id="top-ground" className="text-[0.9375rem] font-semibold">
                      The {topGround.length} best spots on the station
                      <span className="block text-sm font-normal text-[var(--field-ink-soft)]">
                        All in the {topShare(topGround[topGround.length - 1].percentile)}. Select one to see it on the map.
                      </span>
                    </h3>
                    <ol className="field-list">
                      {topGround.map((spot, index) => (
                        <li key={`${spot.lat},${spot.lon}`}>
                          <button type="button" className="field-row" onClick={() => map.current?.centreOn(spot.lon, spot.lat, 15)}>
                            <span className="field-row-icon field-row-icon-spot text-sm font-semibold tabular-nums">{index + 1}</span>
                            <span className="min-w-0 flex-1 font-mono text-sm">{formatCoordinate(spot.lat, spot.lon)}</span>
                          </button>
                        </li>
                      ))}
                    </ol>
                  </section>
                )}
                <div className="border-t border-[var(--field-line)]">{homeBody}</div>
              </>
            )}
          </div>
        </aside>
      ) : (
        <Sheet stop={stop} onStop={setStop} header={header} onHeight={setSheetHeight} label="Log and where to look">
          {homeBody}
        </Sheet>
      )}

      {toast && (
        <Toast
          message={toast.message}
          action={toast.undo ? 'Undo' : undefined}
          onAction={async () => {
            if (!toast.undo) return;
            const undone = await data.undo(toast.undo);
            showToast(undone ? 'Removed.' : 'Already uploaded. Open the log to delete it.');
          }}
        />
      )}

      <TargetDialog
        open={overlay === 'targets'}
        onClose={() => setOverlay(null)}
        targets={data.targets ?? []}
        selectedId={target?.id ?? null}
        online={online}
        onSelect={(id) => {
          data.select(id);
          setMode({ kind: 'home' });
        }}
        onCreate={data.createTarget}
        onEngineChanged={() => void data.refreshTargets()}
      />
      <PhoneDialog
        open={overlay === 'phone'}
        onClose={() => setOverlay(null)}
        online={online}
        pending={data.pending}
        syncing={data.syncing}
        onSync={() => void data.sync()}
        readiness={data.readiness}
        preparing={data.preparing}
        onPrepare={() => void data.prepareForField()}
      />
      <LayersDialog
        open={overlay === 'layers'}
        onClose={() => setOverlay(null)}
        fishing={fishing}
        layers={layers}
        onLayers={setLayers}
        opacity={opacity}
        onOpacity={setOpacity}
      />
      {!wide && target && (
        <Dialog open={overlay === 'model'} onClose={() => setOverlay(null)} title={`${target.name} model`} wide>
          <ModelPanel target={target} online={online} titles={titles} conditions={data.conditionsModel} onFitted={() => void data.refreshTargets()} />
        </Dialog>
      )}
    </div>
  );
}
