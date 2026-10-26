/**
 * Global decorrelation stretch (PRD §11.2).
 *
 * Pipeline: convert pixels to the working colour space, estimate mean and
 * covariance (or correlation) from a deterministic pixel sample, eigendecompose,
 * build a variance-equalising transform with an eigenvalue floor and gain limit,
 * blend with identity by `strength`, apply per pixel, convert back to sRGB and
 * map through a percentile stretch.
 *
 * The computed transform (μ + matrix) is stored in the recipe, so export replays
 * the exact matrix rather than re-estimating statistics — preview and export are
 * mathematically identical (PRD §4.3) and the transform is reusable across
 * images (FR-DCS-007).
 */

import {
  type ColourSpace,
  toSpace,
  fromSpace,
} from "./colorspace";
import {
  type Mat3,
  type Vec3,
  IDENTITY,
  eigenSym3,
  matMul,
  matScaleAdd,
  transpose,
} from "./linalg";

export interface DStretchParams {
  colourSpace: ColourSpace;
  /** "covariance" preserves channel scales; "correlation" normalises them first. */
  matrixMode: "covariance" | "correlation";
  /** 0 = identity, 1 = full decorrelation. */
  strength: number;
  /** Upper bound on per-component amplification. */
  maxGain: number;
  /** Percentile clip applied to the output mapping, e.g. 0.5 → clip 0.5%/99.5%. */
  clipPercent: number;
  /** 1 = unchanged, <1 desaturates the stretched output, >1 boosts. */
  saturation: number;
}

export const DEFAULT_PARAMS: DStretchParams = {
  colourSpace: "lab",
  matrixMode: "covariance",
  strength: 0.75,
  maxGain: 8,
  clipPercent: 0.5,
  saturation: 1,
};

export interface DStretchStats {
  mean: Vec3;
  covariance: Mat3;
  eigenvalues: Vec3;
  eigenvectors: Mat3;
  /** Gain applied per principal component after the max-gain clamp. */
  gains: Vec3;
  /** Final working-space transform: y = (x − μ)·T + μ, before strength blending. */
  transform: Mat3;
  /** λmax / λmin before regularisation flooring. */
  conditionNumber: number;
  sampleCount: number;
}

export interface StatsRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Estimate stretch statistics from RGBA pixel data.
 * Sampling is a deterministic stride over the (optional) region, capped at
 * ~250k samples, so the same inputs always produce the same statistics.
 */
export function computeStats(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  params: DStretchParams,
  region?: StatsRegion | null,
): DStretchStats {
  const rx = region ? Math.max(0, Math.floor(region.x)) : 0;
  const ry = region ? Math.max(0, Math.floor(region.y)) : 0;
  const rw = region ? Math.min(width - rx, Math.ceil(region.width)) : width;
  const rh = region ? Math.min(height - ry, Math.ceil(region.height)) : height;
  const total = Math.max(1, rw * rh);
  const stride = Math.max(1, Math.floor(Math.sqrt(total / 250_000)));

  // Accumulate mean and covariance in one pass (shifted sums are fine at
  // these magnitudes since working-space values are bounded).
  let n = 0;
  const sum = [0, 0, 0];
  const sq = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (let y = ry; y < ry + rh; y += stride) {
    for (let x = rx; x < rx + rw; x += stride) {
      const i = (y * width + x) * 4;
      const [c0, c1, c2] = toSpace(
        params.colourSpace,
        rgba[i] / 255,
        rgba[i + 1] / 255,
        rgba[i + 2] / 255,
      );
      n++;
      sum[0] += c0;
      sum[1] += c1;
      sum[2] += c2;
      sq[0] += c0 * c0;
      sq[1] += c0 * c1;
      sq[2] += c0 * c2;
      sq[4] += c1 * c1;
      sq[5] += c1 * c2;
      sq[8] += c2 * c2;
    }
  }

  const mean: Vec3 = [sum[0] / n, sum[1] / n, sum[2] / n];
  const denom = Math.max(1, n - 1);
  const cov: Mat3 = new Array(9).fill(0);
  const covOf = (a: number, b: number, s: number) =>
    (s - n * mean[a] * mean[b]) / denom;
  cov[0] = covOf(0, 0, sq[0]);
  cov[1] = cov[3] = covOf(0, 1, sq[1]);
  cov[2] = cov[6] = covOf(0, 2, sq[2]);
  cov[4] = covOf(1, 1, sq[4]);
  cov[5] = cov[7] = covOf(1, 2, sq[5]);
  cov[8] = covOf(2, 2, sq[8]);

  // Correlation mode: normalise by channel standard deviations, stretch,
  // then restore the original scales (D S⁻¹ R S D⁻¹ pattern folded into T).
  let work: Mat3 = cov;
  let scaleIn: Vec3 = [1, 1, 1];
  if (params.matrixMode === "correlation") {
    scaleIn = [
      Math.sqrt(Math.max(cov[0], 1e-12)),
      Math.sqrt(Math.max(cov[4], 1e-12)),
      Math.sqrt(Math.max(cov[8], 1e-12)),
    ];
    work = cov.slice();
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        work[i * 3 + j] /= scaleIn[i] * scaleIn[j];
      }
    }
  }

  const { values, vectors } = eigenSym3(work);
  const meanEig = (values[0] + values[1] + values[2]) / 3;
  // Automatic regularisation: eigenvalue floor proportional to total variance.
  const floor = Math.max(1e-12, meanEig * 1e-4);
  const target = Math.sqrt(Math.max(meanEig, floor));
  const gains: Vec3 = values.map((v) => {
    const g = target / Math.sqrt(Math.max(v, floor));
    return Math.min(Math.max(g, 1 / params.maxGain), params.maxGain);
  });

  // T = V diag(g) Vᵀ (in correlation mode, wrapped in the channel scalings).
  const d: Mat3 = [gains[0], 0, 0, 0, gains[1], 0, 0, 0, gains[2]];
  let transform = matMul(matMul(vectors, d), transpose(vectors));
  if (params.matrixMode === "correlation") {
    const t = transform.slice();
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        t[i * 3 + j] = (transform[i * 3 + j] * scaleIn[j]) / scaleIn[i];
      }
    }
    transform = t;
  }

  const condition =
    Math.max(...values) / Math.max(Math.min(...values), 1e-12);

  return {
    mean,
    covariance: cov,
    eigenvalues: values,
    eigenvectors: vectors,
    gains,
    transform,
    conditionNumber: condition,
    sampleCount: n,
  };
}

export interface ApplyResult {
  /** Fraction of output samples clipped by the percentile mapping, per channel. */
  clippedPercent: number;
}

/**
 * Apply a precomputed stretch transform to RGBA data in place.
 * `rowStart`/`rowEnd` allow chunked processing so the UI can yield and cancel.
 * The percentile mapping needs the whole image, so it runs in `finalizeMapping`.
 */
export function applyTransform(
  src: Uint8ClampedArray,
  dstFloat: Float32Array, // 3 floats per pixel, sRGB unclamped
  width: number,
  params: DStretchParams,
  stats: Pick<DStretchStats, "mean" | "transform">,
  rowStart: number,
  rowEnd: number,
): void {
  const t: Mat3 = matScaleAdd(IDENTITY, 1 - params.strength, stats.transform, params.strength);
  const [m0, m1, m2] = stats.mean;
  const space = params.colourSpace;
  for (let y = rowStart; y < rowEnd; y++) {
    let i = y * width * 4;
    let o = y * width * 3;
    for (let x = 0; x < width; x++, i += 4, o += 3) {
      const [c0, c1, c2] = toSpace(space, src[i] / 255, src[i + 1] / 255, src[i + 2] / 255);
      const d0 = c0 - m0;
      const d1 = c1 - m1;
      const d2 = c2 - m2;
      const y0 = d0 * t[0] + d1 * t[3] + d2 * t[6] + m0;
      const y1 = d0 * t[1] + d1 * t[4] + d2 * t[7] + m1;
      const y2 = d0 * t[2] + d1 * t[5] + d2 * t[8] + m2;
      const [r, g, b] = fromSpace(space, y0, y1, y2);
      dstFloat[o] = r;
      dstFloat[o + 1] = g;
      dstFloat[o + 2] = b;
    }
  }
}

/**
 * Percentile-clip mapping from unclamped float sRGB to 8-bit output, with a
 * saturation control. A shared luminance-agnostic mapping is computed over all
 * three channels together so hue relationships survive the stretch.
 */
export function finalizeMapping(
  dstFloat: Float32Array,
  out: Uint8ClampedArray,
  params: DStretchParams,
): ApplyResult {
  const n = dstFloat.length;
  // Histogram over all channels, 2048 bins across a generous range.
  const BINS = 2048;
  const LO = -1;
  const HI = 2;
  const hist = new Float64Array(BINS);
  for (let i = 0; i < n; i++) {
    let v = dstFloat[i];
    if (!Number.isFinite(v)) v = 0;
    const bIdx = Math.min(BINS - 1, Math.max(0, Math.floor(((v - LO) / (HI - LO)) * BINS)));
    hist[bIdx]++;
  }
  const clip = Math.min(Math.max(params.clipPercent, 0), 10) / 100;
  const target = n * clip;
  // `acc > 0` guard: at clip 0 we want the first/last non-empty bin (the data
  // range), not the fixed histogram bounds.
  let acc = 0;
  let lowBin = 0;
  for (let i = 0; i < BINS; i++) {
    acc += hist[i];
    if (acc >= target && acc > 0) {
      lowBin = i;
      break;
    }
  }
  acc = 0;
  let highBin = BINS - 1;
  for (let i = BINS - 1; i >= 0; i--) {
    acc += hist[i];
    if (acc >= target && acc > 0) {
      highBin = i;
      break;
    }
  }
  const low = LO + (lowBin / BINS) * (HI - LO);
  const high = LO + ((highBin + 1) / BINS) * (HI - LO);
  const scale = 255 / Math.max(high - low, 1e-6);
  const sat = params.saturation;

  let clipped = 0;
  const px = n / 3;
  for (let p = 0, i = 0, o = 0; p < px; p++, i += 3, o += 4) {
    let r = (dstFloat[i] - low) * scale;
    let g = (dstFloat[i + 1] - low) * scale;
    let b = (dstFloat[i + 2] - low) * scale;
    if (sat !== 1) {
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      r = lum + (r - lum) * sat;
      g = lum + (g - lum) * sat;
      b = lum + (b - lum) * sat;
    }
    if (r < 0 || r > 255) clipped++;
    if (g < 0 || g > 255) clipped++;
    if (b < 0 || b > 255) clipped++;
    out[o] = r;
    out[o + 1] = g;
    out[o + 2] = b;
    out[o + 3] = 255;
  }
  return { clippedPercent: (clipped / n) * 100 };
}
