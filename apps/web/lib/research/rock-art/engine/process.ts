/**
 * Chunked, cancellable execution of the stretch pipeline (PRD §4.7).
 * Work happens on the main thread in row bands with cooperative yields, so
 * the interface stays responsive and any run can be superseded mid-flight.
 * Preview and export call exactly the same functions.
 */

import {
  type ApplyResult,
  type DStretchParams,
  type DStretchStats,
  type StatsRegion,
  applyTransform,
  computeStats,
  finalizeMapping,
} from "./dstretch";

export interface StretchRun {
  stats: DStretchStats;
  result: ApplyResult;
  /** Wall-clock processing time in ms. */
  elapsedMs: number;
}

const yieldToUi = () => new Promise<void>((r) => setTimeout(r, 0));

export class Cancelled extends Error {
  constructor() {
    super("cancelled");
  }
}

/**
 * Run the full stretch over `src`, writing 8-bit RGBA into `out`.
 * If `fixedStats` is provided (recipe replay / full-res export), statistics
 * are not recomputed — the stored transform is applied verbatim.
 */
export async function runStretch(
  src: Uint8ClampedArray,
  width: number,
  height: number,
  params: DStretchParams,
  out: Uint8ClampedArray,
  options: {
    region?: StatsRegion | null;
    fixedStats?: Pick<DStretchStats, "mean" | "transform"> | null;
    signal?: AbortSignal;
    onProgress?: (fraction: number) => void;
  } = {},
): Promise<StretchRun> {
  const t0 = performance.now();
  const { region = null, fixedStats = null, signal, onProgress } = options;

  const stats: DStretchStats = fixedStats
    ? {
        // Replay path: only mean + transform matter; carry them through and
        // zero the diagnostic-only fields.
        mean: fixedStats.mean,
        transform: fixedStats.transform,
        covariance: new Array(9).fill(0),
        eigenvalues: [0, 0, 0],
        eigenvectors: new Array(9).fill(0),
        gains: [1, 1, 1],
        conditionNumber: 1,
        sampleCount: 0,
      }
    : computeStats(src, width, height, params, region);

  const dstFloat = new Float32Array(width * height * 3);
  const BAND = Math.max(32, Math.floor(400_000 / Math.max(width, 1)));
  for (let y = 0; y < height; y += BAND) {
    if (signal?.aborted) throw new Cancelled();
    applyTransform(src, dstFloat, width, params, stats, y, Math.min(y + BAND, height));
    onProgress?.(Math.min(1, (y + BAND) / height) * 0.9);
    await yieldToUi();
  }

  if (signal?.aborted) throw new Cancelled();
  const result = finalizeMapping(dstFloat, out, params);
  onProgress?.(1);
  return { stats, result, elapsedMs: performance.now() - t0 };
}
