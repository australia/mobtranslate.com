export type ModelArtifact = {
  label: string;
  kind: string;
  format: string;
  url: string | null;
  available: boolean;
  note?: string;
  localPath?: string;
  sizeBytes?: number;
  sha256?: string;
};

export type ModelMetrics = Record<string, number | string | null>;

export type ModelTrainingSummary = {
  trainRows?: number;
  validationRows?: number;
  testRows?: number;
  epochs?: number;
  batchSize?: number;
  gradientAccumulationSteps?: number;
  trainRuntimeSeconds?: number;
  trainSamplesPerSecond?: number;
};

export type ModelResourceSummary = {
  gpu?: string;
  costPerHourUsd?: number;
  estimatedCostUsd?: number;
  sampleIntervalSeconds?: number;
  samples?: number;
  avgGpuUtilPct?: number;
  maxGpuUtilPct?: number;
  meanVramMiB?: number;
  maxVramMiB?: number;
  meanPowerW?: number;
  maxPowerW?: number;
  powerLimitW?: number;
};

export type ModelReleaseScorecard = {
  bibleDirectChrf?: number;
  bibleRefChrf?: number;
  usageChrf?: number;
  communitySentenceChrf?: number;
  communitySentenceExact?: string;
  heldoutAllChrf?: number;
  exactKnownResources?: string;
};

export type ModelRelease = {
  version: string;
  status: string;
  date: string;
  baseModel: string;
  dataset: string;
  directions: string[];
  serving?: {
    sourceLang?: string;
    targetLang?: string;
  };
  rights: string;
  role?: string;
  verdict?: string;
  runId?: string;
  scorecard?: ModelReleaseScorecard;
  metrics: null | ModelMetrics;
  notes: string[];
  artifacts: ModelArtifact[];
  training?: ModelTrainingSummary;
  resources?: ModelResourceSummary;
};

export type ModelEntry = {
  id: string;
  name: string;
  family: string;
  task: string;
  labUrl?: string;
  language: {
    name: string;
    appCode: string;
    iso6393: string;
    region: string;
  };
  summary: string;
  releases: ModelRelease[];
};

export type ModelRegistry = {
  schemaVersion: number;
  updatedAt: string;
  models: ModelEntry[];
};

export type ModelPredictionSample = {
  id: string;
  canonicalRef?: string;
  direction?: string;
  tier?: string;
  sourceFamily?: string;
  artifactLabel?: string;
  input: string;
  prediction: string;
  reference: string;
};

export type ModelReleaseResults = {
  artifactPath?: string;
  artifactPaths?: string[];
  metrics?: {
    bleu?: number;
    chrf?: number;
    rows?: number;
  };
  sourceLabels?: string[];
  samples: ModelPredictionSample[];
};

export type ModelResultMap = Record<string, ModelReleaseResults>;

export type TranslateV2Request = {
  modelId: string;
  version: string;
  direction: string;
  text: string;
  maxNewTokens?: number;
  numBeams?: number;
  noRepeatNgramSize?: number;
  repetitionPenalty?: number;
  lengthPenalty?: number;
};

export type TranslateV2Response = {
  success: boolean;
  status: 'ok' | 'not_configured' | 'model_not_found' | 'endpoint_error' | 'invalid_request';
  translation?: string;
  gloss?: string;
  error?: string;
  latencyMs?: number;
  model?: {
    id: string;
    name: string;
    version: string;
    status: string;
    direction: string;
    baseModel: string;
    dataset: string;
  };
  endpoint?: {
    configured: boolean;
    url?: string;
  };
  setup?: {
    envVar: string;
    expectedRequest: string[];
    runCommand: string;
  };
};
