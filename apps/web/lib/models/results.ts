import * as fs from 'fs';
import * as path from 'path';
import type { ModelArtifact, ModelEntry, ModelPredictionSample, ModelRegistry, ModelRelease, ModelReleaseResults, ModelResultMap } from './types';

type EvaluationPrediction = {
  id?: unknown;
  canonical_ref?: unknown;
  direction?: unknown;
  tier?: unknown;
  source_family?: unknown;
  corpus?: unknown;
  input_text?: unknown;
  prediction?: unknown;
  reference?: unknown;
  output_text?: unknown;
};

type EvaluationFile = {
  metrics?: {
    bleu?: unknown;
    chrf?: unknown;
    rows?: unknown;
  };
  predictions?: EvaluationPrediction[];
};

export function modelReleaseKey(modelId: string, version: string): string {
  return `${modelId}::${version}`;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function evaluationArtifacts(release: ModelRelease): ModelArtifact[] {
  return release.artifacts.filter(
    (artifact) =>
      artifact.kind === 'evaluation'
      && artifact.format.toLowerCase() === 'json'
      && artifact.localPath,
  );
}

function resolveArtifactPath(file: string): string {
  return path.isAbsolute(file)
    ? file
    : path.join(/*turbopackIgnore: true*/ process.cwd(), file);
}

function sourceFamily(item: EvaluationPrediction, artifact: ModelArtifact): string | undefined {
  if (typeof item.source_family === 'string' && item.source_family) return item.source_family;
  if (item.corpus && typeof item.corpus === 'object' && 'family' in item.corpus) {
    const family = (item.corpus as { family?: unknown }).family;
    if (typeof family === 'string' && family) return family;
  }
  return artifact.label || undefined;
}

function predictionSample(item: EvaluationPrediction, artifact: ModelArtifact): ModelPredictionSample | null {
  const input = asString(item.input_text);
  const prediction = asString(item.prediction);
  const reference = asString(item.reference || item.output_text);
  if (!input || !prediction || !reference) return null;

  return {
    id: asString(item.id) || `${input.slice(0, 40)}:${prediction.slice(0, 40)}`,
    canonicalRef: asString(item.canonical_ref) || undefined,
    direction: asString(item.direction) || undefined,
    tier: asString(item.tier) || undefined,
    sourceFamily: sourceFamily(item, artifact),
    artifactLabel: artifact.label,
    input,
    prediction,
    reference,
  };
}

function loadReleaseResults(release: ModelRelease, sampleLimit: number): ModelReleaseResults | null {
  const artifacts = evaluationArtifacts(release);
  if (artifacts.length === 0) return null;

  const perArtifactLimit = Math.max(2, Math.ceil(sampleLimit / artifacts.length));
  const samples: ModelPredictionSample[] = [];
  const artifactPaths: string[] = [];
  const sourceLabels = new Set<string>();
  let primaryBleu: number | undefined;
  let primaryChrf: number | undefined;
  let totalRows = 0;

  for (const artifact of artifacts) {
    const file = artifact.localPath;
    if (!file) continue;

    const resolved = resolveArtifactPath(file);
    if (!fs.existsSync(resolved)) continue;

    artifactPaths.push(resolved);
    const parsed = JSON.parse(fs.readFileSync(resolved, 'utf8')) as EvaluationFile;
    const parsedBleu = asNumber(parsed.metrics?.bleu);
    const parsedChrf = asNumber(parsed.metrics?.chrf);
    if (primaryBleu == null) primaryBleu = parsedBleu;
    if (primaryChrf == null) primaryChrf = parsedChrf;
    totalRows += asNumber(parsed.metrics?.rows) ?? parsed.predictions?.length ?? 0;

    const seen = new Set<string>();
    let artifactSamples = 0;

    for (const item of parsed.predictions ?? []) {
      const sample = predictionSample(item, artifact);
      if (!sample) continue;

      const dedupeKey = sample.canonicalRef || sample.input;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      if (sample.sourceFamily) sourceLabels.add(sample.sourceFamily);
      samples.push(sample);
      artifactSamples += 1;

      if (artifactSamples >= perArtifactLimit) break;
    }
  }

  if (artifactPaths.length === 0) return null;

  return {
    artifactPath: artifactPaths[0],
    artifactPaths,
    metrics: {
      bleu: primaryBleu,
      chrf: primaryChrf,
      rows: totalRows || undefined,
    },
    sourceLabels: Array.from(sourceLabels),
    samples,
  };
}

function addModelResults(results: ModelResultMap, model: ModelEntry, sampleLimit: number) {
  for (const release of model.releases) {
    const releaseResults = loadReleaseResults(release, sampleLimit);
    if (releaseResults) {
      results[modelReleaseKey(model.id, release.version)] = releaseResults;
    }
  }
}

export function loadModelResultSamples(registry: ModelRegistry, sampleLimit = 6): ModelResultMap {
  const results: ModelResultMap = {};
  for (const model of registry.models) {
    addModelResults(results, model, sampleLimit);
  }
  return results;
}
