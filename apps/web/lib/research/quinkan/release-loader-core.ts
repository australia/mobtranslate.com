import {createHash} from "node:crypto";
import {lstat, readFile, readdir, realpath} from "node:fs/promises";
import path from "node:path";
import {z} from "zod";

const publicFilenames = [
  "atlas-map.json",
  "environmental-layers.json",
  "experiments.json",
  "model-summary.json",
  "project.json",
  "sources.json",
] as const;
type PublicFilename = (typeof publicFilenames)[number];

const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const releaseIdSchema = z.string().regex(/^[a-z0-9](?:[a-z0-9-]{1,78}[a-z0-9])$/);
const releasedFileSchema = z
  .object({
    path: z.enum(publicFilenames.map((name) => `public/${name}`) as [
      `public/${PublicFilename}`,
      ...`public/${PublicFilename}`[],
    ]),
    sha256: sha256Schema,
    bytes: z.number().int().positive(),
  })
  .strict();

const releaseManifestSchema = z
  .object({
    schema_version: z.literal(1),
    release_id: releaseIdSchema,
    approved_at_utc: z.string().min(20).endsWith("Z"),
    authority_record_id: z.string().min(1).max(160),
    approval_sha256: sha256Schema,
    files: z.array(releasedFileSchema).length(publicFilenames.length),
    builder: z
      .object({name: z.literal("quinkan-public-bundle"), version: z.string().min(1)})
      .strict(),
  })
  .strict();

export type ReleaseManifest = z.infer<typeof releaseManifestSchema>;
export type PublicPayloads = Record<PublicFilename, Record<string, unknown>>;
export type VerifiedPublicRelease = Readonly<{
  manifest: ReleaseManifest;
  payloads: PublicPayloads;
}>;

export type PublicReleaseConfig = Readonly<{releasesDir: string; releaseId: string}>;

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function rejectRestrictedComponent(candidate: string): void {
  if (path.resolve(candidate).split(path.sep).some((component) => component.toLowerCase() === "restricted")) {
    throw new Error(`public release path contains forbidden restricted component: ${candidate}`);
  }
}

async function requireDirectoryWithoutSymlink(candidate: string): Promise<void> {
  const metadata = await lstat(candidate);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error(`expected non-symlink directory: ${candidate}`);
  }
}

async function requireRegularFileWithoutSymlink(candidate: string): Promise<void> {
  const metadata = await lstat(candidate);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error(`expected non-symlink regular file: ${candidate}`);
  }
}

async function requireExactEntries(directory: string, expected: readonly string[]): Promise<void> {
  const entries = await readdir(directory);
  const observed = [...entries].sort();
  const wanted = [...expected].sort();
  if (observed.length !== wanted.length || observed.some((entry, index) => entry !== wanted[index])) {
    throw new Error(`unexpected public release entries in ${directory}`);
  }
}

function parseObject(bytes: Buffer, filename: string): Record<string, unknown> {
  const value: unknown = JSON.parse(bytes.toString("utf8"));
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`public payload is not a JSON object: ${filename}`);
  }
  return value as Record<string, unknown>;
}

export async function loadPublicReleaseFromConfig(
  config: PublicReleaseConfig,
): Promise<VerifiedPublicRelease> {
  const releaseId = releaseIdSchema.parse(config.releaseId);
  const releasesDir = path.resolve(config.releasesDir);
  rejectRestrictedComponent(releasesDir);
  await requireDirectoryWithoutSymlink(releasesDir);
  const releasesRealPath = await realpath(releasesDir);
  rejectRestrictedComponent(releasesRealPath);

  const releaseDir = path.join(releasesRealPath, releaseId);
  rejectRestrictedComponent(releaseDir);
  await requireDirectoryWithoutSymlink(releaseDir);
  const releaseRealPath = await realpath(releaseDir);
  if (path.dirname(releaseRealPath) !== releasesRealPath) {
    throw new Error("selected release escapes the configured releases directory");
  }
  rejectRestrictedComponent(releaseRealPath);
  await requireExactEntries(releaseRealPath, ["approval.json", "public", "release-manifest.json"]);

  const manifestPath = path.join(releaseRealPath, "release-manifest.json");
  const approvalPath = path.join(releaseRealPath, "approval.json");
  const publicDir = path.join(releaseRealPath, "public");
  await requireRegularFileWithoutSymlink(manifestPath);
  await requireRegularFileWithoutSymlink(approvalPath);
  await requireDirectoryWithoutSymlink(publicDir);
  await requireExactEntries(publicDir, publicFilenames);

  const manifest = releaseManifestSchema.parse(JSON.parse(await readFile(manifestPath, "utf8")));
  if (manifest.release_id !== releaseId) {
    throw new Error("release manifest ID does not match the selected immutable release");
  }
  const manifestPaths = new Set(manifest.files.map((file) => file.path));
  if (
    manifestPaths.size !== publicFilenames.length ||
    publicFilenames.some((filename) => !manifestPaths.has(`public/${filename}`))
  ) {
    throw new Error("release manifest must bind exactly the six public payloads");
  }

  const approvalBytes = await readFile(approvalPath);
  if (sha256(approvalBytes) !== manifest.approval_sha256) {
    throw new Error("approval record hash does not match the release manifest");
  }

  const payloads = {} as PublicPayloads;
  for (const filename of publicFilenames) {
    const payloadPath = path.join(publicDir, filename);
    await requireRegularFileWithoutSymlink(payloadPath);
    const bytes = await readFile(payloadPath);
    const expected = manifest.files.find((file) => file.path === `public/${filename}`);
    if (!expected || bytes.byteLength !== expected.bytes || sha256(bytes) !== expected.sha256) {
      throw new Error(`public payload does not match release manifest: ${filename}`);
    }
    payloads[filename] = parseObject(bytes, filename);
  }

  return Object.freeze({manifest, payloads: Object.freeze(payloads)});
}
