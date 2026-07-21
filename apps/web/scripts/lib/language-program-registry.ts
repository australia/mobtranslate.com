import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { load as loadYaml } from 'js-yaml';
import { z } from 'zod';

export const stageKeys = [
  'identity',
  'source_archive',
  'dictionary',
  'grammar',
  'natural_corpus',
  'benchmarks',
  'gap_analysis',
  'synthetic_corpus',
  'translation_model',
  'asr',
  'tts',
  'release',
] as const;

export const StageKeySchema = z.enum(stageKeys);
export const StageStatusSchema = z.enum([
  'not_started',
  'in_progress',
  'pass',
  'fail',
  'blocked',
  'not_applicable',
  'superseded',
]);

const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const JsonObjectSchema = z.record(z.string(), z.unknown());
const NullableStringSchema = z.string().nullable().optional();

export const CharterSchema = z
  .object({
    schema_version: z.literal(1),
    program_id: z.string().min(1),
    program_version: z.number().int().positive(),
    language: z
      .object({
        primary_name: z.string().min(1),
        mobtranslate_code: z.string().min(1),
        endonyms: z.array(z.string()).default([]),
        aliases: z.array(z.string()).default([]),
        iso_639_3: z.string().length(3),
        glottocode: z.string().min(1),
        family: z.string().nullable(),
      })
      .passthrough(),
    scope: z
      .object({
        included_varieties: z
          .array(
            z
              .object({
                id: z.string().min(1),
                role: z.string().min(1),
              })
              .passthrough(),
          )
          .min(1),
      })
      .passthrough(),
    orthographies: z
      .array(
        z
          .object({
            id: z.string().min(1),
            status: z.string().min(1),
          })
          .passthrough(),
      )
      .min(1),
    directions: z
      .object({
        translation: z
          .array(
            z
              .object({ id: z.string().min(1), status: z.string().min(1) })
              .passthrough(),
          )
          .min(1),
      })
      .passthrough(),
    model_claim_target: z.enum([
      'inventory_only',
      'research_only',
      'limited_public',
      'production',
    ]),
    model_contract: z
      .object({
        source_language_token: z.string().min(1),
        target_language_token: z.string().min(1),
      })
      .passthrough(),
  })
  .passthrough();

export const ProgramStateSchema = z
  .object({
    schema_version: z.literal(1),
    program_id: z.string().min(1),
    language_slug: z.string().min(1),
    updated_at_utc: z.string().min(1),
    stages: z.record(StageKeySchema, StageStatusSchema),
    stage_evidence: z.record(z.string(), z.string().min(1)).default({}),
    current_stage: StageKeySchema,
    next_action: z.string().min(1),
    blocking_conditions: z.array(z.string()),
    paid_gpu_authorized: z.boolean(),
    public_release_authorized: z.boolean(),
  })
  .passthrough();

export const SourceSchema = z
  .object({
    source_id: z.string().min(1),
    title: z.string().min(1),
    source_type: z.string().min(1),
    url: NullableStringSchema,
    catalog_id: NullableStringSchema,
    local_path: NullableStringSchema,
    sha256: Sha256Schema.nullable().optional(),
    license: z.string().min(1),
    training_use: z.enum(['unknown', 'allowed', 'not_allowed', 'needs_review']),
    redistribution: z.enum([
      'unknown',
      'allowed',
      'not_allowed',
      'needs_review',
    ]),
    derived_weights: z.enum([
      'unknown',
      'allowed',
      'not_allowed',
      'needs_review',
    ]),
    hosted_transfer: z.enum([
      'unknown',
      'allowed',
      'not_allowed',
      'needs_review',
    ]),
    varieties: z.array(z.string()).default([]),
    orthographies: z.array(z.string()).default([]),
    contains_translation: z.boolean(),
    contains_igt: z.boolean(),
    contains_audio: z.boolean(),
    quality_notes: z.array(z.string()).default([]),
    acquisition_notes: z.array(z.string()).default([]),
    retrieved_at_utc: NullableStringSchema,
  })
  .passthrough();

export const ArtifactSchema = z.object({
  artifact_key: z.string().min(1),
  stage_key: StageKeySchema,
  source_key: z.string().min(1).nullable().optional(),
  artifact_kind: z.string().min(1),
  path: z.string().min(1),
  media_type: z.string().min(1).nullable().optional(),
  sha256: Sha256Schema,
  row_count: z.number().int().nonnegative().nullable().optional(),
  status: z.enum([
    'registered',
    'verified',
    'superseded',
    'deleted_after_evaluation',
    'withdrawn',
  ]),
  immutable: z.boolean().default(true),
  generated_by: z.string().nullable().optional(),
  metadata: JsonObjectSchema.default({}),
});

export const ChecklistStateSchema = z.object({
  schema_version: z.literal(1),
  program_id: z.string().min(1),
  updated_at_utc: z.string().min(1),
  items: z
    .array(
      z.object({
        item_key: z.string().regex(/^[a-z][a-z0-9_]*\.[a-z0-9_.]+$/),
        status: StageStatusSchema,
        evidence_note: z.string().nullable().optional(),
        evidence_artifact_keys: z.array(z.string()).default([]),
        blocker: z.string().nullable().optional(),
      }),
    )
    .superRefine((items, context) => {
      const seen = new Set<string>();
      for (const [index, item] of items.entries()) {
        if (seen.has(item.item_key)) {
          context.addIssue({
            code: 'custom',
            path: [index, 'item_key'],
            message: `duplicate item ${item.item_key}`,
          });
        }
        seen.add(item.item_key);
        if (item.status === 'pass' && !item.evidence_note?.trim()) {
          context.addIssue({
            code: 'custom',
            path: [index, 'evidence_note'],
            message: 'passing item requires evidence_note',
          });
        }
        if (item.status === 'blocked' && !item.blocker?.trim()) {
          context.addIssue({
            code: 'custom',
            path: [index, 'blocker'],
            message: 'blocked item requires blocker',
          });
        }
      }
    }),
});

export const CorpusRequirementSchema = z.object({
  requirement_key: z.string().min(1),
  capability: z.enum([
    'dictionary',
    'lexical_reconstruction',
    'morphology',
    'glossary_uptake',
    'sentence_translation',
    'degeneration',
    'asr',
    'tts',
  ]),
  evidence_unit: z.string().min(1),
  feature_key: z.string().min(1),
  feature_value: z.string().nullable().optional(),
  priority: z.number().int().min(1).max(5),
  target_count: z.number().int().nonnegative().nullable().optional(),
  observed_count: z.number().int().nonnegative(),
  status: z.enum([
    'identified',
    'collecting',
    'met',
    'blocked',
    'waived',
    'superseded',
  ]),
  evidence_policy: z.string().min(1),
  generation_policy: z.string().min(1),
  rationale: z.string().min(1),
  measurement_artifact_key: z.string().nullable().optional(),
  metadata: JsonObjectSchema.default({}),
});

export const BenchmarkSuiteSchema = z.object({
  suite_key: z.string().min(1),
  capability: z.enum([
    'dictionary_router',
    'lexical_reconstruction',
    'contextual_acquisition',
    'morphology',
    'glossary_uptake',
    'sentence_translation',
    'degeneration',
    'decoder_damage',
    'asr',
    'tts',
  ]),
  role: z.enum(['development', 'regression', 'sealed_final', 'operational']),
  sampling_unit: z.string().min(1),
  artifact_key: z.string().min(1),
  sealed: z.boolean(),
  status: z.enum(['draft', 'active', 'opened', 'superseded', 'withdrawn']),
  metric_contract: JsonObjectSchema,
  claim_limit: z.string().min(1),
});

export const ExperimentSchema = z.object({
  experiment_key: z.string().min(1),
  title: z.string().min(1),
  hypothesis: z.string().min(1),
  controlled_variable: z.string().min(1),
  base_contract: JsonObjectSchema.default({}),
  status: z.enum([
    'planned',
    'preregistered',
    'running',
    'evaluated',
    'promoted',
    'failed',
    'stopped',
    'superseded',
  ]),
  planned_max_steps: z.number().int().positive().nullable().optional(),
  observed_global_step: z.number().int().nonnegative().nullable().optional(),
  seeds: z.array(z.number().int()).default([]),
  token_accounting: JsonObjectSchema.default({}),
  paid_compute_authorized: z.boolean(),
  provider_run_id: z.string().nullable().optional(),
  preregistration_artifact_key: z.string().nullable().optional(),
  run_contract_artifact_key: z.string().nullable().optional(),
  outcome_summary: z.string().nullable().optional(),
  started_at: z.string().nullable().optional(),
  completed_at: z.string().nullable().optional(),
});

export const ModelSchema = z.object({
  model_key: z.string().min(1),
  version: z.string().min(1),
  architecture: z.string().min(1),
  base_model_id: z.string().nullable().optional(),
  base_revision: z.string().nullable().optional(),
  base_sha256: Sha256Schema.nullable().optional(),
  tokenizer_sha256: Sha256Schema.nullable().optional(),
  adapter_sha256: Sha256Schema.nullable().optional(),
  merged_weights_sha256: Sha256Schema.nullable().optional(),
  task_contract: JsonObjectSchema.default({}),
  decoder_policy: JsonObjectSchema.default({}),
  resource_profile: JsonObjectSchema.default({}),
  produced_by_experiment_key: z.string().nullable().optional(),
  huggingface_repo: z.string().nullable().optional(),
  status: z.enum([
    'candidate',
    'negative_result',
    'research_release',
    'mounted',
    'unmounted',
    'withdrawn',
    'deleted_after_evaluation',
  ]),
  lexical_gate_status: z.enum([
    'not_evaluated',
    'pass',
    'fail',
    'not_applicable',
  ]),
  sentence_gate_status: z.enum([
    'not_evaluated',
    'pass',
    'fail',
    'not_applicable',
  ]),
  asr_gate_status: z.enum(['not_evaluated', 'pass', 'fail', 'not_applicable']),
  tts_gate_status: z.enum(['not_evaluated', 'pass', 'fail', 'not_applicable']),
});

export const BenchmarkRunSchema = z
  .object({
    run_key: z.string().min(1),
    suite_key: z.string().min(1),
    model_key: z.string().nullable().optional(),
    model_version: z.string().nullable().optional(),
    experiment_key: z.string().nullable().optional(),
    seed: z.number().int().nullable().optional(),
    decoder_policy_sha256: Sha256Schema.nullable().optional(),
    prediction_artifact_key: z.string().nullable().optional(),
    metrics: JsonObjectSchema,
    gate_status: z.enum(['not_applicable', 'pass', 'fail', 'exploratory']),
    duration_seconds: z.number().nonnegative().nullable().optional(),
    executed_at: z.string().min(1),
  })
  .refine((row) => Boolean(row.model_key || row.experiment_key), {
    message: 'benchmark run requires model_key or experiment_key',
  });

type Infer<T extends z.ZodType> = z.infer<T>;
export type Artifact = Infer<typeof ArtifactSchema> & {
  absolutePath: string;
  byteCount: number;
};

export interface ProgramBundle {
  root: string;
  charter: Infer<typeof CharterSchema>;
  state: Infer<typeof ProgramStateSchema>;
  sources: Infer<typeof SourceSchema>[];
  artifacts: Artifact[];
  checklist: Infer<typeof ChecklistStateSchema>;
  requirements: Infer<typeof CorpusRequirementSchema>[];
  benchmarkSuites: Infer<typeof BenchmarkSuiteSchema>[];
  experiments: Infer<typeof ExperimentSchema>[];
  models: Infer<typeof ModelSchema>[];
  benchmarkRuns: Infer<typeof BenchmarkRunSchema>[];
  fileHashes: Record<string, string>;
}

export type ArtifactIdentity = {
  sha256: string | null;
  relativePath: string | null;
  externalUri: string | null;
  immutable: boolean;
};

export function assertArtifactUpdateAllowed(
  artifactKey: string,
  existing: ArtifactIdentity,
  incoming: ArtifactIdentity,
): void {
  if (
    existing.relativePath !== incoming.relativePath ||
    existing.externalUri !== incoming.externalUri
  ) {
    throw new Error(
      `artifact location changed for ${artifactKey}; create a new artifact key`,
    );
  }
  if (existing.immutable !== incoming.immutable) {
    throw new Error(
      `artifact mutability changed for ${artifactKey}; use a migration or create a new artifact key`,
    );
  }
  if (existing.immutable && existing.sha256 !== incoming.sha256) {
    throw new Error(
      `immutable artifact identity changed for ${artifactKey}; create a new artifact key`,
    );
  }
}

export function sha256File(filePath: string): string {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function parseJson<T extends z.ZodType>(
  filePath: string,
  schema: T,
): z.infer<T> {
  return schema.parse(JSON.parse(readFileSync(filePath, 'utf8')));
}

function parseJsonl<T extends z.ZodType>(
  filePath: string,
  schema: T,
): z.infer<T>[] {
  if (!existsSync(filePath)) return [];
  return readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line, index) => {
      try {
        return schema.parse(JSON.parse(line));
      } catch (error) {
        throw new Error(`${filePath}:${index + 1}: ${String(error)}`);
      }
    });
}

function ensureUnique<T>(
  rows: T[],
  key: (row: T) => string,
  label: string,
): void {
  const seen = new Set<string>();
  for (const row of rows) {
    const value = key(row);
    if (seen.has(value)) throw new Error(`duplicate ${label}: ${value}`);
    seen.add(value);
  }
}

function countJsonlRows(filePath: string): number {
  return readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim()).length;
}

export function resolveProgramArtifact(
  root: string,
  artifactPath: string,
): string {
  if (path.isAbsolute(artifactPath)) return path.normalize(artifactPath);
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, artifactPath);
  if (
    resolved !== resolvedRoot &&
    !resolved.startsWith(`${resolvedRoot}${path.sep}`)
  ) {
    throw new Error(`artifact path escapes program root: ${artifactPath}`);
  }
  return resolved;
}

export function loadProgramBundle(programRoot: string): ProgramBundle {
  const root = path.resolve(programRoot);
  const paths = {
    charter: path.join(root, 'LANGUAGE-CHARTER.yaml'),
    state: path.join(root, 'PROGRAM-STATE.json'),
    sources: path.join(root, 'sources/SOURCE-LEDGER.jsonl'),
    artifacts: path.join(root, 'ARTIFACT-LEDGER.jsonl'),
    checklist: path.join(root, 'CHECKLIST-STATE.json'),
    requirements: path.join(
      root,
      'analysis/corpus-requirements/requirements.jsonl',
    ),
    benchmarkSuites: path.join(root, 'benchmarks/BENCHMARK-SUITES.jsonl'),
    experiments: path.join(root, 'experiments/EXPERIMENT-REGISTRY.jsonl'),
    models: path.join(root, 'models/MODEL-REGISTRY.jsonl'),
    benchmarkRuns: path.join(root, 'benchmarks/BENCHMARK-RUNS.jsonl'),
  };
  for (const required of [
    'charter',
    'state',
    'sources',
    'artifacts',
    'checklist',
  ] as const) {
    if (!existsSync(paths[required]))
      throw new Error(`missing required program file: ${paths[required]}`);
  }

  const charter = CharterSchema.parse(
    loadYaml(readFileSync(paths.charter, 'utf8')),
  );
  const state = parseJson(paths.state, ProgramStateSchema);
  const sources = parseJsonl(paths.sources, SourceSchema);
  const artifactRows = parseJsonl(paths.artifacts, ArtifactSchema);
  const checklist = parseJson(paths.checklist, ChecklistStateSchema);
  const requirements = parseJsonl(paths.requirements, CorpusRequirementSchema);
  const benchmarkSuites = parseJsonl(
    paths.benchmarkSuites,
    BenchmarkSuiteSchema,
  );
  const experiments = parseJsonl(paths.experiments, ExperimentSchema);
  const models = parseJsonl(paths.models, ModelSchema);
  const benchmarkRuns = parseJsonl(paths.benchmarkRuns, BenchmarkRunSchema);

  if (
    charter.program_id !== state.program_id ||
    charter.program_id !== checklist.program_id
  ) {
    throw new Error('program_id differs between charter, state, and checklist');
  }
  for (const stage of stageKeys) {
    if (!(stage in state.stages))
      throw new Error(`PROGRAM-STATE missing stage: ${stage}`);
  }

  ensureUnique(sources, (row) => row.source_id, 'source_id');
  ensureUnique(artifactRows, (row) => row.artifact_key, 'artifact_key');
  ensureUnique(requirements, (row) => row.requirement_key, 'requirement_key');
  ensureUnique(benchmarkSuites, (row) => row.suite_key, 'suite_key');
  ensureUnique(experiments, (row) => row.experiment_key, 'experiment_key');
  ensureUnique(
    models,
    (row) => `${row.model_key}\0${row.version}`,
    'model identity',
  );
  ensureUnique(benchmarkRuns, (row) => row.run_key, 'benchmark run_key');

  const sourceKeys = new Set(sources.map((row) => row.source_id));
  const artifacts: Artifact[] = artifactRows.map((artifact) => {
    if (artifact.source_key && !sourceKeys.has(artifact.source_key)) {
      throw new Error(
        `artifact ${artifact.artifact_key} references unknown source ${artifact.source_key}`,
      );
    }
    const absolutePath = resolveProgramArtifact(root, artifact.path);
    if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) {
      throw new Error(
        `artifact is not a file: ${artifact.artifact_key} -> ${absolutePath}`,
      );
    }
    const actualHash = sha256File(absolutePath);
    if (actualHash !== artifact.sha256) {
      throw new Error(
        `artifact hash mismatch for ${artifact.artifact_key}: ${artifact.sha256} != ${actualHash}`,
      );
    }
    if (artifact.row_count != null && absolutePath.endsWith('.jsonl')) {
      const actualRows = countJsonlRows(absolutePath);
      if (actualRows !== artifact.row_count) {
        throw new Error(
          `artifact row count mismatch for ${artifact.artifact_key}: ${artifact.row_count} != ${actualRows}`,
        );
      }
    }
    return {
      ...artifact,
      absolutePath,
      byteCount: statSync(absolutePath).size,
    };
  });

  const artifactKeys = new Set(artifacts.map((row) => row.artifact_key));
  for (const item of checklist.items) {
    for (const artifactKey of item.evidence_artifact_keys) {
      if (!artifactKeys.has(artifactKey)) {
        throw new Error(
          `checklist ${item.item_key} references unknown artifact ${artifactKey}`,
        );
      }
    }
  }
  for (const requirement of requirements) {
    if (
      requirement.measurement_artifact_key &&
      !artifactKeys.has(requirement.measurement_artifact_key)
    ) {
      throw new Error(
        `requirement ${requirement.requirement_key} references unknown artifact`,
      );
    }
  }
  for (const suite of benchmarkSuites) {
    if (!artifactKeys.has(suite.artifact_key))
      throw new Error(`suite ${suite.suite_key} references unknown artifact`);
  }

  const fileHashes = Object.fromEntries(
    Object.entries(paths)
      .filter(([, filePath]) => existsSync(filePath))
      .map(([key, filePath]) => [key, sha256File(filePath)]),
  );
  return {
    root,
    charter,
    state,
    sources,
    artifacts,
    checklist,
    requirements,
    benchmarkSuites,
    experiments,
    models,
    benchmarkRuns,
    fileHashes,
  };
}

export function summarizeProgramBundle(bundle: ProgramBundle) {
  return {
    programId: bundle.charter.program_id,
    stages: Object.keys(bundle.state.stages).length,
    checklistOverrides: bundle.checklist.items.length,
    passingChecklistItems: bundle.checklist.items.filter(
      (item) => item.status === 'pass',
    ).length,
    sources: bundle.sources.length,
    verifiedArtifacts: bundle.artifacts.filter(
      (artifact) => artifact.status === 'verified',
    ).length,
    corpusRequirements: bundle.requirements.length,
    benchmarkSuites: bundle.benchmarkSuites.length,
    experiments: bundle.experiments.length,
    models: bundle.models.length,
    benchmarkRuns: bundle.benchmarkRuns.length,
    paidGpuAuthorized: bundle.state.paid_gpu_authorized,
    publicReleaseAuthorized: bundle.state.public_release_authorized,
  };
}
