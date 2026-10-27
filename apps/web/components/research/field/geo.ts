/**
 * Field times are always shown in Queensland time, whatever the phone is set
 * to: dawn on the river is the same dawn wherever the phone was bought.
 */
export const AREA_TIME_ZONE = 'Australia/Brisbane';

function areaDate(date: Date): string {
  return date.toLocaleDateString('en-CA', { timeZone: AREA_TIME_ZONE });
}

const EARTH_RADIUS_M = 6_371_008.8;

export function distanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dp = p2 - p1;
  const dl = ((lon2 - lon1) * Math.PI) / 180;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

export function bearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dl = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

const POINTS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

export function compassPoint(bearing: number): string {
  return POINTS[Math.round(bearing / 22.5) % 16];
}

export function formatDistance(metres: number): string {
  if (metres < 1000) return `${Math.round(metres / 10) * 10} m`;
  return `${(metres / 1000).toFixed(metres < 10_000 ? 1 : 0)} km`;
}

export function formatCoordinate(lat: number, lon: number): string {
  return `${Math.abs(lat).toFixed(5)}°${lat < 0 ? 'S' : 'N'} ${Math.abs(lon).toFixed(5)}°${lon < 0 ? 'W' : 'E'}`;
}

const WORDS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];

/** "north-east" rather than "NE": read at a glance, said aloud to someone else. */
export function directionWords(bearing: number): string {
  return WORDS[Math.round(bearing / 45) % 8];
}

/** A landscape percentile as the share of the station it beats: "top 3%". */
export function topShare(percentile: number): string {
  const top = Math.max(1, Math.ceil(100 - percentile));
  return `top ${top}%`;
}

/** When a log was made, in Queensland time: "Today 6:12 pm", "Tuesday 7 am", "3 Oct". */
export function whenLogged(iso: string, now = new Date()): string {
  const date = new Date(iso);
  const days = Math.round((Date.parse(areaDate(now)) - Date.parse(areaDate(date))) / 86_400_000);
  if (days === 0) return `Today ${shortTime(date)}`;
  if (days === 1) return `Yesterday ${shortTime(date)}`;
  if (days > 1 && days < 7) return `${date.toLocaleDateString('en-AU', { weekday: 'long', timeZone: AREA_TIME_ZONE })} ${shortTime(date)}`;
  const sameYear = date.toLocaleDateString('en-CA', { year: 'numeric', timeZone: AREA_TIME_ZONE }) === now.toLocaleDateString('en-CA', { year: 'numeric', timeZone: AREA_TIME_ZONE });
  return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: sameYear ? undefined : 'numeric', timeZone: AREA_TIME_ZONE });
}

export function inBounds(b: { west: number; south: number; east: number; north: number } | null | undefined, lon: number, lat: number): boolean {
  return Boolean(b && lon >= b.west && lon <= b.east && lat >= b.south && lat <= b.north);
}

/** "Today", "Tomorrow" or the weekday, for times in the coming week. */
export function dayLabel(date: Date, now = new Date()): string {
  const days = Math.round((Date.parse(areaDate(date)) - Date.parse(areaDate(now))) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  return date.toLocaleDateString(undefined, { weekday: 'long', timeZone: AREA_TIME_ZONE });
}

/** "6 pm" or "6:30 pm": a time read at a glance. */
export function shortTime(date: Date): string {
  return date
    .toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', timeZone: AREA_TIME_ZONE })
    .replace(/:00(?=\s|$)/, '')
    .replace(/\s?([ap])\.?m\.?/i, (_, p: string) => ` ${p.toLowerCase()}m`);
}

/** A stretch of time: "Tomorrow 4–7 pm", or across midnight "Today 10 pm – 1 am". */
export function timeWindow(startIso: string, endIso: string, now = new Date()): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const a = shortTime(start);
  const b = shortTime(end);
  const sameHalf = a.slice(-2) === b.slice(-2) && areaDate(start) === areaDate(end);
  return `${dayLabel(start, now)} ${sameHalf ? `${a.slice(0, -3)}–${b}` : `${a} – ${b}`}`;
}

/** A chance relative to the usual: "1.8×", "3×". */
export function times(ratio: number): string {
  return `${ratio >= 2.95 ? Math.round(ratio) : ratio.toFixed(1)}×`;
}
