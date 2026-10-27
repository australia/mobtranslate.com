'use client';

import { useEffect, useMemo, useState } from 'react';
import { Ban, ChevronRight, Clock, Fish } from 'lucide-react';
import {
  almanac,
  baitLabel,
  ConditionsIndex,
  isFitted,
  outlook,
  outlookBait,
  situationAt,
  type ConditionsFeed,
  type ConditionsModel,
  type ConditionsUnfitted,
} from '@/lib/research/field/conditions';
import { FIELD_AREA } from '@/lib/research/field/area';
import { fishingMethodLabels, type FieldTarget } from '@/lib/research/field/types';
import { dayLabel, directionWords, formatDistance, shortTime, timeWindow, times, topShare, whenLogged } from '../geo';
import type { TargetBundle } from '../offline-store';
import { nearbySpots, ReadyCallout, SpotArrow, type NearbySpot } from './HomeBody';
import type { Fix } from './sensors';
import type { FieldLog, Readiness } from './useFieldData';
import { PanelHeading } from './ui';

const DAY_MS = 86_400_000;

/** The time, to the ten minutes: enough for an outlook, and it doesn't re-rank every second. */
function useNow(): Date {
  const tick = () => new Date(Math.floor(Date.now() / 600_000) * 600_000);
  const [now, setNow] = useState(tick);
  useEffect(() => {
    const timer = setInterval(() => setNow((current) => (tick().getTime() === current.getTime() ? current : tick())), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

function centimetres(m: number): string {
  return `${Math.abs(Math.round(m * 100))} cm`;
}

/** The river and the sky right now, from the saved feed and the phone's clock. */
function RightNow({ feed, now }: { feed: ConditionsFeed | null; now: Date }) {
  const index = useMemo(() => new ConditionsIndex(feed?.weather ?? [], feed?.river ?? []), [feed]);
  const situation = situationAt(now, index);
  const today = almanac(now);
  const tomorrow = almanac(new Date(now.getTime() + DAY_MS));
  const nextLight = [
    { label: 'Dawn', at: today.sunrise },
    { label: 'Dusk', at: today.sunset },
    { label: 'Dawn', at: tomorrow.sunrise },
    { label: 'Dusk', at: tomorrow.sunset },
  ].find((e) => e.at && Date.parse(e.at) > now.getTime());

  const change = situation.riverChange24hM;
  const river =
    situation.riverLevelM === null
      ? null
      : `${situation.riverLevelM.toFixed(2)} m${change === null ? '' : Math.abs(change) < 0.01 ? ', steady' : `, ${change > 0 ? 'up' : 'down'} ${centimetres(change)} today`}`;

  return (
    <dl className="field-facts">
      <div>
        <dt>{FIELD_AREA.river.shortName}</dt>
        <dd className="tabular-nums">{river ?? (feed ? 'No recent reading' : 'Needs signal once')}</dd>
      </div>
      <div>
        <dt>Rain this week</dt>
        <dd className="tabular-nums">{situation.rain7dMm === null ? (feed ? 'Not known' : 'Needs signal once') : `${Math.round(situation.rain7dMm)} mm`}</dd>
      </div>
      <div>
        <dt>Next good light</dt>
        <dd className="tabular-nums">{nextLight?.at ? `${nextLight.label} ${dayLabel(new Date(nextLight.at), now).toLowerCase()} ${shortTime(new Date(nextLight.at))}` : '—'}</dd>
      </div>
      <div>
        <dt>Moon</dt>
        <dd className="tabular-nums">
          {today.moonPhase}, {Math.round(today.moonLight * 100)}%
        </dd>
      </div>
    </dl>
  );
}

function WhenToGo({ animal, model, feed, now }: { animal: FieldTarget; model: ConditionsModel | ConditionsUnfitted | null; feed: ConditionsFeed | null; now: Date }) {
  const index = useMemo(() => new ConditionsIndex(feed?.weather ?? [], feed?.river ?? []), [feed]);
  const windows = useMemo(() => (isFitted(model) ? outlook(model, index, now) : []), [model, index, now]);

  if (!isFitted(model)) {
    const days = [0, 1, 2].map((d) => almanac(new Date(now.getTime() + d * DAY_MS)));
    return (
      <div className="space-y-3">
        <p className="field-empty">
          {model ? `Not enough logs yet for ${animal.name.toLowerCase()}. ${model.reason}` : 'The outlook needs signal once.'} Until then, the sun and moon:
        </p>
        <ul className="space-y-1 text-[0.9375rem] tabular-nums">
          {days.map((d) => (
            <li key={d.day}>
              <span className="font-medium">{dayLabel(new Date(`${d.day}T12:00:00+10:00`), now)}</span>
              <span className="text-[var(--field-ink-soft)]">
                {' '}
                · dawn {d.sunrise ? shortTime(new Date(d.sunrise)) : '—'} · dusk {d.sunset ? shortTime(new Date(d.sunset)) : '—'} · {d.moonPhase.toLowerCase()}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const bait = outlookBait(model);
  const early = model.validation.auc === null || model.validation.auc < 0.7 || model.logs < 30;
  return (
    <div className="space-y-2">
      {windows.length === 0 ? (
        <p className="field-empty">No time stands out this week. Go when you can.</p>
      ) : (
        <ol className="field-list">
          {windows.map((w, i) => (
            <li key={w.start} className="flex items-center gap-3 py-2">
              <span className="field-row-icon field-row-icon-spot">
                <Clock className="h-5 w-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold tabular-nums">{timeWindow(w.start, w.end, now)}</span>
                <span className="block text-sm text-[var(--field-ink-soft)]">
                  {[w.reasons.join(', '), `${times(w.ratio)} your usual`].filter(Boolean).join(' · ')}
                </span>
              </span>
              {i === 0 && <span className="field-tag">Best</span>}
            </li>
          ))}
        </ol>
      )}
      <p className="field-note">
        {early ? 'An early guess: it firms up as you log more, including when nothing’s biting. ' : ''}
        From {model.logs} fishing logs over {model.days} {model.days === 1 ? 'day' : 'days'}
        {bait ? `, assuming ${baitLabel(bait).toLowerCase()}` : ''}. Weather is the forecast for the station area.
      </p>
    </div>
  );
}

function WhatBait({ model }: { model: ConditionsModel | ConditionsUnfitted | null }) {
  const baits = (model?.baits ?? []).slice(0, 5);
  if (baits.length === 0) return <p className="field-empty">Pick the bait each time you log; the ones that work show here.</p>;
  const max = Math.max(1, ...baits.map((b) => b.ratio ?? 0));
  return (
    <ul className="space-y-2.5">
      {baits.map((b) => (
        <li key={b.bait} className="space-y-1">
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-semibold">{baitLabel(b.bait)}</span>
            {b.ratio !== null && <span className="text-sm tabular-nums text-[var(--field-ink-soft)]">{times(b.ratio)} your usual</span>}
          </div>
          {b.ratio !== null && <span className="field-bar" style={{ width: `${Math.max(6, (b.ratio / max) * 100)}%` }} aria-hidden />}
          <p className="text-sm text-[var(--field-ink-soft)]">
            Caught one on {b.positives} of {b.logs} {b.logs === 1 ? 'log' : 'logs'} with it
          </p>
        </li>
      ))}
    </ul>
  );
}

function logTitle(log: FieldLog, names: Map<string, string>): string {
  const name = names.get(log.targetId) ?? 'Catch';
  if (log.kind === 'absence') return `Nothing caught`;
  return [log.catchCount && log.catchCount > 1 ? `${name} ×${log.catchCount}` : name, log.sizeCm ? `${Math.round(log.sizeCm)} cm` : null].filter(Boolean).join(' · ');
}

/** Fishing home: the outlook, baits, where to try, and every catch. */
export default function FishingBody({
  animal,
  animals,
  model,
  feed,
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
  animal: FieldTarget;
  animals: FieldTarget[];
  model: ConditionsModel | ConditionsUnfitted | null;
  feed: ConditionsFeed | null;
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
  const now = useNow();
  const nearby = nearbySpots(bundle, fix);
  const names = useMemo(() => new Map(animals.map((a) => [a.id, a.name])), [animals]);
  const lower = animal.name.toLowerCase();

  return (
    <div className="space-y-6 px-4 pb-8 pt-2">
      <ReadyCallout readiness={readiness} online={online} onPrepare={onPrepare} />

      <section aria-labelledby="now-heading" className="space-y-3">
        <PanelHeading>
          <span id="now-heading">Right now</span>
        </PanelHeading>
        <RightNow feed={feed} now={now} />
      </section>

      <section aria-labelledby="when-heading" className="space-y-2">
        <PanelHeading aside={<span className="text-xs text-[var(--field-ink-soft)]">Next 7 days</span>}>
          <span id="when-heading">When to go for {lower}</span>
        </PanelHeading>
        <WhenToGo animal={animal} model={model} feed={feed} now={now} />
      </section>

      <section aria-labelledby="bait-heading" className="space-y-3">
        <PanelHeading>
          <span id="bait-heading">What bait for {lower}</span>
        </PanelHeading>
        <WhatBait model={model} />
      </section>

      <section aria-labelledby="where-heading" className="space-y-2">
        <PanelHeading aside={heading !== null ? <span className="text-xs text-[var(--field-ink-soft)]">Arrows follow your phone</span> : undefined}>
          <span id="where-heading">Where to fish next</span>
        </PanelHeading>
        {!animal.latestModelId ? (
          <p className="field-empty">
            No map for {lower} yet. Fit one from{' '}
            <button type="button" className="field-link" onClick={onOpenModel}>
              the model
            </button>{' '}
            once it has catches or public records.
          </p>
        ) : !bundle ? (
          <p className="field-empty">{online ? 'Loading the map…' : 'This map isn’t saved on this phone.'}</p>
        ) : !fix ? (
          <p className="field-empty">Waiting for your position.</p>
        ) : nearby.length === 0 ? (
          <p className="field-empty">No strong water within 5 km of here. Pan the map: the darkest red is the best on the station.</p>
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
                    <span className="block text-sm text-[var(--field-ink-soft)]">Water in the {topShare(spot.percentile)} of the station</span>
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
          <span id="logs-heading">Fishing logs</span>
        </PanelHeading>
        {logs.length === 0 ? (
          <p className="field-empty">Nothing logged yet. Tap “Log a catch” where you land one, or “Nothing caught” when they’re not biting.</p>
        ) : (
          <ul className="field-list">
            {logs.slice(0, 40).map((log) => (
              <li key={log.id}>
                <button type="button" className="field-row" onClick={() => onOpenLog(log)}>
                  <span className={`field-row-icon ${log.kind === 'presence' ? 'field-row-icon-find' : 'field-row-icon-none'}`}>
                    {log.kind === 'presence' ? <Fish className="h-5 w-5" aria-hidden /> : <Ban className="h-5 w-5" aria-hidden />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">
                      {logTitle(log, names)} · {whenLogged(log.observedAt)}
                    </span>
                    <span className="block truncate text-sm text-[var(--field-ink-soft)]">
                      {[log.bait ? baitLabel(log.bait) : null, log.method ? fishingMethodLabels[log.method] : null, log.loggedByName, log.notes].filter(Boolean).join(' · ') ||
                        'No details'}
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
            <span className="block font-medium">How the {lower} model works</span>
            <span className="block text-sm text-[var(--field-ink-soft)]">What it learned, what matters most, fit a new map</span>
          </span>
          <ChevronRight className="h-5 w-5 shrink-0 text-[var(--field-ink-soft)]" aria-hidden />
        </button>
      )}
    </div>
  );
}
