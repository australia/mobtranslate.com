import {createHash} from "node:crypto";
import {lstat, readFile, readdir, realpath} from "node:fs/promises";
import path from "node:path";
import {z} from "zod";

const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const mapPathSchema = z.string().regex(/^maps\/(?:hypothesis-overview|h\d{2}-r\d+c\d+)\.png$/);
const finiteNumber = z.number().finite();

const nearbyCellSchema = z
  .object({
    cellId: z.string().min(1).max(80),
    easting: finiteNumber,
    northing: finiteNumber,
    distanceMetres: finiteNumber.nonnegative(),
  })
  .passthrough();

const cathedralHypothesisSchema = z
  .object({
    hypothesisId: z.string().regex(/^H\d{2}$/),
    workingName: z.string().min(1).max(160),
    cellId: z.string().regex(/^r\d+c\d+$/),
    location: z
      .object({
        longitude: finiteNumber,
        latitude: finiteNumber,
        eastingMga55: finiteNumber,
        northingMga55: finiteNumber,
        distanceFromSuppliedPointMetres: finiteNumber.nonnegative(),
      })
      .strict(),
    selection: z
      .object({
        bestAxis: z.enum(["benchAxis", "summitAxis", "scarpAxis"]),
        bestAxisRankWithinSearchWindow: z.number().int().positive(),
        benchAxis: finiteNumber,
        summitAxis: finiteNumber,
        scarpAxis: finiteNumber,
      })
      .strict(),
    terrain: z
      .object({
        elevationMetres: finiteNumber,
        slopeDegrees: finiteNumber,
        roughnessMetres: finiteNumber,
        tpi300mMetres: finiteNumber,
        tpi900mMetres: finiteNumber,
        surfaceRockOutcropPercentMapped: finiteNumber,
        sentinel2BarestEarthBareSoilIndex: finiteNumber,
        landsatNdvi2025: finiteNumber,
        lithologyCliffPropensity: finiteNumber,
        steepestWithin300m: nearbyCellSchema.extend({slopeDegrees: finiteNumber}),
      })
      .strict(),
    modelGlobalRankPercentiles: z
      .object({
        noAccess: finiteNumber.min(0).max(1),
        terrainGeology: finiteNumber.min(0).max(1),
        hydrogeomorphic: finiteNumber.min(0).max(1),
        fullContext: finiteNumber.min(0).max(1),
        accessOnly: finiteNumber.min(0).max(1),
        environmentalMedian: finiteNumber.min(0).max(1),
        nearestEnvironmentalTopOnePercent: nearbyCellSchema.extend({
          environmentalMedianRankPercentile: finiteNumber.min(0).max(1),
        }),
      })
      .strict(),
    map: mapPathSchema,
  })
  .strict();

const cathedralReportSchema = z
  .object({
    schemaVersion: z.literal(1),
    reportId: z.literal("cathedral-place-hypotheses-v1-20260814"),
    classification: z.literal("restricted"),
    generatedAtUtc: z.string().min(1).max(80),
    suppliedRumour: z
      .object({
        workingName: z.literal("The Cathedral"),
        coordinateAsSupplied: z.string().min(1).max(80),
        coordinateDatumAssumption: z.string().min(1).max(1_000),
        longitude: finiteNumber,
        latitude: finiteNumber,
        easting: finiteNumber,
        northing: finiteNumber,
        statement: z.string().min(1).max(2_000),
        trainingStatus: z.string().min(1).max(1_000),
      })
      .strict(),
    searchContract: z
      .object({
        radiusMetres: finiteNumber.positive(),
        evaluated90mCells: z.number().int().positive(),
        axisFamilies: z.record(z.string(), z.string().min(1).max(2_000)),
        enumeration: z.string().min(1).max(2_000),
        candidateCount: z.number().int().positive(),
        meaning: z.string().min(1).max(2_000),
      })
      .strict(),
    sourceState: z
      .object({
        imagery: z
          .object({
            service: z.string().url(),
            title: z.string().min(1).max(500),
            year: z.union([z.string(), z.number()]),
            nominalResolutionCentimetres: z.union([z.string(), z.number()]),
            exportSampleMetres: finiteNumber,
            imageSha256: sha256Schema,
            limitation: z.string().min(1).max(2_000),
          })
          .strict(),
        elevation: z
          .object({
            visibleSource: z.string().min(1).max(500),
            nominalResolutionMetres: z.union([z.string(), z.number()]),
            limitation: z.string().min(1).max(2_000),
          })
          .strict(),
        geology: z
          .object({
            unit: z.string().min(1).max(500),
            lithology: z.string().min(1).max(2_000),
            landSystem: z.string().min(1).max(500),
            landSystemConcept: z.string().min(1).max(2_000),
          })
          .strict(),
        gazetteer: z
          .object({
            nearbyCathedralNameCount: z.number().int().nonnegative(),
            interpretation: z.string().min(1).max(2_000),
          })
          .strict(),
      })
      .strict(),
    modelArtifacts: z.record(
      z.string(),
      z.object({path: z.string().min(1).max(1_024), sha256: sha256Schema}).strict(),
    ),
    overviewMap: mapPathSchema,
    hypotheses: z.array(cathedralHypothesisSchema).length(16),
    interpretationGuard: z
      .object({
        authorizesDiscoveryLanguage: z.literal(false),
        authorizesProbabilityLanguage: z.literal(false),
        authorizesFieldAccess: z.literal(false),
        authorizesPublicDisclosure: z.literal(false),
        notes: z.array(z.string().min(1).max(2_000)).min(1).max(32),
      })
      .strict(),
  })
  .strict();

export type CathedralReport = z.infer<typeof cathedralReportSchema>;
export type CathedralHypothesis = z.infer<typeof cathedralHypothesisSchema>;

export type VerifiedCathedralReport = Readonly<{
  report: CathedralReport;
  reportRoot: string;
  manifestSha256: string;
  hashes: ReadonlyMap<string, string>;
}>;

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function requireRegularFile(filename: string): Promise<void> {
  const metadata = await lstat(filename);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error("Cathedral report assets must be non-symlink regular files");
  }
}

function parseSha256Manifest(bytes: Buffer): Map<string, string> {
  const entries = new Map<string, string>();
  for (const line of bytes.toString("utf8").trim().split("\n")) {
    const match = /^([0-9a-f]{64}) {2}([^\r\n]+)$/.exec(line);
    if (!match) throw new Error("Cathedral SHA-256 manifest is malformed");
    const [, hash, filename] = match;
    if (entries.has(filename)) throw new Error("Cathedral SHA-256 manifest has duplicate paths");
    entries.set(filename, hash);
  }
  return entries;
}

async function verifiedBytes(
  reportRoot: string,
  relativePath: string,
  expectedHash: string | undefined,
): Promise<Buffer> {
  if (!expectedHash) throw new Error("Cathedral report asset is not bound by the manifest");
  const filename = path.join(reportRoot, relativePath);
  const resolved = path.resolve(filename);
  if (!resolved.startsWith(`${reportRoot}${path.sep}`)) {
    throw new Error("Cathedral report asset escapes the configured root");
  }
  await requireRegularFile(resolved);
  const bytes = await readFile(resolved);
  if (sha256(bytes) !== expectedHash) throw new Error("Cathedral report asset hash mismatch");
  return bytes;
}

export async function loadCathedralReportFromEnvironment(): Promise<VerifiedCathedralReport> {
  const configuredRoot = process.env.QUINKAN_CATHEDRAL_REPORT_DIR;
  const configuredManifestHash = process.env.QUINKAN_CATHEDRAL_MANIFEST_SHA256;
  if (!configuredRoot || !configuredManifestHash) {
    throw new Error("Cathedral report runtime is not configured");
  }
  const expectedManifestHash = sha256Schema.parse(configuredManifestHash);
  if (!path.isAbsolute(configuredRoot)) throw new Error("Cathedral report root must be absolute");
  const reportRoot = path.resolve(configuredRoot);
  const rootMetadata = await lstat(reportRoot);
  if (!rootMetadata.isDirectory() || rootMetadata.isSymbolicLink()) {
    throw new Error("Cathedral report root must be a non-symlink directory");
  }
  if ((await realpath(reportRoot)) !== reportRoot) {
    throw new Error("Cathedral report root may not contain symlink components");
  }

  const manifestPath = path.join(reportRoot, "SHA256SUMS");
  await requireRegularFile(manifestPath);
  const manifestBytes = await readFile(manifestPath);
  if (sha256(manifestBytes) !== expectedManifestHash) {
    throw new Error("Cathedral SHA-256 manifest does not match the configured release pin");
  }
  const hashes = parseSha256Manifest(manifestBytes);
  const reportBytes = await verifiedBytes(reportRoot, "hypotheses.json", hashes.get("hypotheses.json"));
  const report = cathedralReportSchema.parse(JSON.parse(reportBytes.toString("utf8")));
  if (report.searchContract.candidateCount !== report.hypotheses.length) {
    throw new Error("Cathedral candidate count does not match the hypothesis register");
  }

  const expectedMaps = new Set([report.overviewMap, ...report.hypotheses.map((item) => item.map)]);
  if (expectedMaps.size !== 17) throw new Error("Cathedral map bindings are not unique");
  const observedMaps = (await readdir(path.join(reportRoot, "maps"))).map((name) => `maps/${name}`);
  if (
    observedMaps.length !== expectedMaps.size ||
    observedMaps.some((name) => !expectedMaps.has(name))
  ) {
    throw new Error("Cathedral map directory contains unexpected or missing assets");
  }
  await Promise.all(
    [...expectedMaps].map((mapPath) => verifiedBytes(reportRoot, mapPath, hashes.get(mapPath))),
  );

  return Object.freeze({
    report: Object.freeze(report),
    reportRoot,
    manifestSha256: expectedManifestHash,
    hashes,
  });
}

let configuredReport: Promise<VerifiedCathedralReport> | undefined;

export function loadConfiguredCathedralReport(): Promise<VerifiedCathedralReport> {
  configuredReport ??= loadCathedralReportFromEnvironment();
  return configuredReport;
}

export async function loadConfiguredCathedralImage(filename: string): Promise<Buffer> {
  const release = await loadConfiguredCathedralReport();
  const mapPath = mapPathSchema.parse(`maps/${filename}`);
  const allowed =
    release.report.overviewMap === mapPath ||
    release.report.hypotheses.some((hypothesis) => hypothesis.map === mapPath);
  if (!allowed) throw new Error("Cathedral map is not admitted by the selected report");
  return verifiedBytes(release.reportRoot, mapPath, release.hashes.get(mapPath));
}
