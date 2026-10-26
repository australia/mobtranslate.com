/**
 * Reproducibility recipes (PRD §4.2, §13.2).
 * A recipe records everything needed to regenerate a derivative exactly:
 * source identity (SHA-256), algorithm id + version, parameters, the actual
 * computed transform (so replay never depends on re-estimating statistics),
 * statistics region, and engine version.
 */

import type { DStretchParams, DStretchStats, StatsRegion } from "./dstretch";

export const ENGINE_NAME = "rockpaintings-engine";
export const ENGINE_VERSION = "0.1.0";

export interface DStretchRecipe {
  schema: "rockpaintings/recipe/1.0";
  name: string;
  createdAt: string;
  source: {
    filename: string;
    sha256: string | null;
    width: number;
    height: number;
  };
  operation: {
    type: "decorrelation.global";
    version: "1.0.0";
    parameters: DStretchParams;
    statisticsRegion: StatsRegion | null;
    /** The realised transform — replayable without recomputing statistics. */
    computed: {
      mean: number[];
      transform: number[];
      eigenvalues: number[];
      sampleCount: number;
    };
  };
  engine: { name: string; version: string };
}

export function buildRecipe(
  name: string,
  filename: string,
  sha256: string | null,
  width: number,
  height: number,
  params: DStretchParams,
  region: StatsRegion | null,
  stats: DStretchStats,
  now: Date = new Date(),
): DStretchRecipe {
  return {
    schema: "rockpaintings/recipe/1.0",
    name,
    createdAt: now.toISOString(),
    source: { filename, sha256, width, height },
    operation: {
      type: "decorrelation.global",
      version: "1.0.0",
      parameters: { ...params },
      statisticsRegion: region ? { ...region } : null,
      computed: {
        mean: stats.mean.slice(),
        transform: stats.transform.slice(),
        eigenvalues: stats.eigenvalues.slice(),
        sampleCount: stats.sampleCount,
      },
    },
    engine: { name: ENGINE_NAME, version: ENGINE_VERSION },
  };
}

/** SHA-256 of a file's bytes via WebCrypto (browser only). */
export async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
