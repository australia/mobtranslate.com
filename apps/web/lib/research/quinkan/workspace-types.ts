export type Bounds = Readonly<{
  west: number;
  south: number;
  east: number;
  north: number;
}>;

export type Basemap = Readonly<{
  id: string;
  title: string;
  styleUrl: string;
  attribution: string;
}>;

export type KnownLocation = Readonly<{
  id: string;
  title: string;
  longitude: number;
  latitude: number;
  classification: string;
  locationPrecision: string;
  sourceKind: string;
  sourceRecordId: string;
  sourceUrl: string;
  note: string;
  uncertaintyMetres: number | null;
  precisionClass: string;
  supportingRecordCount: number;
  identityGroup: string;
}>;

export type FieldObservation = Readonly<{
  id: string;
  recordId: string;
  workingName: string;
  role: string;
  trainingRole: string;
  longitude: number;
  latitude: number;
  coordinateAsSupplied: string;
  attestation: string;
  nearestCovariateCellId: string;
  nearestCovariateCellDistanceMetres: number;
  covariates: readonly FieldCovariate[];
}>;

export type FieldCovariate = Readonly<{
  column: string;
  sourcePath: string;
  value: number;
  targetValue: number;
  modelWeight: number;
}>;

export type HoldoutThresholdHits = Readonly<{
  topFraction: number;
  minimumRankPercentile: number;
  heldOutHits: number;
  heldOutHitRate: number;
}>;

export type HoldoutRankSummary = Readonly<{
  heldOutRecordCount: number;
  uniqueHeldOutCellCount: number;
  minimumRankPercentile: number;
  medianRankPercentile: number;
  meanRankPercentile: number;
  maximumRankPercentile: number;
  thresholdHits: readonly HoldoutThresholdHits[];
}>;

export type HeldOutResult = Readonly<{
  pointId: string;
  title: string;
  sourceKind: string;
  sourceRecordId: string;
  nearestCellId: string;
  priorityScore: number;
  rankPercentile: number;
  nearestTrainingPointDistanceMetres: number;
}>;

export type FieldHoldoutFold = Readonly<{
  groupId: string;
  trainingPointIds: readonly string[];
  heldOutPointIds: readonly string[];
  trainingUniqueCellCount: number;
  heldOutUniqueCellCount: number;
  minimumHeldOutToTrainingDistanceMetres: number;
  foldTargetSha256: string;
  heldOut: readonly HeldOutResult[];
  summary: HoldoutRankSummary;
}>;

export type FieldHoldoutDesign = Readonly<{
  designId: string;
  groupingMethod: string;
  groupCount: number;
  folds: readonly FieldHoldoutFold[];
  aggregate: HoldoutRankSummary;
}>;

export type FieldModelValidation = Readonly<{
  positiveRecordCount: number;
  uniquePositiveCellCount: number;
  evaluatedRegionalCellCount: number;
  covariateCount: number;
  spatialClusterThresholdMetres: number;
  targetAggregation: string;
  designs: readonly FieldHoldoutDesign[];
  interpretation: string;
  limitations: readonly string[];
}>;

export type AlgorithmScore = Readonly<{
  modelId: string;
  title: string;
  score: number;
  rankPercentile: number;
  uncertainty: number;
}>;

export type ProposalMarker = Readonly<{
  id: string;
  collectionId: "regional" | "high-resolution";
  longitude: number;
  latitude: number;
  confidencePercentile: number;
  priorityScore: number;
  uncertainty: number;
  algorithmScores: readonly AlgorithmScore[];
}>;

export type ProposalCollection = Readonly<{
  id: "regional" | "high-resolution";
  title: string;
  modelIds: readonly string[];
  resolutionMetres: number;
  evaluatedCells: number;
  publishedMarkers: number;
  minimumPublishedPercentile: number;
  validationStatus: string;
  warning: string;
}>;

export type RasterOverlay = Readonly<{
  id: string;
  title: string;
  group: string;
  assetUrl: string;
  bytes: number;
  sha256: string;
  sourceArtifactSha256: string;
  opacity: number;
  defaultVisible: boolean;
  legend: string;
  interpretation: string;
  sourceUrl?: string;
}>;

export type SourceRecord = Readonly<{
  id: string;
  title: string;
  url: string;
  licence: string;
  note: string;
}>;

export type OperationalWorkspace = Readonly<{
  schemaVersion: 1;
  releaseId: string;
  generatedAtUtc: string;
  bounds: Bounds;
  imageCorners: readonly [
    readonly [number, number],
    readonly [number, number],
    readonly [number, number],
    readonly [number, number],
  ];
  basemaps: readonly Basemap[];
  knownLocations: readonly KnownLocation[];
  fieldObservations: readonly FieldObservation[];
  fieldModelValidation: FieldModelValidation | null;
  proposalCollections: readonly ProposalCollection[];
  proposals: readonly ProposalMarker[];
  overlays: readonly RasterOverlay[];
  sources: readonly SourceRecord[];
  warning: string;
  limitations: readonly string[];
}>;

export type ContextLayer = Readonly<{
  layer_id: string;
  title: string;
  role: string;
  source_id: string;
  feature_count: number;
  feature_collection: GeoJsonFeatureCollection;
  disclosure: string;
}>;

export type ContextAtlas = Readonly<{
  schema_version: 1;
  crs: "CRS84";
  bounds: Bounds;
  layers: readonly ContextLayer[];
  limitations: readonly string[];
}>;

export type GeoJsonFeatureCollection = Readonly<{
  type: "FeatureCollection";
  features: readonly Record<string, unknown>[];
}>;

export type WorkspaceResponse = Readonly<{
  workspace: OperationalWorkspace;
  contextAtlas: ContextAtlas;
}>;

export type FeatureContribution = Readonly<{
  column: string;
  label: string;
  rationale: string;
  unit: string;
  rawValue: number;
  targetValue: number | null;
  direction: string;
  transform: string;
  empiricalPercentile: number;
  modelContribution: number;
  weight: number;
}>;

export type AlgorithmResult = AlgorithmScore &
  Readonly<{contributors: readonly FeatureContribution[]}>;

export type ObservationComponentScore = Readonly<{
  componentId: string;
  title: string;
  score: number;
  combineWeight: number;
  includedInPrimaryIndex: boolean;
  interpretation: string;
}>;

export type ObservationProcessDetail = Readonly<{
  indexId: string;
  title: string;
  observationAvailabilityScore: number;
  observationAvailabilityRankPercentile: number;
  underObservedRankPercentile: number;
  occurrenceRankPercentile: number;
  occurrenceMinusObservationRank: number;
  components: readonly ObservationComponentScore[];
  interpretation: string;
  residualDefinition: string;
  warning: string;
}>;

export type ProposalDetail = Readonly<{
  id: string;
  collectionId: "regional" | "high-resolution";
  longitude: number;
  latitude: number;
  sourceCellId: string;
  blockId: string;
  algorithmResults: readonly AlgorithmResult[];
  observationProcess?: ObservationProcessDetail;
  interpretation: string;
  warnings: readonly string[];
}>;
