/**
 * Spacing-thinned field shortlist.
 *
 * The published proposal markers cluster: the highest-ranked cells are often
 * adjacent 90 m neighbours describing one locale. A field day (or a helicopter
 * flight plan) wants one target per locale, ranked purely by the model — no
 * reachability weighting, per the family's direction that access must never
 * shape where the model points.
 *
 * Greedy thinning by rank: walk proposals from the highest confidence down and
 * keep a proposal only when it sits at least `minimumSpacingMetres` from every
 * proposal already kept. Deterministic for a fixed input order.
 */

export type ThinnablePoint = {
  latitude: number;
  longitude: number;
  confidencePercentile: number;
};

export function haversineMetres(
  a: {latitude: number; longitude: number},
  b: {latitude: number; longitude: number},
): number {
  const radius = 6_371_000;
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h = sinLat * sinLat + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * sinLon * sinLon;
  return 2 * radius * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function thinByMinimumSpacing<T extends ThinnablePoint>(
  points: readonly T[],
  minimumSpacingMetres: number,
  maximumCount: number,
): T[] {
  if (!(minimumSpacingMetres > 0) || !(maximumCount > 0)) return [];
  const ranked = [...points].sort((left, right) => right.confidencePercentile - left.confidencePercentile);
  const kept: T[] = [];
  for (const candidate of ranked) {
    if (kept.length >= maximumCount) break;
    if (kept.every((existing) => haversineMetres(existing, candidate) >= minimumSpacingMetres)) {
      kept.push(candidate);
    }
  }
  return kept;
}
