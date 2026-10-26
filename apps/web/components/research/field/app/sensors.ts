'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type Fix = { lat: number; lon: number; accuracy: number; altitude: number | null; at: number };

export type GpsState =
  | { status: 'unsupported' }
  | { status: 'denied' }
  | { status: 'waiting' }
  | { status: 'live'; fix: Fix };

/** How good a fix is, in words the person holding the phone can act on. */
export function fixQuality(accuracy: number): { level: 'good' | 'fair' | 'weak'; label: string } {
  if (accuracy <= 12) return { level: 'good', label: 'Good' };
  if (accuracy <= 35) return { level: 'fair', label: 'Fair' };
  return { level: 'weak', label: 'Weak' };
}

/** Continuous high-accuracy GPS while the app is open. */
export function useGps(): GpsState {
  const [state, setState] = useState<GpsState>({ status: 'waiting' });
  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setState({ status: 'unsupported' });
      return;
    }
    const watch = navigator.geolocation.watchPosition(
      (p) =>
        setState({
          status: 'live',
          fix: { lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy, altitude: p.coords.altitude, at: p.timestamp },
        }),
      (error) => setState(error.code === error.PERMISSION_DENIED ? { status: 'denied' } : { status: 'waiting' }),
      { enableHighAccuracy: true, maximumAge: 2_000, timeout: 30_000 },
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, []);
  return state;
}

/**
 * The best (most accurate) fix seen since `since`, so a log taken while the
 * signal settles uses the sharpest position rather than the latest.
 */
export function useBestFix(gps: GpsState, since: number | null): Fix | null {
  const [best, setBest] = useState<Fix | null>(null);
  useEffect(() => setBest(null), [since]);
  useEffect(() => {
    if (since === null || gps.status !== 'live') return;
    const fix = gps.fix;
    setBest((current) => (!current || fix.accuracy <= current.accuracy ? fix : current));
  }, [gps, since]);
  return best;
}

type OrientationWithCompass = DeviceOrientationEvent & { webkitCompassHeading?: number };
type OrientationPermission = { requestPermission?: () => Promise<'granted' | 'denied'> };

/**
 * Which way the phone's top edge points, degrees clockwise from north, or
 * null when the device has no compass. iOS asks permission on a tap, so call
 * `enable` from a click handler.
 */
export function useHeading() {
  const [heading, setHeading] = useState<number | null>(null);
  const [enabled, setEnabled] = useState(false);
  const smoothed = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const update = (raw: number) => {
      const previous = smoothed.current;
      // Smooth across the 359°→0° wrap so the arrow does not spin.
      const next = previous === null ? raw : (previous + ((((raw - previous + 540) % 360) - 180) * 0.25) + 360) % 360;
      smoothed.current = next;
      setHeading(next);
    };
    const onOrientation = (event: Event) => {
      const e = event as OrientationWithCompass;
      if (typeof e.webkitCompassHeading === 'number') return update(e.webkitCompassHeading);
      if (e.absolute && typeof e.alpha === 'number') {
        const screenAngle = (screen.orientation?.angle ?? 0) as number;
        update((360 - e.alpha + screenAngle) % 360);
      }
    };
    window.addEventListener('deviceorientationabsolute', onOrientation);
    window.addEventListener('deviceorientation', onOrientation);
    return () => {
      window.removeEventListener('deviceorientationabsolute', onOrientation);
      window.removeEventListener('deviceorientation', onOrientation);
    };
  }, [enabled]);

  const enable = useCallback(async () => {
    const permission = (globalThis.DeviceOrientationEvent as unknown as OrientationPermission | undefined)?.requestPermission;
    if (permission) {
      try {
        if ((await permission()) !== 'granted') return;
      } catch {
        return;
      }
    }
    setEnabled(true);
  }, []);

  return { heading, enable };
}

/** Online/offline, following the browser's events. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setOnline(navigator.onLine);
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return online;
}
