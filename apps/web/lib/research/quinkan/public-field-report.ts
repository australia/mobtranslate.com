import "server-only";

import {createHash} from "node:crypto";
import {lstat, readdir, readFile, realpath} from "node:fs/promises";
import path from "node:path";
import {z} from "zod";
import {fieldReportContracts} from "./field-report-contract";

const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const utcSchema = z.string().min(20).endsWith("Z");
const distanceSummarySchema = z.object({
  count: z.number().int().nonnegative(),
  minimum: z.number().nonnegative(),
  median: z.number().nonnegative(),
  mean: z.number().nonnegative(),
  maximum: z.number().nonnegative(),
}).strict();
const bandCountsSchema = z.record(z.string(), z.number().int().nonnegative());
const nearestSchema = z.object({
  distanceMetres: z.number().nonnegative(),
  distanceBand: z.string().min(1),
  rankPercentile: z.number().min(0).max(1),
}).strict();
const algorithmThresholdSchema = z.object({
  minimumRankPercentile: z.number().min(0).max(1),
  nearestDistanceMetres: distanceSummarySchema,
  distanceBandCounts: bandCountsSchema,
  // Band-fair scoring (evaluator ≥ v3 contract amendment): distances against the
  // algorithm's FULL ranking band, not just its published/censored markers.
  fullBandNearestDistanceMetres: distanceSummarySchema.optional(),
}).strict();
const aggregateAlgorithmSchema = z.object({
  modelId: z.string().min(1),
  title: z.string().min(1),
  thresholds: z.array(algorithmThresholdSchema).min(1),
}).strict();
const locationAlgorithmSchema = z.object({
  modelId: z.string().min(1),
  title: z.string().min(1),
  thresholds: z.array(z.object({
    minimumRankPercentile: z.number().min(0).max(1),
    nearest: nearestSchema,
  }).strict()).min(1),
}).strict();
const publicFieldReportSchema = z.object({
  schemaVersion: z.literal(1),
  reportId: z.string().min(1),
  classification: z.literal("public_coordinate_redacted"),
  reportState: z.literal("pre_recalibration_complete"),
  preregistrationId: z.string().min(1),
  preregistrationFrozenAtUtc: utcSchema,
  baselineReleaseId: z.string().min(1),
  baselineGeneratedAtUtc: utcSchema,
  batchId: z.string().min(1),
  batchRecordedAtUtc: utcSchema,
  inputs: z.object({
    preregistrationSha256: sha256Schema,
    coordinateBatchSha256: sha256Schema,
    workspaceMapSha256: sha256Schema,
  }).strict(),
  baselineSummary: z.object({
    regionalEvaluatedCells: z.number().int().positive(),
    regionalPublishedProposals: z.number().int().positive(),
    highResolutionEvaluatedCells: z.number().int().positive(),
    highResolutionPublishedProposals: z.number().int().positive(),
    regionalAlgorithmCount: z.number().int().positive(),
  }).strict(),
  metricContract: z.object({
    distanceBandsMetres: z.array(z.number().positive()).min(1),
    regionalRankThresholds: z.array(z.number().min(0).max(1)).min(1),
    clusterBalanceDistanceMetres: z.number().positive(),
    clusterSummaryStatistic: z.string().min(1),
    highResolutionCoverageState: z.string().min(1),
    highResolutionCoverageWarning: z.string().min(1),
  }).strict(),
  perLocationResults: z.array(z.object({
    id: z.string().min(1),
    workingName: z.string().min(1),
    cavePresence: z.enum(["confirmed", "uncertain"]),
    artworkPresence: z.enum(["present", "absent", "unknown", "not_assessed"]),
    disclosure: z.enum(["per_location_without_coordinates", "aggregate_only"]),
    spatialClusterId: z.string().min(1),
    regionalNearest: nearestSchema,
    regionalByAlgorithm: z.array(locationAlgorithmSchema).min(1),
    highResolution: z.object({
      coverageState: z.string().min(1),
      nearest: nearestSchema.nullable(),
      warning: z.string().min(1),
    }).strict(),
  }).strict()),
  aggregate: z.object({
    pointCount: z.number().int().positive(),
    spatialClusterCount: z.number().int().positive(),
    confirmedCaveCount: z.number().int().nonnegative(),
    uncertainCaveCount: z.number().int().nonnegative(),
    artworkStatusCounts: z.object({
      present: z.number().int().nonnegative(),
      absent: z.number().int().nonnegative(),
      unknown: z.number().int().nonnegative(),
      not_assessed: z.number().int().nonnegative(),
    }).strict(),
    nearestRegionalDistanceMetres: distanceSummarySchema,
    nearestRegionalDistanceBandCounts: bandCountsSchema,
    clusterBalancedRegionalDistanceMetres: distanceSummarySchema,
    highResolutionCoverage: z.object({
      insideProofWindowCount: z.number().int().nonnegative(),
      outsideProofWindowNotEvaluatedCount: z.number().int().nonnegative(),
      nearestDistanceMetresInsideWindow: distanceSummarySchema.nullable(),
    }).strict(),
    regionalByAlgorithm: z.array(aggregateAlgorithmSchema).min(1),
    interpretation: z.string().min(1),
  }).strict(),
  bandCensoringNote: z.string().min(1).optional(),
  recalibrationPermitted: z.literal(true),
  lockedSequence: z.array(z.string().min(1)).min(5),
  reportRoute: z.literal("/report"),
  coordinateDisclosure: z.string().min(1),
  warning: z.string().min(1),
}).strict();

const publicationSchema = z.object({
  schemaVersion: z.literal(1),
  state: z.enum(["awaiting_coordinates", "published"]),
  preregistrationId: z.string().min(1),
  baselineReleaseId: z.string().min(1),
  selectedReport: z.object({
    relativePath: z.string().regex(/^outputs\/field-evaluation\/[a-zA-Z0-9._-]+\/public\.json$/),
    sha256: sha256Schema,
    publishedAtUtc: utcSchema,
  }).strict().nullable(),
  rule: z.string().min(1),
}).strict().superRefine((value, context) => {
  if ((value.state === "published") !== (value.selectedReport !== null)) {
    context.addIssue({code: "custom", message: "publication state and selected report disagree"});
  }
});

export type PublicFieldReport = z.infer<typeof publicFieldReportSchema>;

function digest(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function requireRegularFile(candidate: string): Promise<void> {
  const metadata = await lstat(candidate);
  if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error(`expected non-symlink regular file: ${candidate}`);
}

function researchRootPath(): string {
  return path.resolve(
    process.env.QUINKAN_RESEARCH_ROOT ?? "/mnt/donto-data/donto-resources/research/laura-rock-art-discovery",
  );
}

async function loadOnePublication(publicationPath: string): Promise<PublicFieldReport | null> {
  const researchRoot = researchRootPath();
  await requireRegularFile(publicationPath);
  const publication = publicationSchema.parse(JSON.parse(await readFile(publicationPath, "utf8")));
  const contract = fieldReportContracts.find(
    (candidate) => candidate.preregistrationId === publication.preregistrationId,
  );
  if (!contract) {
    throw new Error("field report publication preregistration is not pinned in the portal contract list");
  }
  if (publication.baselineReleaseId !== contract.baselineReleaseId) {
    throw new Error("field report publication baseline does not match its pinned contract");
  }
  if (!publication.selectedReport) return null;

  const resolvedRoot = await realpath(researchRoot);
  const reportPath = path.resolve(resolvedRoot, publication.selectedReport.relativePath);
  if (!reportPath.startsWith(`${resolvedRoot}${path.sep}`)) throw new Error("field report escapes the research root");
  await requireRegularFile(reportPath);
  const bytes = await readFile(reportPath);
  if (digest(bytes) !== publication.selectedReport.sha256) throw new Error("field report SHA-256 does not match publication selector");
  const report = publicFieldReportSchema.parse(JSON.parse(bytes.toString("utf8")));
  if (report.preregistrationId !== publication.preregistrationId) throw new Error("field report preregistration mismatch");
  if (report.baselineReleaseId !== publication.baselineReleaseId) throw new Error("field report baseline mismatch");
  if (report.inputs.preregistrationSha256 !== contract.preregistrationSha256) {
    throw new Error("field report was not evaluated under the frozen preregistration bytes");
  }
  if (report.inputs.workspaceMapSha256 !== contract.baselineWorkspaceMapSha256) {
    throw new Error("field report was not evaluated against its frozen baseline workspace map");
  }
  return report;
}

export async function loadPublishedFieldReports(): Promise<PublicFieldReport[]> {
  const publicationsDir = process.env.QUINKAN_FIELD_REPORT_PUBLICATIONS_DIR;
  const publicationPaths: string[] = [];
  if (publicationsDir) {
    const resolvedDir = path.resolve(publicationsDir);
    const entries = await readdir(resolvedDir, {withFileTypes: true});
    for (const entry of entries) {
      if (!entry.isFile() || entry.isSymbolicLink() || !entry.name.endsWith(".json")) continue;
      publicationPaths.push(path.join(resolvedDir, entry.name));
    }
    publicationPaths.sort();
  } else {
    publicationPaths.push(path.resolve(
      process.env.QUINKAN_FIELD_REPORT_PUBLICATION_PATH ?? path.join(researchRootPath(), "config/field-report-publication-v1.json"),
    ));
  }
  const reports: PublicFieldReport[] = [];
  for (const publicationPath of publicationPaths) {
    const report = await loadOnePublication(publicationPath);
    if (report) reports.push(report);
  }
  reports.sort((left, right) => right.batchRecordedAtUtc.localeCompare(left.batchRecordedAtUtc));
  return reports;
}

export async function loadPublishedFieldReport(): Promise<PublicFieldReport | null> {
  const reports = await loadPublishedFieldReports();
  return reports[0] ?? null;
}
