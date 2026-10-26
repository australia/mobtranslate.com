import "server-only";

import {execFile} from "node:child_process";
import {createHash} from "node:crypto";
import {createReadStream} from "node:fs";
import {lstat, open, readFile, readdir, realpath} from "node:fs/promises";
import path from "node:path";
import {promisify} from "node:util";

const execFileAsync = promisify(execFile);
import {z} from "zod";
import {indexProposalDetailChunks, type ProposalRange} from "./proposal-range-index";
import type {OperationalWorkspace, ProposalDetail} from "./workspace-types";

const releaseIdSchema = z.string().regex(/^[a-z0-9](?:[a-z0-9-]{1,78}[a-z0-9])$/);
const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const manifestFileSchema = z
  .object({
    path: z.string().regex(/^(?:approval\.json|proposal-details\.json|workspace-map\.json|assets\/[a-z0-9-]+\.png)$/),
    bytes: z.number().int().positive(),
    sha256: sha256Schema,
  })
  .strict();
const manifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    releaseId: releaseIdSchema,
    generatedAtUtc: z.string().min(20).endsWith("Z"),
    approvalSha256: sha256Schema,
    files: z.array(manifestFileSchema).min(4),
    builder: z
      .object({
        name: z.literal("quinkan-operational-map-release"),
        version: z.string().min(1),
      })
      .strict(),
  })
  .strict();

const boundsSchema = z
  .object({west: z.number(), south: z.number(), east: z.number(), north: z.number()})
  .strict();
const algorithmScoreSchema = z
  .object({
    modelId: z.string(),
    title: z.string(),
    score: z.number(),
    rankPercentile: z.number().min(0).max(1),
    uncertainty: z.number(),
  })
  .strict();
const holdoutThresholdHitsSchema = z.object({
  topFraction: z.number().gt(0).lt(0.5), minimumRankPercentile: z.number().min(0.5).max(1),
  heldOutHits: z.number().int().nonnegative(), heldOutHitRate: z.number().min(0).max(1),
  expectedHitsUnderUniformChance: z.number().nonnegative().optional(),
  atLeastObservedHitsChanceProbability: z.number().min(0).max(1).optional(),
}).strict();
const holdoutRankSummarySchema = z.object({
  heldOutRecordCount: z.number().int().positive(), uniqueHeldOutCellCount: z.number().int().positive(),
  minimumRankPercentile: z.number().min(0).max(1), medianRankPercentile: z.number().min(0).max(1),
  meanRankPercentile: z.number().min(0).max(1), maximumRankPercentile: z.number().min(0).max(1),
  thresholdHits: z.array(holdoutThresholdHitsSchema).min(1),
}).strict();
const heldOutResultSchema = z.object({
  pointId: z.string(), title: z.string(), sourceKind: z.string(), sourceRecordId: z.string(), nearestCellId: z.string(),
  priorityScore: z.number().min(0).max(1), rankPercentile: z.number().min(0).max(1),
  nearestTrainingPointDistanceMetres: z.number().nonnegative(),
}).strict();
const fieldHoldoutFoldSchema = z.object({
  groupId: z.string(), trainingPointIds: z.array(z.string()).min(1), heldOutPointIds: z.array(z.string()).min(1),
  trainingUniqueCellCount: z.number().int().positive(), heldOutUniqueCellCount: z.number().int().positive(),
  minimumHeldOutToTrainingDistanceMetres: z.number().nonnegative(), foldTargetSha256: sha256Schema,
  heldOut: z.array(heldOutResultSchema).min(1), summary: holdoutRankSummarySchema,
}).strict();
const fieldHoldoutDesignSchema = z.object({
  designId: z.string(), groupingMethod: z.string(), groupCount: z.number().int().min(2),
  folds: z.array(fieldHoldoutFoldSchema).min(2), aggregate: holdoutRankSummarySchema,
}).strict();
const fieldModelValidationSchema = z.object({
  positiveRecordCount: z.number().int().positive(), uniquePositiveCellCount: z.number().int().positive(),
  evaluatedRegionalCellCount: z.number().int().positive(), covariateCount: z.number().int().positive(),
  // One design is valid: the source-record design is skipped (with a recorded
  // limitation) when every record shares a single source, e.g. the family-only
  // training era after the 2026-08-12 public-source retirement.
  spatialClusterThresholdMetres: z.number().positive(), targetAggregation: z.string(), designs: z.array(fieldHoldoutDesignSchema).min(1),
  interpretation: z.string(), limitations: z.array(z.string()).min(1),
}).strict();
const workspaceSchema = z
  .object({
    schemaVersion: z.literal(1),
    releaseId: releaseIdSchema,
    generatedAtUtc: z.string().min(20).endsWith("Z"),
    bounds: boundsSchema,
    imageCorners: z.tuple([
      z.tuple([z.number(), z.number()]),
      z.tuple([z.number(), z.number()]),
      z.tuple([z.number(), z.number()]),
      z.tuple([z.number(), z.number()]),
    ]),
    basemaps: z.array(
      z.object({id: z.string(), title: z.string(), styleUrl: z.string().url(), attribution: z.string()}).strict(),
    ).min(1),
    knownLocations: z.array(
      z.object({
        id: z.string(), title: z.string(), longitude: z.number(), latitude: z.number(),
        classification: z.string(), locationPrecision: z.string(), sourceKind: z.string(),
        sourceRecordId: z.string(), sourceUrl: z.string().url(), note: z.string(),
        uncertaintyMetres: z.number().positive().nullable(), precisionClass: z.string(),
        supportingRecordCount: z.number().int().positive(), identityGroup: z.string(),
      }).strict(),
    ),
    fieldObservations: z.array(
      z.object({
        id: z.string(), recordId: z.string(), workingName: z.string(), role: z.string(), trainingRole: z.string(),
        longitude: z.number(), latitude: z.number(), coordinateAsSupplied: z.string(), attestation: z.string(),
        nearestCovariateCellId: z.string(), nearestCovariateCellDistanceMetres: z.number().nonnegative(),
        covariates: z.array(z.object({
          column: z.string(), sourcePath: z.string(), value: z.number(), targetValue: z.number(), modelWeight: z.number().nonnegative(),
        }).strict()).min(1),
      }).strict(),
    ).default([]),
    fieldModelValidation: fieldModelValidationSchema.nullable().default(null),
    proposalCollections: z.array(
      z.object({
        id: z.enum(["regional", "high-resolution"]), title: z.string(), modelIds: z.array(z.string()),
        resolutionMetres: z.number().positive(), evaluatedCells: z.number().int().positive(),
        publishedMarkers: z.number().int().positive(), minimumPublishedPercentile: z.number().min(0).max(1),
        validationStatus: z.string(), warning: z.string(),
      }).strict(),
    ),
    proposals: z.array(
      z.object({
        id: z.string(), collectionId: z.enum(["regional", "high-resolution"]),
        longitude: z.number(), latitude: z.number(), confidencePercentile: z.number().min(0).max(1),
        priorityScore: z.number(), uncertainty: z.number(), algorithmScores: z.array(algorithmScoreSchema).min(1),
      }).strict(),
    ),
    overlays: z.array(
      z.object({
        id: z.string().regex(/^[a-z0-9-]+$/), title: z.string(), group: z.string(), assetUrl: z.string(),
        bytes: z.number().int().positive(), sha256: sha256Schema, sourceArtifactSha256: sha256Schema,
        opacity: z.number().min(0).max(1), defaultVisible: z.boolean(), legend: z.string(), interpretation: z.string(),
        sourceUrl: z.string().url().startsWith("https://").optional(),
      }).strict(),
    ),
    sources: z.array(
      z.object({id: z.string(), title: z.string(), url: z.string().url(), licence: z.string(), note: z.string()}).strict(),
    ),
    warning: z.string(),
    limitations: z.array(z.string()),
  })
  .strict();
const contributionSchema = z
  .object({
    column: z.string(), label: z.string(), rationale: z.string(), unit: z.string(), rawValue: z.number(),
    targetValue: z.number().nullable().default(null),
    direction: z.string(), transform: z.string(), empiricalPercentile: z.number().min(0).max(1),
    modelContribution: z.number(), weight: z.number(),
  })
  .strict();
const observationComponentSchema = z
  .object({
    componentId: z.string(), title: z.string(), score: z.number().min(0).max(1),
    combineWeight: z.number().min(0), includedInPrimaryIndex: z.boolean(), interpretation: z.string(),
  })
  .strict();
const observationProcessSchema = z
  .object({
    indexId: z.string(), title: z.string(),
    observationAvailabilityScore: z.number().min(0).max(1),
    observationAvailabilityRankPercentile: z.number().min(0).max(1),
    underObservedRankPercentile: z.number().min(0).max(1),
    occurrenceRankPercentile: z.number().min(0).max(1),
    occurrenceMinusObservationRank: z.number().min(-1).max(1),
    components: z.array(observationComponentSchema).min(1),
    interpretation: z.string(), residualDefinition: z.string(), warning: z.string(),
  })
  .strict();
const proposalDetailSchema = z
  .object({
    id: z.string(), collectionId: z.enum(["regional", "high-resolution"]), longitude: z.number(), latitude: z.number(),
    sourceCellId: z.string(), blockId: z.string(),
    algorithmResults: z.array(algorithmScoreSchema.extend({contributors: z.array(contributionSchema)})).min(1),
    observationProcess: observationProcessSchema.optional(),
    interpretation: z.string(), warnings: z.array(z.string()),
  })
  .strict();

const approvalSummarySchema = z.looseObject({
  schemaVersion: z.literal(1),
  releaseId: releaseIdSchema,
  decision: z.string().min(1),
  authorityRecordId: z.string().min(1),
  approvedAtUtc: z.string().min(20).endsWith("Z"),
  locationDisclosure: z.string().min(1),
});

export type ReleaseApprovalSummary = Readonly<{
  releaseId: string;
  decision: string;
  authorityRecordId: string;
  approvedAtUtc: string;
  locationDisclosure: string;
}>;

type Manifest = z.infer<typeof manifestSchema>;
type VerifiedRelease = Readonly<{
  releaseDir: string;
  manifest: Manifest;
  workspace: OperationalWorkspace;
  workspaceMapSha256: string;
  approvalSummary: ReleaseApprovalSummary;
}>;
let configuredRelease: Promise<VerifiedRelease> | undefined;
let configuredProposalRanges: Promise<ReadonlyMap<string, ProposalRange>> | undefined;
const baselineReleases = new Map<string, Promise<VerifiedRelease>>();

function digest(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function rejectRestrictedComponent(candidate: string): void {
  if (path.resolve(candidate).split(path.sep).some((component) => component.toLowerCase() === "restricted")) {
    throw new Error(`operational release path contains forbidden restricted component: ${candidate}`);
  }
}

async function requireDirectory(candidate: string): Promise<void> {
  const metadata = await lstat(candidate);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) throw new Error(`expected non-symlink directory: ${candidate}`);
}

async function requireFile(candidate: string): Promise<void> {
  const metadata = await lstat(candidate);
  if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error(`expected non-symlink regular file: ${candidate}`);
}

// Superseded-era releases may hold their bulk member (proposal-details.json,
// ~99.7% of a release) as a zstd-compressed sibling. Verification is unchanged:
// readVerified hashes the DECOMPRESSED bytes against the manifest, so the
// storage form can never alter what is served. Only this one member may be
// compressed — everything else must be present raw, byte-exact.
const COMPRESSIBLE_MEMBER = "proposal-details.json";

function normalizeReleaseEntry(entry: string): string {
  return entry === `${COMPRESSIBLE_MEMBER}.zst` ? COMPRESSIBLE_MEMBER : entry;
}

async function requireExactEntries(directory: string, expected: readonly string[]): Promise<void> {
  const observed = (await readdir(directory)).map(normalizeReleaseEntry).sort();
  const wanted = [...expected].sort();
  if (observed.length !== wanted.length || observed.some((entry, index) => entry !== wanted[index])) {
    throw new Error(`unexpected operational release entries in ${directory}`);
  }
}

async function requireMemberFile(directory: string, name: string): Promise<void> {
  const raw = path.join(directory, name);
  try {
    await requireFile(raw);
  } catch (error) {
    if (name !== COMPRESSIBLE_MEMBER) throw error;
    await requireFile(`${raw}.zst`);
  }
}

async function readMemberBytes(releaseDir: string, relativePath: string): Promise<Buffer> {
  const absolutePath = path.join(releaseDir, relativePath);
  try {
    return await readFile(absolutePath);
  } catch (error) {
    if (relativePath !== COMPRESSIBLE_MEMBER) throw error;
    const compressed = `${absolutePath}.zst`;
    await requireFile(compressed);
    const {stdout} = await execFileAsync("zstd", ["-d", "-c", compressed], {
      encoding: "buffer",
      maxBuffer: 4 * 1024 * 1024 * 1024,
    });
    return stdout;
  }
}

async function loadConfigured(): Promise<VerifiedRelease> {
  const releaseIdValue = process.env.QUINKAN_OPERATIONAL_MAP_RELEASE_ID;
  if (!releaseIdValue) throw new Error("operational map release is not configured");
  return loadVerifiedRelease(releaseIdValue);
}

async function loadVerifiedRelease(releaseIdValue: string): Promise<VerifiedRelease> {
  const releasesDirValue = process.env.QUINKAN_OPERATIONAL_MAP_RELEASES_DIR;
  if (!releasesDirValue) throw new Error("operational map release is not configured");
  const releaseId = releaseIdSchema.parse(releaseIdValue);
  const releasesDir = path.resolve(releasesDirValue);
  rejectRestrictedComponent(releasesDir);
  await requireDirectory(releasesDir);
  const releasesRealPath = await realpath(releasesDir);
  const releaseDir = path.join(releasesRealPath, releaseId);
  await requireDirectory(releaseDir);
  const releaseRealPath = await realpath(releaseDir);
  if (path.dirname(releaseRealPath) !== releasesRealPath) throw new Error("operational release escapes configured root");
  rejectRestrictedComponent(releaseRealPath);
  await requireExactEntries(releaseRealPath, ["approval.json", "assets", "manifest.json", "proposal-details.json", "workspace-map.json"]);
  await requireDirectory(path.join(releaseRealPath, "assets"));
  for (const name of ["approval.json", "manifest.json", "proposal-details.json", "workspace-map.json"]) {
    await requireMemberFile(releaseRealPath, name);
  }
  const manifest = manifestSchema.parse(JSON.parse(await readFile(path.join(releaseRealPath, "manifest.json"), "utf8")));
  if (manifest.releaseId !== releaseId) throw new Error("operational manifest ID does not match selected release");
  const manifestPaths = new Set(manifest.files.map((file) => file.path));
  if (manifestPaths.size !== manifest.files.length) throw new Error("operational manifest contains duplicate paths");
  for (const required of ["approval.json", "proposal-details.json", "workspace-map.json"]) {
    if (!manifestPaths.has(required)) throw new Error(`operational manifest does not bind ${required}`);
  }
  const declaredAssets = manifest.files.filter((file) => file.path.startsWith("assets/")).map((file) => path.basename(file.path));
  await requireExactEntries(path.join(releaseRealPath, "assets"), declaredAssets);
  const approvalBytes = await readFile(path.join(releaseRealPath, "approval.json"));
  if (approvalBytes.byteLength !== manifest.files.find((file) => file.path === "approval.json")?.bytes || digest(approvalBytes) !== manifest.approvalSha256) {
    throw new Error("operational approval does not match manifest");
  }
  const approvalParsed = approvalSummarySchema.parse(JSON.parse(approvalBytes.toString("utf8")));
  if (approvalParsed.releaseId !== releaseId) throw new Error("operational approval ID does not match selected release");
  const approvalSummary: ReleaseApprovalSummary = Object.freeze({
    releaseId: approvalParsed.releaseId,
    decision: approvalParsed.decision,
    authorityRecordId: approvalParsed.authorityRecordId,
    approvedAtUtc: approvalParsed.approvedAtUtc,
    locationDisclosure: approvalParsed.locationDisclosure,
  });
  const workspaceBytes = await readVerified(releaseRealPath, manifest, "workspace-map.json");
  const workspace = workspaceSchema.parse(JSON.parse(workspaceBytes.toString("utf8"))) as OperationalWorkspace;
  if (workspace.releaseId !== releaseId) throw new Error("workspace ID does not match selected release");
  if (workspace.proposals.length !== workspace.proposalCollections.reduce((sum, item) => sum + item.publishedMarkers, 0)) {
    throw new Error("workspace proposal counts do not reconcile");
  }
  for (const overlay of workspace.overlays) {
    const expected = manifest.files.find((file) => file.path === `assets/${overlay.id}.png`);
    if (!expected || expected.sha256 !== overlay.sha256 || expected.bytes !== overlay.bytes) {
      throw new Error(`workspace overlay declaration does not match manifest: ${overlay.id}`);
    }
  }
  return Object.freeze({
    releaseDir: releaseRealPath,
    manifest,
    workspace: Object.freeze(workspace),
    workspaceMapSha256: digest(workspaceBytes),
    approvalSummary,
  });
}

async function readVerified(releaseDir: string, manifest: Manifest, relativePath: string): Promise<Buffer> {
  const expected = manifest.files.find((file) => file.path === relativePath);
  if (!expected) throw new Error(`file is not manifest-bound: ${relativePath}`);
  const absolutePath = path.join(releaseDir, relativePath);
  if (!absolutePath.startsWith(`${releaseDir}${path.sep}`)) throw new Error("release file escapes immutable directory");
  const bytes = await readMemberBytes(releaseDir, relativePath);
  if (bytes.byteLength !== expected.bytes || digest(bytes) !== expected.sha256) {
    throw new Error(`operational file does not match manifest: ${relativePath}`);
  }
  return bytes;
}

export async function loadConfiguredWorkspaceRelease(): Promise<VerifiedRelease> {
  configuredRelease ??= loadConfigured();
  return configuredRelease;
}

// Loads the immutable release a published field report was evaluated against.
// The release is only served when its workspace-map.json bytes hash to the
// report's frozen inputs.workspaceMapSha256, so this cannot be used to reach an
// arbitrary release — only the exact surface the published evaluation pinned.
export async function loadFieldReportBaselineRelease(
  report: Readonly<{baselineReleaseId: string; inputs: Readonly<{workspaceMapSha256: string}>}>,
): Promise<VerifiedRelease> {
  const releaseId = releaseIdSchema.parse(report.baselineReleaseId);
  let pending = baselineReleases.get(releaseId);
  if (!pending) {
    pending = loadVerifiedRelease(releaseId);
    baselineReleases.set(releaseId, pending);
    pending.catch(() => baselineReleases.delete(releaseId));
  }
  const release = await pending;
  if (release.workspaceMapSha256 !== report.inputs.workspaceMapSha256) {
    throw new Error("baseline release does not match the report's frozen workspace hash");
  }
  return release;
}

export async function loadReleaseAsset(
  release: VerifiedRelease,
  assetName: string,
): Promise<Readonly<{bytes: Buffer; sha256: string}>> {
  if (!/^[a-z0-9-]+\.png$/.test(assetName)) throw new Error("invalid workspace asset name");
  const relativePath = `assets/${assetName}`;
  const expected = release.manifest.files.find((file) => file.path === relativePath);
  if (!expected) throw new Error("workspace asset is not manifest-bound");
  return {bytes: await readVerified(release.releaseDir, release.manifest, relativePath), sha256: expected.sha256};
}

function configuredProposalRangeIndex(release: VerifiedRelease): Promise<ReadonlyMap<string, ProposalRange>> {
  if (!configuredProposalRanges) {
    configuredProposalRanges = buildVerifiedProposalRanges(release);
    configuredProposalRanges.catch(() => {
      configuredProposalRanges = undefined;
    });
  }
  return configuredProposalRanges;
}

// Hashing and indexing the ~1 GB detail file takes about a minute on this host.
// Start it when the atlas loads its workspace so the first proposal click does
// not wait for the whole pass.
export function warmProposalDetailIndex(): void {
  void loadConfiguredWorkspaceRelease()
    .then(configuredProposalRangeIndex)
    .catch(() => undefined);
}

export async function loadProposalDetail(proposalId: string): Promise<ProposalDetail | null> {
  if (!/^(?:regional-r\d+c\d+|highres-hr_r\d+c\d+)$/.test(proposalId)) return null;
  const release = await loadConfiguredWorkspaceRelease();
  const range = (await configuredProposalRangeIndex(release)).get(proposalId);
  if (!range) return null;
  if (range.length > 10_000_000) throw new Error("proposal detail exceeds the bounded record size");
  const absolutePath = path.join(release.releaseDir, "proposal-details.json");
  const handle = await open(absolutePath, "r");
  const bytes = Buffer.allocUnsafe(range.length);
  try {
    const result = await handle.read(bytes, 0, range.length, range.offset);
    if (result.bytesRead !== range.length) throw new Error("proposal detail range was truncated");
  } finally {
    await handle.close();
  }
  const raw: unknown = JSON.parse(bytes.toString("utf8"));
  const detail = proposalDetailSchema.parse(raw) as ProposalDetail;
  if (detail.id !== proposalId) throw new Error("proposal detail ID mismatch");
  return detail;
}

async function buildVerifiedProposalRanges(release: VerifiedRelease): Promise<ReadonlyMap<string, ProposalRange>> {
  const expected = release.manifest.files.find((file) => file.path === "proposal-details.json");
  if (!expected) throw new Error("proposal detail file is not manifest-bound");
  const absolutePath = path.join(release.releaseDir, "proposal-details.json");
  await requireFile(absolutePath);
  const input = createReadStream(absolutePath);
  const indexed = await indexProposalDetailChunks(input);
  if (indexed.observedBytes !== expected.bytes || indexed.sha256 !== expected.sha256) {
    throw new Error("proposal detail file does not match manifest");
  }
  if (indexed.ranges.size !== release.workspace.proposals.length) {
    throw new Error("proposal detail range count does not reconcile with workspace markers");
  }
  return indexed.ranges;
}

export async function loadWorkspaceAsset(assetName: string): Promise<Readonly<{bytes: Buffer; sha256: string}>> {
  return loadReleaseAsset(await loadConfiguredWorkspaceRelease(), assetName);
}
