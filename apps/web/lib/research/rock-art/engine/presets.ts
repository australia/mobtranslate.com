/**
 * Transparent enhancement presets (FR-ENH-006).
 * A preset is nothing but a named parameter set — selecting one loads its
 * values into the visible controls, so every preset resolves to inspectable
 * parameters (PRD §4.5). There are no hidden operations.
 */

import type { DStretchParams } from "./dstretch";

export interface StretchPreset {
  id: string;
  label: string;
  hint: string;
  params: DStretchParams;
}

export const STRETCH_PRESETS: StretchPreset[] = [
  {
    id: "general-lab",
    label: "General (Lab)",
    hint: "The PRD default: balanced stretch in CIELAB",
    params: {
      colourSpace: "lab",
      matrixMode: "covariance",
      strength: 0.75,
      maxGain: 8,
      clipPercent: 0.25,
      saturation: 0.85,
    },
  },
  {
    id: "faded-red",
    label: "Faded red paint",
    hint: "Strong Lab stretch biased for weak red pigment",
    params: {
      colourSpace: "lab",
      matrixMode: "covariance",
      strength: 0.9,
      maxGain: 12,
      clipPercent: 0.5,
      saturation: 1,
    },
  },
  {
    id: "red-sandstone",
    label: "Red on yellow sandstone",
    hint: "YCbCr separates red pigment from warm substrate",
    params: {
      colourSpace: "ycbcr",
      matrixMode: "covariance",
      strength: 0.85,
      maxGain: 10,
      clipPercent: 0.5,
      saturation: 1,
    },
  },
  {
    id: "dark-on-dark",
    label: "Dark red on dark stone",
    hint: "Correlation matrix equalises channels before stretching",
    params: {
      colourSpace: "lab",
      matrixMode: "correlation",
      strength: 0.9,
      maxGain: 14,
      clipPercent: 1,
      saturation: 1,
    },
  },
  {
    id: "gentle-srgb",
    label: "Gentle (sRGB)",
    hint: "Mild stretch in native sRGB, closest to the photograph",
    params: {
      colourSpace: "srgb",
      matrixMode: "covariance",
      strength: 0.6,
      maxGain: 6,
      clipPercent: 0.25,
      saturation: 0.9,
    },
  },
];
