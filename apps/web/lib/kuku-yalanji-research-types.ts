export type ResearchResource = 'overview' | 'dictionary' | 'sentences' | 'lexemes' | 'dataset' | 'model';

export interface CountOption {
  value: string;
  label: string;
  count: number;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface DictionaryExample {
  kukuYalanji: string;
  english: string;
}

export interface DictionaryEntry {
  id: string;
  word: string;
  type: string | null;
  phonemic: string | null;
  gloss: string | null;
  definitions: string[];
  translations: string[];
  semanticDomain: string | null;
  source: string;
  needsReview: string | null;
  examples: DictionaryExample[];
  commentary: string[];
  verbClass: string | null;
}

export interface DictionaryData {
  entries: DictionaryEntry[];
  pagination: Pagination;
  filters: {
    types: CountOption[];
    sources: CountOption[];
    domains: CountOption[];
    needsReview: number;
  };
}

export interface SentenceRow {
  id: number;
  batch: string;
  sequence: number;
  english: string;
  kuku: string;
  analysis: string;
  frame: string;
  tier: number | null;
  wordsUsed: string[];
  loansUsed: string[];
  evidence: string | null;
  status: string;
  confidence: string | null;
  rightsStatus: string;
  createdAt: string;
  updatedAt: string | null;
}

export interface SentenceData {
  rows: SentenceRow[];
  pagination: Pagination;
  filters: {
    statuses: CountOption[];
    tiers: CountOption[];
    frames: CountOption[];
  };
}

export interface LexemeRow {
  id: number;
  headword: string;
  phonemic: string | null;
  pos: string;
  gloss: string;
  status: string;
  corpusFrequency: number;
  senses: Array<Record<string, unknown>>;
  attestation: Array<Record<string, unknown>>;
  allomorphy: string | null;
  morphology: string | null;
  collocations: string | null;
  usageNotes: string | null;
  contrasts: string | null;
  verifiedAt: string | null;
  notes: string | null;
}

export interface LexemeData {
  rows: LexemeRow[];
  pagination: Pagination;
  filters: {
    statuses: CountOption[];
    partsOfSpeech: CountOption[];
  };
}

export interface DistributionRow {
  label: string;
  count: number;
}

export interface CompletionCheck {
  label: string;
  status: 'pass' | 'qualified';
  detail: string;
}

export interface OverviewData {
  language: {
    name: string;
    code: string;
    region: string;
  };
  counts: {
    sentences: number;
    accepted: number;
    revised: number;
    open: number;
    kukuWords: number;
    batches: number;
    reviews: number;
    revisions: number;
    lessons: number;
    lexemes: number;
    processEvents: number;
    dictionaryEntries: number;
    uniqueHeadwords: number;
    dictionaryExamples: number;
  };
  rightsStatus: string;
  generatedAt: string;
  latestSentenceAt: string | null;
  distributions: {
    sentenceStatus: DistributionRow[];
    tiers: DistributionRow[];
    frames: DistributionRow[];
    lexemeStatus: DistributionRow[];
    partsOfSpeech: DistributionRow[];
  };
  checks: CompletionCheck[];
}

export interface ModelEvaluation {
  id: string;
  label: string;
  category: 'synthetic' | 'external';
  rows: number;
  bleu: number;
  chrf: number;
  exact: number;
  empty: number;
  meanLengthRatio: number | null;
}

export interface ModelCurvePoint {
  step: number;
  epoch: number;
  loss: number;
  bleu: number;
  chrf: number;
}

export interface ModelData {
  productLabel: string;
  experimentId: string;
  status: 'research-only';
  promotionEligible: false;
  verdict: string;
  rightsStatus: string;
  treatment: {
    train: number;
    validation: number;
    test: number;
    quarantine: number;
    epochs: number;
    learningRate: number;
    effectiveBatch: number;
    sourceTokenCap: number;
    targetTokenCap: number;
    seed: number;
    baseModel: string;
  };
  gates: Array<{
    id: string;
    label: string;
    status: 'pass' | 'fail';
    epochs: number;
    exact: number;
    rows: number;
    chrf: number;
    empty: number;
  }>;
  curve: ModelCurvePoint[];
  evaluations: ModelEvaluation[];
  resources: {
    gpu: string;
    runtimeSeconds: number;
    maxGpuUtilization: number;
    maxGpuMemoryMiB: number;
    maxPythonRssMiB: number;
    grossAccountDeltaUsd: number;
  };
  archive: {
    status: string;
    files: number;
    bytes: number;
    mergedModelSha256: string;
    adapterSha256: string;
    localRemoteSmokeEquivalent: boolean;
    activePodsAfterDelete: number;
  };
  nextExperiment: {
    id: string;
    owner: string;
    purpose: string;
  };
  links: Array<{ label: string; href: string }>;
}

export interface DatasetDownload {
  id: string;
  label: string;
  format: string;
  href: string;
  bytes: number;
  sha256: string;
  recommended?: boolean;
  relative?: string;
}

export interface DatasetData {
  dataset_id: string;
  title: string;
  version: string;
  released_at: string;
  status: string;
  language: {
    name: string;
    iso_639_3: string;
    bcp_47: string;
  };
  counts: {
    sentences: number;
    dictionary_entries: number;
    lexemes: number;
    reviews: number;
    revisions: number;
    lessons: number;
    process_events: number;
  };
  archives: DatasetDownload[];
  direct_files: DatasetDownload[];
  manifest_href: string;
  checksums_href: string;
  readme_href: string;
  data_use_href: string;
}

export interface ResearchEnvelope<T> {
  success: true;
  resource: ResearchResource;
  generatedAt: string;
  data: T;
}

export type ResearchData = OverviewData | DictionaryData | SentenceData | LexemeData | DatasetData | ModelData;
