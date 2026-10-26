import "server-only";

import {createHash} from "node:crypto";
import {z} from "zod";
import {loadConfiguredPublicRelease} from "./public-release";
import type {
  AtlasBounds,
  AtlasOverview,
  EnvironmentalLayer,
  ExperimentRecord,
  PagedResult,
  SourceRecord,
} from "./atlas-types";

const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const publicUrlSchema = z.string().url().startsWith("https://");
const quantilesSchema = z
  .object({p01: z.number(), p10: z.number(), p25: z.number(), p50: z.number(), p75: z.number(), p90: z.number(), p99: z.number()})
  .strict();

const projectSchema = z
  .object({
    schema_version: z.literal(1),
    project_id: z.string(),
    title: z.string(),
    purpose: z.string(),
    limitations: z.array(z.string()).min(1),
    governance_status: z.enum(["awaiting_disclosure_review", "disclosure_reviewed_for_publication"]),
    evidence_stage: z.enum(["dataset_catalogue", "untested_morphology_baseline", "governed_observed_validation"]),
    research_started_on: z.string(),
    data_current_through: z.string(),
    inventory_generated_at: z.string(),
    inventory_file_count: z.number().int().positive(),
    inventory_total_bytes: z.number().int().positive(),
  })
  .strict();

const bibliographyAnnotationSchema = z
  .object({
    priority_rank: z.number().int().positive(),
    canonical_id: z.string().min(1),
    title: z.string().min(1),
    publication_years: z.array(z.number().int().min(1500).max(2100)),
    authors: z.array(z.string().min(1)),
    source_names: z.array(z.string().min(1)),
    rrf_score: z.number().positive().finite(),
    query_breadth: z.number().int().positive(),
    provider_breadth: z.number().int().positive(),
    evidence_edge_count: z.number().int().positive(),
    best_provider_rank: z.number().int().positive(),
    review_state: z.literal("priority_ranked_not_semantically_or_culturally_reviewed"),
    access_state: z.enum(["direct_pdf_2xx_head_only", "head_checked_no_direct_pdf_2xx", "not_probed"]),
    metadata_availability: z
      .object({
        abstract_available: z.boolean(),
        abstract_text_emitted: z.literal(false),
        openalex_cited_by_count: z.number().int().nonnegative().nullable(),
        openalex_is_oa: z.boolean().nullable(),
        provider_fulltext_signal: z.boolean(),
        oa_candidate_url_count: z.number().int().nonnegative(),
        explicit_license_metadata: z.boolean(),
        license_labels: z.array(z.string().min(1)),
        rights_determined: z.literal(false),
        primary_provider_topic: z.string().min(1).nullable(),
        provider_labels_semantically_reviewed: z.literal(false),
        metadata_review_lane: z.enum([
          "abstract_and_explicit_license_metadata",
          "abstract_and_oa_signal_no_explicit_license",
          "abstract_available_rights_unresolved",
          "access_metadata_no_abstract",
          "metadata_only",
        ]),
      })
      .strict()
      .optional(),
  })
  .strict();

const sourceRecordSchema = z
  .object({
    source_id: z.string(),
    title: z.string(),
    publisher: z.string(),
    landing_page: publicUrlSchema,
    licence: z.string(),
    coverage_summary: z.string(),
    acquisition_status: z.enum(["acquired", "catalogued", "negative_test_preserved"]),
    provenance_record_id: z.string(),
    reference_count: z.number().int().positive(),
    referenced_by: z.array(z.string()).min(1),
    bibliography: bibliographyAnnotationSchema.optional(),
  })
  .strict();
const sourcesSchema = z.object({schema_version: z.literal(1), sources: z.array(sourceRecordSchema).min(1)}).strict();

const environmentalLayerSchema = z
  .object({
    layer_id: z.string(),
    title: z.string(),
    source_id: z.string(),
    data_kind: z.enum(["raster", "vector", "catalogue"]),
    role: z.enum(["display_only", "model_covariate", "confounder", "acquisition_gap"]),
    coverage_summary: z.string(),
    resolution_summary: z.string(),
    public_endpoint: publicUrlSchema.nullable(),
    artifact_path: z.string(),
    bytes: z.number().int().positive(),
    sha256: sha256Schema,
  })
  .strict();
const layersSchema = z.object({schema_version: z.literal(1), layers: z.array(environmentalLayerSchema)}).strict();

const experimentRecordSchema = z
  .object({
    experiment_id: z.string(),
    source_experiment_id: z.string(),
    title: z.string(),
    status: z.enum(["proposed", "ready_for_review", "tested", "rejected"]),
    data_need: z.string(),
    falsification_test: z.string(),
    disclosure_class: z.literal("non_spatial_method"),
    target: z.string(),
    signal: z.string(),
    representation: z.string(),
    scale_metres: z.number().int().positive(),
    evaluation: z.string(),
    hypothesis: z.string(),
    method: z.string(),
    test: z.string(),
    confounder: z.string(),
    scale_caveat: z.string(),
    disclosure: z.string(),
  })
  .strict();
const experimentsSchema = z
  .object({schema_version: z.literal(1), library_id: z.string(), total_experiments: z.number().int(), items: z.array(experimentRecordSchema)})
  .strict();

const modelSchema = z
  .object({
    schema_version: z.literal(1),
    model_id: z.string(),
    target: z.literal("geomorphic_survey_priority"),
    evidence_stage: z.enum(["dataset_catalogue", "untested_morphology_baseline", "governed_observed_validation"]),
    method_summary: z.string(),
    cell_count: z.number().int().positive(),
    feature_count: z.number().int().positive(),
    score_distribution: quantilesSchema,
    uncertainty_distribution: quantilesSchema,
    validation_status: z.enum(["no_governed_labels", "spatial_validation_pending", "spatially_validated_aggregate_only"]),
    governance_state: z.literal("quarantined_as_proposal_evidence"),
    boundary_negative_control: z
      .object({
        scored_fold_count: z.number().int().positive(),
        skipped_fold_count: z.number().int().nonnegative(),
        target_macro_roc_auc: z.number(),
        placebo_macro_roc_auc_median: z.number(),
        placebo_macro_roc_auc_maximum: z.number(),
        target_minus_placebo_median_roc_auc: z.number(),
        interpretation: z.string(),
        provenance_sha256: sha256Schema,
      })
      .strict(),
    warnings: z.array(z.string()).min(1),
  })
  .strict();

const positionSchema = z.tuple([z.number(), z.number()]);
const ringSchema = z.array(positionSchema).min(4);
const polygonSchema = z.array(ringSchema).min(1);
const geometrySchema = z.discriminatedUnion("type", [
  z.object({type: z.literal("Polygon"), coordinates: polygonSchema}).strict(),
  z.object({type: z.literal("MultiPolygon"), coordinates: z.array(polygonSchema).min(1)}).strict(),
]);
const layerIdSchema = z.enum([
  "public_heritage_acquisition_frame",
  "qld_elevation_project_coverage",
  "qld_elevation_tile_coverage",
]);
const mapFeatureSchema = z
  .object({
    type: z.literal("Feature"),
    id: z.string(),
    properties: z.object({layer_id: layerIdSchema}).strict(),
    geometry: geometrySchema,
  })
  .strict();
const mapLayerSchema = z
  .object({
    layer_id: layerIdSchema,
    title: z.string(),
    role: z.enum(["acquisition_frame", "data_coverage"]),
    source_id: z.string(),
    source_artifact: z.object({path: z.string(), bytes: z.number().int().positive(), sha256: sha256Schema}).strict(),
    feature_count: z.number().int().positive(),
    feature_collection: z.object({type: z.literal("FeatureCollection"), features: z.array(mapFeatureSchema).min(1)}).strict(),
    disclosure: z.string(),
  })
  .strict();
const atlasMapSchema = z
  .object({
    schema_version: z.literal(1),
    crs: z.literal("OGC:CRS84"),
    bounds: z.object({west: z.number(), south: z.number(), east: z.number(), north: z.number()}).strict(),
    layers: z.array(mapLayerSchema).length(3),
    limitations: z.array(z.string()).min(1),
  })
  .strict();

type AtlasData = Readonly<{
  overview: AtlasOverview;
  sources: readonly SourceRecord[];
  bibliography: readonly SourceRecord[];
  layers: readonly EnvironmentalLayer[];
  experiments: readonly ExperimentRecord[];
}>;

let configuredAtlas: Promise<AtlasData> | undefined;

export function loadAtlasData(): Promise<AtlasData> {
  configuredAtlas ??= buildAtlasData();
  return configuredAtlas;
}

async function buildAtlasData(): Promise<AtlasData> {
  const release = await loadConfiguredPublicRelease();
  const project = projectSchema.parse(release.payloads["project.json"]);
  const sources = sourcesSchema.parse(release.payloads["sources.json"]).sources;
  const bibliography = sources
    .filter((source) => source.bibliography !== undefined)
    .sort((left, right) => left.bibliography!.priority_rank - right.bibliography!.priority_rank);
  const layers = layersSchema.parse(release.payloads["environmental-layers.json"]).layers;
  const experimentsPayload = experimentsSchema.parse(release.payloads["experiments.json"]);
  const model = modelSchema.parse(release.payloads["model-summary.json"]);
  const atlasMap = atlasMapSchema.parse(release.payloads["atlas-map.json"]);
  const mapLayers = atlasMap.layers.map((layer) => ({
    layerId: layer.layer_id,
    title: layer.title,
    role: layer.role,
    featureCount: layer.feature_count,
    paths: layer.feature_collection.features.map((feature) => geometryPath(feature.geometry, atlasMap.bounds)),
    artifactPath: layer.source_artifact.path,
    artifactSha256: layer.source_artifact.sha256,
    disclosure: layer.disclosure,
  }));
  const manifestDigest = createHash("sha256").update(JSON.stringify(release.manifest)).digest("hex");
  const overview: AtlasOverview = {
    releaseId: release.manifest.release_id,
    approvedAtUtc: release.manifest.approved_at_utc,
    authorityRecordId: release.manifest.authority_record_id,
    manifestShaHint: manifestDigest,
    project: {
      title: project.title,
      purpose: project.purpose,
      limitations: project.limitations,
      governanceStatus: project.governance_status,
      evidenceStage: project.evidence_stage,
      dataCurrentThrough: project.data_current_through,
      inventoryGeneratedAt: project.inventory_generated_at,
    },
    map: {bounds: atlasMap.bounds, layers: mapLayers, limitations: atlasMap.limitations},
    model: {
      modelId: model.model_id,
      evidenceStage: model.evidence_stage,
      methodSummary: model.method_summary,
      cellCount: model.cell_count,
      featureCount: model.feature_count,
      validationStatus: model.validation_status,
      targetAuc: model.boundary_negative_control.target_macro_roc_auc,
      placeboAucMaximum: model.boundary_negative_control.placebo_macro_roc_auc_maximum,
      targetMinusPlaceboMedianAuc: model.boundary_negative_control.target_minus_placebo_median_roc_auc,
      warnings: model.warnings,
    },
    counts: {
      sources: sources.length,
      bibliography: bibliography.length,
      layers: layers.length,
      experiments: experimentsPayload.total_experiments,
      mapFeatures: mapLayers.reduce((total, layer) => total + layer.featureCount, 0),
    },
    initialSources: sources.slice(0, 8),
    initialBibliography: bibliography.slice(0, 8),
    initialLayers: layers.slice(0, 8),
    initialExperiments: experimentsPayload.items.slice(0, 6),
  };
  return Object.freeze({overview, sources, bibliography, layers, experiments: experimentsPayload.items});
}

type Geometry = z.infer<typeof geometrySchema>;

function geometryPath(geometry: Geometry, bounds: AtlasBounds): string {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return polygons
    .flatMap((polygon) => polygon.map((ring) => ring.map((position, index) => `${index === 0 ? "M" : "L"}${project(position, bounds)}`).join(" ") + " Z"))
    .join(" ");
}

function project(position: readonly [number, number], bounds: AtlasBounds): string {
  const x = ((position[0] - bounds.west) / (bounds.east - bounds.west)) * 1000;
  const y = ((bounds.north - position[1]) / (bounds.north - bounds.south)) * 760;
  return `${x.toFixed(2)},${y.toFixed(2)}`;
}

export async function querySources(query: string, page: number, pageSize: number): Promise<PagedResult<SourceRecord>> {
  const {sources} = await loadAtlasData();
  return paginate(filterRecords(sources, query, (item) => [item.title, item.publisher, item.coverage_summary, item.landing_page]), page, pageSize);
}

export async function queryBibliography(query: string, page: number, pageSize: number): Promise<PagedResult<SourceRecord>> {
  const {bibliography} = await loadAtlasData();
  return paginate(
    filterRecords(bibliography, query, (item) => [
      item.title,
      item.publisher,
      item.landing_page,
      item.bibliography?.canonical_id ?? "",
      item.bibliography?.authors.join(" ") ?? "",
      item.bibliography?.source_names.join(" ") ?? "",
      item.bibliography?.metadata_availability?.primary_provider_topic ?? "",
      item.bibliography?.metadata_availability?.license_labels.join(" ") ?? "",
      item.bibliography?.metadata_availability?.metadata_review_lane ?? "",
    ]),
    page,
    pageSize,
  );
}

export async function queryLayers(query: string, page: number, pageSize: number): Promise<PagedResult<EnvironmentalLayer>> {
  const {layers} = await loadAtlasData();
  return paginate(filterRecords(layers, query, (item) => [item.title, item.artifact_path, item.data_kind, item.role]), page, pageSize);
}

export async function queryExperiments(query: string, page: number, pageSize: number): Promise<PagedResult<ExperimentRecord>> {
  const {experiments} = await loadAtlasData();
  return paginate(filterRecords(experiments, query, (item) => [item.title, item.target, item.signal, item.evaluation, item.hypothesis]), page, pageSize);
}

function filterRecords<T>(items: readonly T[], query: string, fields: (item: T) => readonly string[]): readonly T[] {
  const normalized = query.trim().toLocaleLowerCase("en-AU");
  if (!normalized) return items;
  return items.filter((item) => fields(item).some((field) => field.toLocaleLowerCase("en-AU").includes(normalized)));
}

function paginate<T>(items: readonly T[], requestedPage: number, pageSize: number): PagedResult<T> {
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const page = Math.min(Math.max(1, requestedPage), pageCount);
  const offset = (page - 1) * pageSize;
  return {page, pageSize, total: items.length, pageCount, items: items.slice(offset, offset + pageSize)};
}
