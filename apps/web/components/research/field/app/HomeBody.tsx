'use client';

import { ArrowUp, ChevronRight, CloudOff, Download, MapPin, SearchX } from 'lucide-react';
import type { AreaSpot } from '@/lib/research/field/types';
import { bearingDeg, directionWords, distanceM, formatDistance, topShare, whenLogged } from '../geo';
import type { TargetBundle } from '../offline-store';
import type { Fix } from './sensors';
import type { FieldLog, Readiness } from './useFieldData';
import { Button, PanelHeading } from './ui';

export type NearbySpot = AreaSpot & { distance: number; bearing: number };

const NEARBY_RADIUS_M = 5_000;

/** The closest strong ground: nearest first among the area's top spots. */
export function nearbySpots(bundle: TargetBundle | null, fix: Fix | null, limit = 6): NearbySpot[] {
  if (!bundle || !fix) return [];
  return bundle.spots
    .map((s) => ({ ...s, distance: distanceM(fix.lat, fix.lon, s.lat, s.lon), bearing: bearingDeg(fix.lat, fix.lon, s.lat, s.lon) }))
    .filter((s) => s.distance <= NEARBY_RADIUS_M)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit);
}

/** An arrow pointing at a spot: relative to where the phone faces when the compass is on, else to north. */
export function SpotArrow({ bearing, heading, className = 'h-5 w-5' }: { bearing: number; heading: number | null; className?: string }) {
  return <ArrowUp className={`${className} shrink-0 transition-transform duration-200 motion-reduce:transition-none`} style={{ transform: `rotate(${bearing - (heading ?? 0)}deg)` }} aria-hidden />;
}

export default function HomeBody({
  targetName,
  hasModel,
  bundle,
  fix,
  heading,
  logs,
  readiness,
  online,
  onGoTo,
  onOpenLog,
  onPrepare,
  onOpenModel,
  showModelLink = true,
}: {
  targetName: string | null;
  hasModel: boolean;
  bundle: TargetBundle | null;
  fix: Fix | null;
  heading: number | null;
  logs: FieldLog[];
  readiness: Readiness;
  online: boolean;
  onGoTo: (spot: NearbySpot) => void;
  onOpenLog: (log: FieldLog) => void;
  onPrepare: () => void;
  onOpenModel: () => void;
  showModelLink?: boolean;
}) {
  const nearby = nearbySpots(bundle, fix);
  const notReady = readiness.withModel > 0 && (readiness.ready < readiness.withModel || !readiness.basemap);

  return (
    <div className="space-y-6 px-4 pb-8 pt-2">
      {notReady && (
        <div className={`field-callout ${online ? '' : 'field-callout-warn'}`}>
          {online ? <Download className="mt-0.5 h-5 w-5 shrink-0" aria-hidden /> : <CloudOff className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />}
          <div className="min-w-0 flex-1 space-y-2">
            <p>
              {online
                ? 'Save the maps to this phone before you lose signal.'
                : `Only ${readiness.ready} of ${readiness.withModel} maps are on this phone. The rest need signal.`}
            </p>
            {online && (
              <Button variant="primary" onClick={onPrepare}>
                Get ready for the field
              </Button>
            )}
          </div>
        </div>
      )}

      <section aria-labelledby="where-heading" className="space-y-2">
        <PanelHeading aside={heading !== null ? <span className="text-xs text-[var(--field-ink-soft)]">Arrows follow your phone</span> : undefined}>
          <span id="where-heading">Where to look next</span>
        </PanelHeading>
        {!hasModel ? (
          <p className="field-empty">
            No model for {targetName ?? 'this'} yet. Log a few finds and a few “none here” spots, then fit one from{' '}
            <button type="button" className="field-link" onClick={onOpenModel}>
              the model
            </button>
            .
          </p>
        ) : !bundle ? (
          <p className="field-empty">{online ? 'Loading the map for this target…' : 'This target’s map isn’t saved on this phone.'}</p>
        ) : !fix ? (
          <p className="field-empty">Waiting for your position.</p>
        ) : nearby.length === 0 ? (
          <p className="field-empty">No strong ground within 5 km of here. Pan the map: the darkest red is the best ground on the station.</p>
        ) : (
          <ol className="field-list">
            {nearby.map((spot) => (
              <li key={`${spot.lat},${spot.lon}`}>
                <button type="button" className="field-row" onClick={() => onGoTo(spot)}>
                  <span className="field-row-icon field-row-icon-spot">
                    <SpotArrow bearing={spot.bearing} heading={heading} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold tabular-nums">
                      {formatDistance(spot.distance)} {directionWords(spot.bearing)}
                    </span>
                    <span className="block text-sm text-[var(--field-ink-soft)]">Ground in the {topShare(spot.percentile)} of the station</span>
                  </span>
                  <ChevronRight className="h-5 w-5 shrink-0 text-[var(--field-ink-soft)]" aria-hidden />
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section aria-labelledby="logs-heading" className="space-y-2">
        <PanelHeading aside={<span className="text-sm tabular-nums text-[var(--field-ink-soft)]">{logs.length}</span>}>
          <span id="logs-heading">Logs{targetName ? ` · ${targetName}` : ''}</span>
        </PanelHeading>
        {logs.length === 0 ? (
          <p className="field-empty">Nothing logged yet. Stand where you find it and tap “Found it here”.</p>
        ) : (
          <ul className="field-list">
            {logs.slice(0, 40).map((log) => (
              <li key={log.id}>
                <button type="button" className="field-row" onClick={() => onOpenLog(log)}>
                  <span className={`field-row-icon ${log.kind === 'presence' ? 'field-row-icon-find' : 'field-row-icon-none'}`}>
                    {log.kind === 'presence' ? <MapPin className="h-5 w-5" aria-hidden /> : <SearchX className="h-5 w-5" aria-hidden />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">
                      {log.kind === 'presence' ? 'Found' : 'None here'} · {whenLogged(log.observedAt)}
                    </span>
                    <span className="block truncate text-sm text-[var(--field-ink-soft)]">
                      {[log.loggedByName, log.accuracyM !== null ? `±${Math.round(log.accuracyM)} m` : null, log.notes].filter(Boolean).join(' · ') || 'No note'}
                    </span>
                  </span>
                  {log.pending && <span className={`field-tag ${log.uploadError ? 'field-tag-warn' : ''}`}>{log.uploadError ? 'Not sent' : 'On phone'}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {showModelLink && (
      <button type="button" onClick={onOpenModel} className="field-row field-row-plain">
        <span className="min-w-0 flex-1">
          <span className="block font-medium">How the {targetName ?? ''} model works</span>
          <span className="block text-sm text-[var(--field-ink-soft)]">What it learned from, how well it holds up, fit a new one</span>
        </span>
        <ChevronRight className="h-5 w-5 shrink-0 text-[var(--field-ink-soft)]" aria-hidden />
      </button>
      )}
    </div>
  );
}
