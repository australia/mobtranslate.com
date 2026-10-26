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

export function whenLogged(iso: string, now = new Date()): string {
  const date = new Date(iso);
  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const days = Math.floor((new Date(now.toDateString()).getTime() - new Date(date.toDateString()).getTime()) / 86_400_000);
  if (days === 0) return `Today ${time}`;
  if (days === 1) return `Yesterday ${time}`;
  if (days < 7) return `${date.toLocaleDateString(undefined, { weekday: 'long' })} ${time}`;
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
}

export function inBounds(b: { west: number; south: number; east: number; north: number } | null | undefined, lon: number, lat: number): boolean {
  return Boolean(b && lon >= b.west && lon <= b.east && lat >= b.south && lat <= b.north);
}
