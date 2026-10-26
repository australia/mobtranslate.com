/**
 * Sampled-colour segmentation (FR-SEG-002, ΔE76 variant).
 *
 * The user clicks points on the pigment they care about; every pixel whose
 * Lab distance (ΔE76) to the NEAREST sample falls under the threshold joins
 * the selection. Deterministic, transparent, and fast enough to recompute
 * live on the ≤2.2 MP preview.
 */

import { srgbToLab } from "./colorspace";

export interface ColourSample {
  x: number;
  y: number;
  lab: [number, number, number];
}

/** Read a sample's Lab colour from image data (3×3 average around the point). */
export function sampleAt(data: ImageData, x: number, y: number): ColourSample {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const xi = Math.min(Math.max(x + dx, 0), data.width - 1);
      const yi = Math.min(Math.max(y + dy, 0), data.height - 1);
      const i = (yi * data.width + xi) * 4;
      r += data.data[i];
      g += data.data[i + 1];
      b += data.data[i + 2];
      n++;
    }
  }
  return { x, y, lab: srgbToLab(r / n / 255, g / n / 255, b / n / 255) };
}

/**
 * Build a binary selection mask (0/255 per pixel) of everything within
 * `deltaE` of any sample. Returns coverage fraction for the UI.
 */
export function deltaEMask(
  data: ImageData,
  samples: ColourSample[],
  deltaE: number,
  out: Uint8ClampedArray, // width*height bytes
): number {
  const px = data.width * data.height;
  const d2 = deltaE * deltaE;
  let selected = 0;
  for (let p = 0, i = 0; p < px; p++, i += 4) {
    const [L, a, b] = srgbToLab(
      data.data[i] / 255,
      data.data[i + 1] / 255,
      data.data[i + 2] / 255,
    );
    let hit = 0;
    for (const s of samples) {
      const dL = L - s.lab[0];
      const da = a - s.lab[1];
      const db = b - s.lab[2];
      if (dL * dL + da * da + db * db < d2) {
        hit = 255;
        break;
      }
    }
    out[p] = hit;
    if (hit) selected++;
  }
  return selected / px;
}

/**
 * Keep only mask regions 4-connected to at least one sample point — the
 * pieces the user actually pointed at. Removes speckle that merely shares
 * the pigment colour (distant stains, bright rock).
 */
export function keepConnectedToSamples(
  mask: Uint8ClampedArray,
  width: number,
  height: number,
  samples: ColourSample[],
): number {
  const keep = new Uint8ClampedArray(mask.length);
  const queue = new Int32Array(mask.length);
  let head = 0;
  let tail = 0;
  for (const s of samples) {
    // find a masked pixel at/near the sample (the exact click may sit on a
    // sub-threshold pixel after averaging)
    outer: for (let r = 0; r < 6; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const x = s.x + dx;
          const y = s.y + dy;
          if (x < 0 || y < 0 || x >= width || y >= height) continue;
          const p = y * width + x;
          if (mask[p] && !keep[p]) {
            keep[p] = 255;
            queue[tail++] = p;
            break outer;
          }
        }
      }
    }
  }
  while (head < tail) {
    const p = queue[head++];
    const x = p % width;
    if (x > 0 && mask[p - 1] && !keep[p - 1]) { keep[p - 1] = 255; queue[tail++] = p - 1; }
    if (x < width - 1 && mask[p + 1] && !keep[p + 1]) { keep[p + 1] = 255; queue[tail++] = p + 1; }
    if (p >= width && mask[p - width] && !keep[p - width]) { keep[p - width] = 255; queue[tail++] = p - width; }
    if (p + width < mask.length && mask[p + width] && !keep[p + width]) { keep[p + width] = 255; queue[tail++] = p + width; }
  }
  mask.set(keep);
  let selected = 0;
  for (let p = 0; p < mask.length; p++) if (mask[p]) selected++;
  return selected / (width * height);
}
