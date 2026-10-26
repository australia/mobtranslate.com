'use client';

import { Compass, MapPin, SearchX } from 'lucide-react';
import type { AreaSpot } from '@/lib/research/field/types';
import { bearingDeg, directionWords, distanceM, formatDistance, topShare } from '../geo';
import type { Fix } from './sensors';
import { Button } from './ui';

/**
 * Walking to a spot: one big arrow, the distance counting down, and the two
 * log actions once you are there.
 */
export default function GoToPanel({
  spot,
  fix,
  heading,
  onEnableCompass,
  onLog,
  onStop,
}: {
  spot: AreaSpot;
  fix: Fix | null;
  heading: number | null;
  onEnableCompass: () => void;
  onLog: (kind: 'presence' | 'absence') => void;
  onStop: () => void;
}) {
  const distance = fix ? distanceM(fix.lat, fix.lon, spot.lat, spot.lon) : null;
  const bearing = fix ? bearingDeg(fix.lat, fix.lon, spot.lat, spot.lon) : 0;
  const arrived = distance !== null && fix !== null && distance <= Math.max(20, fix.accuracy);
  const rotation = bearing - (heading ?? 0);

  return (
    <div className="space-y-4 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="flex items-center gap-4">
        <div className={`field-goto-dial ${heading === null ? 'field-goto-dial-north' : ''}`} aria-hidden>
          {heading === null && <span className="field-goto-north">N</span>}
          <svg viewBox="0 0 100 100" className="field-goto-arrow" style={{ transform: `rotate(${arrived ? 0 : rotation}deg)` }}>
            {arrived ? <circle cx="50" cy="50" r="18" /> : <path d="M50 10 L78 82 L50 66 L22 82 Z" />}
          </svg>
        </div>
        <div className="min-w-0 flex-1" aria-live="polite">
          {distance === null ? (
            <p className="text-lg font-semibold">Waiting for your position…</p>
          ) : arrived ? (
            <>
              <p className="text-2xl font-semibold">You’re there</p>
              <p className="text-[var(--field-ink-soft)]">Search within about 30 m, then log what you found.</p>
            </>
          ) : (
            <>
              <p className="text-[2.5rem] font-semibold leading-none tabular-nums">{formatDistance(distance)}</p>
              <p className="mt-1 text-lg">Walk {directionWords(bearing)}</p>
              <p className="text-sm text-[var(--field-ink-soft)]">
                {heading === null ? 'Arrow points relative to north.' : 'Arrow turns with your phone.'} Ground in the {topShare(spot.percentile)} of the station.
              </p>
            </>
          )}
        </div>
      </div>

      {heading === null && !arrived && (
        <Button variant="secondary" onClick={onEnableCompass} className="w-full">
          <Compass className="h-5 w-5" aria-hidden /> Use my phone’s compass
        </Button>
      )}

      {arrived ? (
        <div className="grid gap-2">
          <Button variant="primary" size="xl" onClick={() => onLog('presence')}>
            <MapPin className="h-6 w-6" aria-hidden /> Found it here
          </Button>
          <Button variant="secondary" size="lg" onClick={() => onLog('absence')}>
            <SearchX className="h-5 w-5 shrink-0" aria-hidden />
            None here <span className="font-normal text-[var(--field-ink-soft)]">· looked, not found</span>
          </Button>
        </div>
      ) : null}

      <Button variant="ghost" onClick={onStop} className="w-full">
        Stop guiding
      </Button>
    </div>
  );
}
