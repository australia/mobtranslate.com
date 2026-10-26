import {createHash} from "node:crypto";
import {lstat, readFile, readdir, realpath} from "node:fs/promises";
import path from "node:path";
import {z} from "zod";

const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const identifierSchema = z.string().regex(/^[a-z0-9](?:[a-z0-9._-]{1,118}[a-z0-9])$/);
const privateFileRoleSchema = z.enum([
  "exact_environmental_geometry",
  "acquisition_receipt",
  "restricted_structural_audit",
  "authorization_assertion",
]);
const privateFilePathSchema = z.enum([
  "private/exact-environmental-layer.geojson",
  "private/provenance/acquisition-receipt.json",
  "private/provenance/structural-audit.json",
  "private/provenance/authorization-assertion.md",
]);

const releasedPrivateFileSchema = z
  .object({
    role: privateFileRoleSchema,
    path: privateFilePathSchema,
    bytes: z.number().int().positive(),
    sha256: sha256Schema,
  })
  .strict();

const privateReleaseManifestSchema = z
  .object({
    schema_version: z.literal(1),
    release_id: identifierSchema,
    admitted_at_utc: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/),
    authority_record_id: identifierSchema,
    access_policy_id: identifierSchema,
    classification: z.string().min(1).max(2_000),
    evidence_status: z.literal("environmental_evidence_not_observed_cultural_evidence"),
    disclosure_scope: z.literal(
      "exact_restricted_environmental_geometry_to_authenticated_approved_subjects",
    ),
    public_disclosure_allowed: z.literal(false),
    admission_sha256: sha256Schema,
    source_inventory_sha256: sha256Schema,
    files: z.array(releasedPrivateFileSchema).length(4),
    builder: z
      .object({name: z.literal("quinkan-private-bundle"), version: z.string().min(1).max(80)})
      .strict(),
  })
  .strict();

const admittedPrivateFileSchema = z
  .object({
    role: privateFileRoleSchema,
    source_path: z.string().min(1).max(1_024),
    bytes: z.number().int().positive(),
    sha256: sha256Schema,
  })
  .strict();

const privateAdmissionSchema = z
  .object({
    schema_version: z.literal(1),
    release_id: identifierSchema,
    decision: z.literal("approved_for_private_workspace"),
    review_basis: z.literal("operator_authorization_assertion"),
    review_authority: z.string().min(1).max(2_000),
    reviewer_role: z.string().min(1).max(2_000),
    authority_record_id: identifierSchema,
    access_policy_id: identifierSchema,
    admitted_at_utc: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/),
    classification: z.string().min(1).max(2_000),
    evidence_status: z.literal("environmental_evidence_not_observed_cultural_evidence"),
    disclosure_scope: z.literal(
      "exact_restricted_environmental_geometry_to_authenticated_approved_subjects",
    ),
    public_disclosure_allowed: z.literal(false),
    source_inventory_sha256: sha256Schema,
    files: z.array(admittedPrivateFileSchema).length(4),
    warnings: z.array(z.string().min(1).max(2_000)).min(1).max(32),
  })
  .strict();

const geoJsonFeatureSchema = z
  .object({
    type: z.literal("Feature"),
    properties: z.record(z.string(), z.unknown()).nullable(),
    geometry: z.object({type: z.string().min(1), coordinates: z.unknown()}).passthrough(),
  })
  .passthrough();
const geoJsonFeatureCollectionSchema = z
  .object({
    type: z.literal("FeatureCollection"),
    features: z.array(geoJsonFeatureSchema).min(1),
  })
  .passthrough();

export type PrivateReleaseManifest = z.infer<typeof privateReleaseManifestSchema>;
export type PrivateAdmission = z.infer<typeof privateAdmissionSchema>;
export type PrivateGeoJson = z.infer<typeof geoJsonFeatureCollectionSchema>;
export type VerifiedPrivateRelease = Readonly<{
  manifest: PrivateReleaseManifest;
  admission: PrivateAdmission;
  exactLayer: PrivateGeoJson;
  exactLayerBytes: Buffer;
}>;
export type PrivateReleaseConfig = Readonly<{releasesDir: string; releaseId: string}>;

const expectedRolePaths = new Map([
  ["exact_environmental_geometry", "private/exact-environmental-layer.geojson"],
  ["acquisition_receipt", "private/provenance/acquisition-receipt.json"],
  ["restricted_structural_audit", "private/provenance/structural-audit.json"],
  ["authorization_assertion", "private/provenance/authorization-assertion.md"],
] as const);

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function requireDirectoryWithoutSymlink(candidate: string): Promise<void> {
  const metadata = await lstat(candidate);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error("private release path must contain only non-symlink directories");
  }
}

async function requireRegularFileWithoutSymlink(candidate: string): Promise<void> {
  const metadata = await lstat(candidate);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error("private release path must contain only non-symlink regular files");
  }
}

async function requireExactEntries(directory: string, expected: readonly string[]): Promise<void> {
  const observed = (await readdir(directory)).sort();
  const wanted = [...expected].sort();
  if (observed.length !== wanted.length || observed.some((entry, index) => entry !== wanted[index])) {
    throw new Error("private release contains unexpected or missing entries");
  }
}

function verifyManifestFileSet(manifest: PrivateReleaseManifest): void {
  const observedRoles = new Set<string>();
  const observedPaths = new Set<string>();
  for (const file of manifest.files) {
    if (observedRoles.has(file.role) || observedPaths.has(file.path)) {
      throw new Error("private release manifest contains duplicate file bindings");
    }
    observedRoles.add(file.role);
    observedPaths.add(file.path);
    if (expectedRolePaths.get(file.role) !== file.path) {
      throw new Error("private release manifest role/path binding is invalid");
    }
  }
  if (observedRoles.size !== expectedRolePaths.size) {
    throw new Error("private release manifest does not bind every required role");
  }
}

function verifyManifestAdmissionRelationship(
  manifest: PrivateReleaseManifest,
  admission: PrivateAdmission,
): void {
  for (const key of [
    "release_id",
    "admitted_at_utc",
    "authority_record_id",
    "access_policy_id",
    "classification",
    "evidence_status",
    "disclosure_scope",
    "public_disclosure_allowed",
    "source_inventory_sha256",
  ] as const) {
    if (manifest[key] !== admission[key]) {
      throw new Error(`private release manifest/admission mismatch: ${key}`);
    }
  }
  const admittedByRole = new Map(admission.files.map((file) => [file.role, file]));
  for (const released of manifest.files) {
    const admitted = admittedByRole.get(released.role);
    if (!admitted || admitted.bytes !== released.bytes || admitted.sha256 !== released.sha256) {
      throw new Error("private release manifest does not preserve admission byte/hash bindings");
    }
  }
}

export async function loadPrivateReleaseFromConfig(
  config: PrivateReleaseConfig,
): Promise<VerifiedPrivateRelease> {
  const releaseId = identifierSchema.parse(config.releaseId);
  if (!path.isAbsolute(config.releasesDir)) {
    throw new Error("private releases directory must be absolute");
  }
  const releasesDir = path.resolve(config.releasesDir);
  await requireDirectoryWithoutSymlink(releasesDir);
  const releasesRealPath = await realpath(releasesDir);
  if (releasesRealPath !== releasesDir) {
    throw new Error("private releases directory may not contain symlink components");
  }

  const releaseDir = path.join(releasesRealPath, releaseId);
  await requireDirectoryWithoutSymlink(releaseDir);
  const releaseRealPath = await realpath(releaseDir);
  if (path.dirname(releaseRealPath) !== releasesRealPath) {
    throw new Error("selected private release escapes the configured releases directory");
  }
  await requireExactEntries(releaseRealPath, ["admission.json", "private", "private-release-manifest.json"]);

  const privateDir = path.join(releaseRealPath, "private");
  const provenanceDir = path.join(privateDir, "provenance");
  await requireDirectoryWithoutSymlink(privateDir);
  await requireDirectoryWithoutSymlink(provenanceDir);
  await requireExactEntries(privateDir, ["exact-environmental-layer.geojson", "provenance"]);
  await requireExactEntries(provenanceDir, [
    "acquisition-receipt.json",
    "authorization-assertion.md",
    "structural-audit.json",
  ]);

  const manifestPath = path.join(releaseRealPath, "private-release-manifest.json");
  const admissionPath = path.join(releaseRealPath, "admission.json");
  await requireRegularFileWithoutSymlink(manifestPath);
  await requireRegularFileWithoutSymlink(admissionPath);
  const manifest = privateReleaseManifestSchema.parse(JSON.parse(await readFile(manifestPath, "utf8")));
  if (manifest.release_id !== releaseId) {
    throw new Error("private release manifest ID does not match selected immutable release");
  }
  verifyManifestFileSet(manifest);

  const admissionBytes = await readFile(admissionPath);
  if (sha256(admissionBytes) !== manifest.admission_sha256) {
    throw new Error("private admission does not match the release manifest");
  }
  const admission = privateAdmissionSchema.parse(JSON.parse(admissionBytes.toString("utf8")));
  verifyManifestAdmissionRelationship(manifest, admission);

  const loadedFiles = new Map<string, Buffer>();
  for (const released of manifest.files) {
    const filename = path.join(releaseRealPath, released.path);
    await requireRegularFileWithoutSymlink(filename);
    const bytes = await readFile(filename);
    if (bytes.byteLength !== released.bytes || sha256(bytes) !== released.sha256) {
      throw new Error("private release file does not match immutable byte/hash binding");
    }
    loadedFiles.set(released.role, bytes);
  }

  const exactLayerBytes = loadedFiles.get("exact_environmental_geometry");
  if (!exactLayerBytes) throw new Error("private release exact layer is missing");
  const exactLayer = geoJsonFeatureCollectionSchema.parse(JSON.parse(exactLayerBytes.toString("utf8")));
  JSON.parse(loadedFiles.get("acquisition_receipt")?.toString("utf8") ?? "null");
  JSON.parse(loadedFiles.get("restricted_structural_audit")?.toString("utf8") ?? "null");
  const assertion = loadedFiles.get("authorization_assertion")?.toString("utf8").trim();
  if (!assertion) throw new Error("private release authorization assertion is empty");

  return Object.freeze({
    manifest: Object.freeze(manifest),
    admission: Object.freeze(admission),
    exactLayer: Object.freeze(exactLayer),
    exactLayerBytes,
  });
}
