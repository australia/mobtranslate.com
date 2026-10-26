import "server-only";

import {lstat, readFile} from "node:fs/promises";
import path from "node:path";
import {z} from "zod";

const distanceSchema = z.object({
  minimum: z.number().nonnegative(),
  median: z.number().nonnegative(),
  maximum: z.number().nonnegative(),
}).strict();

const analysisSchema = z.object({
  schemaVersion: z.literal(1),
  batchId: z.string().min(1),
  headline: z.string().min(1),
  verdict: z.string().min(1),
  chanceNull: z.object({
    method: z.string().min(1),
    bandCellCount: z.number().int().positive(),
    evaluatedCellCount: z.number().int().positive(),
    bandAreaFractionPercent: z.number().positive(),
    nullMedianNearestMetres: z.number().positive(),
    probabilityWithin: z.record(z.string(), z.number().min(0).max(1)),
  }).strict(),
  observed: z.object({
    pointCount: z.number().int().positive(),
    independentClusterCount: z.number().int().positive(),
    nearestProposalMetres: distanceSchema,
  }).strict(),
  independence: z.object({
    nearestTrainingPositiveMetres: z.object({minimum: z.number(), maximum: z.number()}).strict(),
    nearestOpenReferenceMetres: z.number(),
    proposalBandNearTrainingPercent: z.number(),
    meaning: z.string().min(1),
  }).strict(),
  significance: z.object({
    nominalProbabilityRange: z.tuple([z.number(), z.number()]),
    acrossThreeAlgorithmsRange: z.tuple([z.number(), z.number()]),
    basis: z.string().min(1),
  }).strict(),
  algorithms: z.array(z.object({
    modelId: z.string().min(1),
    title: z.string().min(1),
    observedMedianMetres: z.number().nonnegative(),
    nullMedianMetres: z.number().positive(),
    publishedBandCells: z.number().int().positive(),
    note: z.string().min(1),
  }).strict()).min(1),
  plainLanguage: z.array(z.string().min(1)).min(1),
  artworkAttestation: z.object({
    status: z.literal("present_all"),
    attestedAtUtc: z.string().min(20),
    note: z.string().min(1),
  }).strict().optional(),
}).strict();

export type FieldReportAnalysis = z.infer<typeof analysisSchema>;

const lineageSchema = z.object({
  generatedAtUtc: z.string().min(20),
  question: z.string().min(1),
  note: z.string().min(1).optional(),
  amendment: z.string().min(1).optional(),
  primaries: z.array(z.object({
    model: z.string().min(1),
    bandCells: z.number().int().positive(),
    nearestPerCave: z.array(z.number().nonnegative()).min(1),
    minimum: z.number().nonnegative().optional(),
    median: z.number().nonnegative(),
    maximum: z.number().nonnegative().optional(),
  }).strict()).min(1),
}).strict();

export type PrimaryLineageComparison = z.infer<typeof lineageSchema>;

function resolveResearchRoot(): string {
  return path.resolve(
    process.env.QUINKAN_RESEARCH_ROOT ?? "/mnt/donto-data/donto-resources/research/laura-rock-art-discovery",
  );
}

async function readEvaluationFile(batchId: string, fileName: string): Promise<string | null> {
  if (!/^[a-zA-Z0-9._-]+$/.test(batchId)) return null;
  const candidate = path.join(resolveResearchRoot(), "outputs", "field-evaluation", batchId, fileName);
  try {
    const metadata = await lstat(candidate);
    if (!metadata.isFile() || metadata.isSymbolicLink()) return null;
    return await readFile(candidate, "utf8");
  } catch {
    return null;
  }
}

export async function loadFieldReportAnalysis(batchId: string): Promise<FieldReportAnalysis | null> {
  try {
    const body = await readEvaluationFile(batchId, "analysis-public.json");
    if (body === null) return null;
    const parsed = analysisSchema.parse(JSON.parse(body));
    return parsed.batchId === batchId ? parsed : null;
  } catch {
    return null;
  }
}

export async function loadPrimaryLineageComparison(batchId: string): Promise<PrimaryLineageComparison | null> {
  try {
    const body = await readEvaluationFile(batchId, "primary-lineage-comparison.json");
    if (body === null) return null;
    return lineageSchema.parse(JSON.parse(body));
  } catch {
    return null;
  }
}
