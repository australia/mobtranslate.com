/**
 * Colour-space conversions used by the analysis engine.
 * All functions take and return values in documented, fixed ranges so the
 * same code path serves preview and full-resolution export (PRD §4.3).
 *
 * sRGB channels are [0,1]. Lab is CIE L*a*b* under D65 (L* 0–100).
 * YCbCr is full-range BT.601 with Cb/Cr in [0,1] centred on 0.5.
 */

export type ColourSpace = "srgb" | "linear-rgb" | "lab" | "ycbcr";

export const COLOUR_SPACES: { id: ColourSpace; label: string }[] = [
  { id: "lab", label: "CIELAB" },
  { id: "srgb", label: "sRGB" },
  { id: "linear-rgb", label: "Linear RGB" },
  { id: "ycbcr", label: "YCbCr" },
];

export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

// D65 reference white
const XN = 0.95047;
const YN = 1.0;
const ZN = 1.08883;
const EPS = 216 / 24389;
const KAPPA = 24389 / 27;

function fLab(t: number): number {
  return t > EPS ? Math.cbrt(t) : (KAPPA * t + 16) / 116;
}

function fLabInv(t: number): number {
  const t3 = t * t * t;
  return t3 > EPS ? t3 : (116 * t - 16) / KAPPA;
}

/** sRGB [0,1] → Lab (L* 0–100, a* and b* roughly ±100). */
export function srgbToLab(r: number, g: number, b: number): [number, number, number] {
  const rl = srgbToLinear(r);
  const gl = srgbToLinear(g);
  const bl = srgbToLinear(b);
  const x = (0.4124564 * rl + 0.3575761 * gl + 0.1804375 * bl) / XN;
  const y = (0.2126729 * rl + 0.7151522 * gl + 0.072175 * bl) / YN;
  const z = (0.0193339 * rl + 0.119192 * gl + 0.9503041 * bl) / ZN;
  const fx = fLab(x);
  const fy = fLab(y);
  const fz = fLab(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** Lab → sRGB [0,1] (unclamped; caller clamps). */
export function labToSrgb(L: number, a: number, bb: number): [number, number, number] {
  const fy = (L + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - bb / 200;
  const x = fLabInv(fx) * XN;
  const y = fLabInv(fy) * YN;
  const z = fLabInv(fz) * ZN;
  const rl = 3.2404542 * x - 1.5371385 * y - 0.4985314 * z;
  const gl = -0.969266 * x + 1.8760108 * y + 0.041556 * z;
  const bl = 0.0556434 * x - 0.2040259 * y + 1.0572252 * z;
  return [linearToSrgb(rl), linearToSrgb(gl), linearToSrgb(bl)];
}

/** sRGB [0,1] → full-range BT.601 YCbCr, all channels [0,1]. */
export function srgbToYcbcr(r: number, g: number, b: number): [number, number, number] {
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  return [y, 0.5 + (b - y) / 1.772, 0.5 + (r - y) / 1.402];
}

export function ycbcrToSrgb(y: number, cb: number, cr: number): [number, number, number] {
  const r = y + 1.402 * (cr - 0.5);
  const b = y + 1.772 * (cb - 0.5);
  const g = (y - 0.299 * r - 0.114 * b) / 0.587;
  return [r, g, b];
}

/** sRGB [0,1] → HSV, all channels [0,1] (H wraps). Channel viewer only. */
export function srgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
    if (h < 0) h += 1;
  }
  return [h, max === 0 ? 0 : d / max, max];
}

/** Convert one sRGB pixel into the named working space. */
export function toSpace(space: ColourSpace, r: number, g: number, b: number): [number, number, number] {
  switch (space) {
    case "srgb":
      return [r, g, b];
    case "linear-rgb":
      return [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)];
    case "lab":
      return srgbToLab(r, g, b);
    case "ycbcr":
      return srgbToYcbcr(r, g, b);
  }
}

/** Convert one working-space pixel back to (unclamped) sRGB. */
export function fromSpace(space: ColourSpace, c0: number, c1: number, c2: number): [number, number, number] {
  switch (space) {
    case "srgb":
      return [c0, c1, c2];
    case "linear-rgb":
      return [linearToSrgb(c0), linearToSrgb(c1), linearToSrgb(c2)];
    case "lab":
      return labToSrgb(c0, c1, c2);
    case "ycbcr":
      return ycbcrToSrgb(c0, c1, c2);
  }
}
