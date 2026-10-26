export type AtlasBounds = Readonly<{
  west: number;
  south: number;
  east: number;
  north: number;
}>;

export type AtlasMapLayerView = Readonly<{
  layerId:
    | "public_heritage_acquisition_frame"
    | "qld_elevation_project_coverage"
    | "qld_elevation_tile_coverage";
  title: string;
  role: "acquisition_frame" | "data_coverage";
  featureCount: number;
  paths: readonly string[];
  artifactPath: string;
  artifactSha256: string;
  disclosure: string;
}>;

export type SourceRecord = Readonly<{
  source_id: string;
  title: string;
  publisher: string;
  landing_page: string;
  licence: string;
  coverage_summary: string;
  acquisition_status: "acquired" | "catalogued" | "negative_test_preserved";
  provenance_record_id: string;
  reference_count: number;
  referenced_by: readonly string[];
  bibliography?: BibliographyAnnotation;
}>;

export type BibliographyAnnotation = Readonly<{
  priority_rank: number;
  canonical_id: string;
  title: string;
  publication_years: readonly number[];
  authors: readonly string[];
  source_names: readonly string[];
  rrf_score: number;
  query_breadth: number;
  provider_breadth: number;
  evidence_edge_count: number;
  best_provider_rank: number;
  review_state: "priority_ranked_not_semantically_or_culturally_reviewed";
  access_state: "direct_pdf_2xx_head_only" | "head_checked_no_direct_pdf_2xx" | "not_probed";
  metadata_availability?: BibliographyMetadataAvailability;
}>;

export type BibliographyMetadataAvailability = Readonly<{
  abstract_available: boolean;
  abstract_text_emitted: false;
  openalex_cited_by_count: number | null;
  openalex_is_oa: boolean | null;
  provider_fulltext_signal: boolean;
  oa_candidate_url_count: number;
  explicit_license_metadata: boolean;
  license_labels: readonly string[];
  rights_determined: false;
  primary_provider_topic: string | null;
  provider_labels_semantically_reviewed: false;
  metadata_review_lane:
    | "abstract_and_explicit_license_metadata"
    | "abstract_and_oa_signal_no_explicit_license"
    | "abstract_available_rights_unresolved"
    | "access_metadata_no_abstract"
    | "metadata_only";
}>;

export type EnvironmentalLayer = Readonly<{
  layer_id: string;
  title: string;
  source_id: string;
  data_kind: "raster" | "vector" | "catalogue";
  role: "display_only" | "model_covariate" | "confounder" | "acquisition_gap";
  coverage_summary: string;
  resolution_summary: string;
  public_endpoint: string | null;
  artifact_path: string;
  bytes: number;
  sha256: string;
}>;

export type ExperimentRecord = Readonly<{
  experiment_id: string;
  source_experiment_id: string;
  title: string;
  status: "proposed" | "ready_for_review" | "tested" | "rejected";
  data_need: string;
  falsification_test: string;
  disclosure_class: "non_spatial_method";
  target: string;
  signal: string;
  representation: string;
  scale_metres: number;
  evaluation: string;
  hypothesis: string;
  method: string;
  test: string;
  confounder: string;
  scale_caveat: string;
  disclosure: string;
}>;

export type ModelSummaryView = Readonly<{
  modelId: string;
  evidenceStage: string;
  methodSummary: string;
  cellCount: number;
  featureCount: number;
  validationStatus: string;
  targetAuc: number;
  placeboAucMaximum: number;
  targetMinusPlaceboMedianAuc: number;
  warnings: readonly string[];
}>;

export type ProjectView = Readonly<{
  title: string;
  purpose: string;
  limitations: readonly string[];
  governanceStatus: string;
  evidenceStage: string;
  dataCurrentThrough: string;
  inventoryGeneratedAt: string;
}>;

export type AtlasOverview = Readonly<{
  releaseId: string;
  approvedAtUtc: string;
  authorityRecordId: string;
  manifestShaHint: string;
  project: ProjectView;
  map: Readonly<{
    bounds: AtlasBounds;
    layers: readonly AtlasMapLayerView[];
    limitations: readonly string[];
  }>;
  model: ModelSummaryView;
  counts: Readonly<{sources: number; bibliography: number; layers: number; experiments: number; mapFeatures: number}>;
  initialSources: readonly SourceRecord[];
  initialBibliography: readonly SourceRecord[];
  initialLayers: readonly EnvironmentalLayer[];
  initialExperiments: readonly ExperimentRecord[];
}>;

export type PagedResult<T> = Readonly<{
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
  items: readonly T[];
}>;
