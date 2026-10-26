import type {Basemap, Bounds} from "./workspace-types";
import type {ReleaseApprovalSummary} from "./workspace-release";

export type ReportMapAlgorithm = Readonly<{modelId: string; title: string}>;

export type ReportMapCave = Readonly<{
  id: string;
  workingName: string;
  longitude: number;
  latitude: number;
  attestation: string;
}>;

export type ReportMapObservation = Readonly<{
  id: string;
  workingName: string;
  role: "camp" | "training";
  longitude: number;
  latitude: number;
}>;

// Frozen band row: [longitude, latitude, rank(algorithm 0), rank(algorithm 1), ...]
export type ReportMapBandRow = readonly number[];

export type ReportMapPayload = Readonly<{
  batchId: string;
  baselineReleaseId: string;
  baselineWorkspaceSha256: string;
  currentReleaseId: string;
  caveCountMatchesReport: boolean;
  bounds: Bounds;
  imageCorners: readonly [
    readonly [number, number],
    readonly [number, number],
    readonly [number, number],
    readonly [number, number],
  ];
  basemaps: readonly Basemap[];
  hillshadeAsset: Readonly<{url: string; attributionSourceId: string}> | null;
  regional: Readonly<{
    title: string;
    resolutionMetres: number;
    evaluatedCells: number;
    publishedMarkers: number;
    minimumPublishedPercentile: number;
    warning: string;
    algorithms: readonly ReportMapAlgorithm[];
  }>;
  frozenBand: readonly ReportMapBandRow[];
  caves: readonly ReportMapCave[];
  frozenObservations: readonly ReportMapObservation[];
  approvals: Readonly<{baseline: ReleaseApprovalSummary; current: ReleaseApprovalSummary}>;
  warning: string;
}>;
