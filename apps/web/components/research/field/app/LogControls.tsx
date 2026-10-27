'use client';

import { Ban, Fish, LocateFixed, MapPin, SearchX } from 'lucide-react';
import type { Activity } from '@/lib/research/field/types';
import { formatCoordinate } from '../geo';
import { fixQuality, type GpsState } from './sensors';
import { Button } from './ui';

/** Your position in one line: quality in words, accuracy, coordinates. */
export function GpsLine({ gps, outside }: { gps: GpsState; outside: boolean }) {
  if (gps.status === 'unsupported') return <p className="field-gps field-gps-weak">This device cannot share its location.</p>;
  if (gps.status === 'denied')
    return (
      <p className="field-gps field-gps-weak">
        Location is off for this site. Turn it on in the browser’s site settings to log anything.
      </p>
    );
  if (gps.status === 'waiting')
    return (
      <p className="field-gps field-gps-waiting">
        <LocateFixed className="h-4 w-4 animate-pulse motion-reduce:animate-none" aria-hidden />
        Finding your position…
      </p>
    );
  const { fix } = gps;
  const quality = fixQuality(fix.accuracy);
  return (
    <div className="field-gps-row">
      <p className={`field-gps field-gps-${quality.level}`}>
        <span className="field-gps-dot" aria-hidden />
        <span className="font-semibold">{quality.label} fix</span>
        <span className="tabular-nums">±{Math.round(fix.accuracy)} m</span>
        {quality.level === 'weak' && <span className="text-[var(--field-ink-soft)]">· wait a moment if you can</span>}
      </p>
      <p className="field-coord" aria-label="Your coordinates">
        {formatCoordinate(fix.lat, fix.lon)}
      </p>
      {outside && <p className="field-note">You’re outside the mapped area. Logging still works; the map covers the station.</p>}
    </div>
  );
}

/** The two things you do most, always in reach at the bottom of the screen. */
export default function LogControls({
  gps,
  outside,
  targetName,
  activity = 'gather',
  onLog,
}: {
  gps: GpsState;
  outside: boolean;
  targetName: string | null;
  activity?: Activity;
  onLog: (kind: 'presence' | 'absence') => void;
}) {
  const disabled = !targetName || gps.status !== 'live';
  return (
    <div className="space-y-3 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <GpsLine gps={gps} outside={outside} />
      <div className="grid gap-2">
        {activity === 'fish' ? (
          <>
            <Button variant="primary" size="xl" disabled={disabled} onClick={() => onLog('presence')}>
              <Fish className="h-6 w-6 shrink-0" aria-hidden />
              Log a catch
            </Button>
            <Button variant="secondary" size="lg" disabled={disabled} onClick={() => onLog('absence')}>
              <Ban className="h-5 w-5 shrink-0" aria-hidden />
              Nothing caught <span className="font-normal text-[var(--field-ink-soft)]">· fished here</span>
            </Button>
          </>
        ) : (
          <>
            <Button variant="primary" size="xl" disabled={disabled} onClick={() => onLog('presence')}>
              <MapPin className="h-6 w-6 shrink-0" aria-hidden />
              Found it here
            </Button>
            <Button variant="secondary" size="lg" disabled={disabled} onClick={() => onLog('absence')}>
              <SearchX className="h-5 w-5 shrink-0" aria-hidden />
              None here <span className="font-normal text-[var(--field-ink-soft)]">· looked, not found</span>
            </Button>
          </>
        )}
      </div>
      {!targetName && <p className="field-note">Choose what you’re logging at the top of the screen.</p>}
    </div>
  );
}
