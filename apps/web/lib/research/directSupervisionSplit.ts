import { createHash } from 'node:crypto';
import { z } from 'zod';

const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/u);

const ArtifactReferenceSchema = z.object({
  path: z.string().min(1),
  sha256: Sha256Schema,
  rows: z.number().int().nonnegative().optional(),
});

export const DirectSupervisionCandidateSchema = z.object({
  schemaVersion: z.literal(1),
  reviewId: z.string().min(1),
  datasetRecordId: z.string().min(1),
  sourceRecordId: z.string().min(1),
  sourceOrdinal: z.number().int().positive(),
  taskType: z.enum(['lexical_reconstruction', 'fixed_utterance_translation']),
  taskToken: z.enum(['<lexeme>', '<translate>']),
  inputText: z.string().min(1),
  targetText: z.string().min(1),
  sourceId: z.string().min(1),
  speakerSource: z.string().min(1),
  license: z.string().min(1),
  commercialUse: z.literal('not_allowed'),
  attributionRequired: z.literal(true),
  splitAssignment: z.literal('unassigned'),
  trainingStatus: z.literal('eligible_after_split_assignment'),
  benchmarkIndependence: z.literal('not_independent_if_in_training'),
  synthetic: z.literal(false),
  linguisticEvidenceRole: z.literal('direct_source_pair'),
  audioAssetIds: z.array(z.string().min(1)),
  leakageGroupId: z.string().min(1).optional(),
});

export const DirectSupervisionSplitContractSchema = z.object({
  schema_version: z.literal(1),
  split_contract_id: z.string().min(1),
  created_at_utc: z.string().datetime(),
  output_root: z.string().min(1),
  language: z.object({
    name: z.string().min(1),
    code: z.string().min(1),
    source_language_token: z.string().min(1),
    target_language_token: z.string().min(1),
    direction: z.string().min(1),
  }),
  inputs: z.object({
    candidates: ArtifactReferenceSchema.extend({
      rows: z.number().int().positive(),
    }),
    task_review: ArtifactReferenceSchema,
    rights_review: ArtifactReferenceSchema,
    dictionary_edition: ArtifactReferenceSchema,
    grammar_edition: ArtifactReferenceSchema,
    source_ledger_snapshot: ArtifactReferenceSchema.extend({
      rows: z.number().int().positive(),
    }),
  }),
  source_clusters: z
    .array(
      z.object({
        cluster_id: z.string().min(1),
        source_id: z.string().min(1),
        speaker_source: z.string().min(1),
        assignment: z.enum(['train', 'development', 'final_test']),
        expected_rows: z.number().int().positive(),
        rationale: z.string().min(1),
      }),
    )
    .min(1),
  policies: z.object({
    cluster_atomicity: z.literal('source_and_speaker_cluster_is_atomic'),
    independent_evaluation: z.literal(
      'no_training_row_can_be_claimed_as_independent_evaluation',
    ),
    training_reconstruction: z.literal(
      'allowed_only_as_explicitly_non_independent_diagnostic',
    ),
    evaluation_leakage_groups: z.literal(
      'required_for_development_and_final_test_rows',
    ),
    synthetic_data: z.literal('excluded'),
    program_training_gate: z.literal(
      'closed_pending_zero_step_census_and_failure_analysis',
    ),
  }),
  expected_counts: z.object({
    candidate_rows: z.number().int().positive(),
    train_rows: z.number().int().nonnegative(),
    development_rows: z.number().int().nonnegative(),
    final_test_rows: z.number().int().nonnegative(),
    lexical_rows: z.number().int().nonnegative(),
    fixed_utterance_rows: z.number().int().nonnegative(),
    training_reconstruction_diagnostic_rows: z.number().int().nonnegative(),
    trainer_ready_rows: z.literal(0),
    synthetic_rows: z.literal(0),
  }),
  claim_limit: z.string().min(1),
});

export type DirectSupervisionCandidate = z.infer<
  typeof DirectSupervisionCandidateSchema
>;
export type DirectSupervisionSplitContract = z.infer<
  typeof DirectSupervisionSplitContractSchema
>;

export interface DirectSupervisionDatasetRow {
  schema_version: 1;
  id: string;
  direction: string;
  source_lang: string;
  target_lang: string;
  input_text: string;
  unconditioned_input_text: string;
  output_text: string;
  split:
    | 'train'
    | 'development'
    | 'final_test'
    | 'training_reconstruction_diagnostic';
  task_family: 'lexeme' | 'sentence';
  pair_kind: 'attested_dictionary_lexeme' | 'attested_fixed_utterance';
  source_cluster_id: string;
  source_id: string;
  source_record_id: string;
  source_ordinal: number;
  speaker_source: string;
  review_id: string;
  split_contract_id: string;
  dictionary_edition_sha256: string;
  grammar_edition_sha256: string;
  rights_review_sha256: string;
  license: string;
  commercial_use: 'not_allowed';
  attribution_required: true;
  task_eligibility: 'eligible_noncommercial';
  program_training_gate:
    | 'closed_pending_zero_step_census_and_failure_analysis'
    | 'not_applicable_held_out';
  trainer_inclusion_status:
    | 'blocked_pending_program_training_gate'
    | 'excluded_from_training';
  benchmark_independence:
    | 'not_independent_training_reconstruction_only'
    | 'source_cluster_and_leakage_group_held_out';
  evaluation_role:
    | 'not_an_independent_evaluation_row'
    | 'development'
    | 'final_test'
    | 'training_reconstruction_diagnostic_only';
  leakage_group_id: string | null;
  synthetic: false;
  linguistic_evidence_role: 'direct_source_pair';
  audio_asset_ids: string[];
}

export interface DirectSupervisionSplitResult {
  trainRows: DirectSupervisionDatasetRow[];
  developmentRows: DirectSupervisionDatasetRow[];
  finalTestRows: DirectSupervisionDatasetRow[];
  trainingReconstructionDiagnosticRows: DirectSupervisionDatasetRow[];
  report: {
    candidateRows: number;
    trainRows: number;
    developmentRows: number;
    finalTestRows: number;
    lexicalRows: number;
    fixedUtteranceRows: number;
    trainingReconstructionDiagnosticRows: number;
    trainerReadyRows: 0;
    syntheticRows: 0;
    sourceClusters: number;
  };
}

function normalized(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase('en')
    .replace(/\s+/gu, ' ');
}

function clusterKey(sourceId: string, speakerSource: string): string {
  return `${normalized(sourceId)}\u0000${normalized(speakerSource)}`;
}

function unconditionedInput(candidate: DirectSupervisionCandidate): string {
  const prefix = `${candidate.taskToken} `;
  if (!candidate.inputText.startsWith(prefix)) {
    throw new Error(
      `input does not begin with declared task token for ${candidate.datasetRecordId}`,
    );
  }
  const value = candidate.inputText.slice(prefix.length).trim();
  if (!value) {
    throw new Error(
      `empty unconditioned input for ${candidate.datasetRecordId}`,
    );
  }
  return value;
}

function stableRowId(
  contractId: string,
  datasetRecordId: string,
  role: string,
): string {
  const digest = createHash('sha256')
    .update(`${contractId}\u0000${datasetRecordId}\u0000${role}`)
    .digest('hex')
    .slice(0, 24);
  return `${contractId}:${role}:${digest}`;
}

function compareCandidates(
  left: DirectSupervisionCandidate,
  right: DirectSupervisionCandidate,
): number {
  return (
    left.sourceId.localeCompare(right.sourceId, 'en') ||
    left.speakerSource.localeCompare(right.speakerSource, 'en') ||
    left.sourceOrdinal - right.sourceOrdinal ||
    left.datasetRecordId.localeCompare(right.datasetRecordId, 'en')
  );
}

export function buildDirectSupervisionSplit(
  rawContract: unknown,
  rawCandidates: unknown[],
): DirectSupervisionSplitResult {
  const contract = DirectSupervisionSplitContractSchema.parse(rawContract);
  const candidates = rawCandidates.map((row) =>
    DirectSupervisionCandidateSchema.parse(row),
  );

  if (candidates.length !== contract.expected_counts.candidate_rows) {
    throw new Error(
      `candidate row count mismatch: ${candidates.length} != ${contract.expected_counts.candidate_rows}`,
    );
  }
  if (candidates.length !== contract.inputs.candidates.rows) {
    throw new Error(
      `candidate input row count mismatch: ${candidates.length} != ${contract.inputs.candidates.rows}`,
    );
  }

  const candidateIds = new Set<string>();
  const sourceRecordIds = new Set<string>();
  for (const candidate of candidates) {
    if (candidateIds.has(candidate.datasetRecordId)) {
      throw new Error(`duplicate dataset record: ${candidate.datasetRecordId}`);
    }
    if (sourceRecordIds.has(candidate.sourceRecordId)) {
      throw new Error(`duplicate source record: ${candidate.sourceRecordId}`);
    }
    const expectedTaskToken =
      candidate.taskType === 'lexical_reconstruction'
        ? '<lexeme>'
        : '<translate>';
    if (candidate.taskToken !== expectedTaskToken) {
      throw new Error(
        `task token does not match task type for ${candidate.datasetRecordId}: ${candidate.taskToken} != ${expectedTaskToken}`,
      );
    }
    candidateIds.add(candidate.datasetRecordId);
    sourceRecordIds.add(candidate.sourceRecordId);
  }

  const clusters = new Map<
    string,
    DirectSupervisionSplitContract['source_clusters'][number]
  >();
  const clusterIds = new Set<string>();
  for (const cluster of contract.source_clusters) {
    const key = clusterKey(cluster.source_id, cluster.speaker_source);
    if (clusters.has(key)) {
      throw new Error(
        `source/speaker cluster has multiple assignments: ${cluster.source_id} / ${cluster.speaker_source}`,
      );
    }
    if (clusterIds.has(cluster.cluster_id)) {
      throw new Error(`duplicate cluster id: ${cluster.cluster_id}`);
    }
    clusters.set(key, cluster);
    clusterIds.add(cluster.cluster_id);
  }

  const rowsByAssignment = {
    train: [] as DirectSupervisionDatasetRow[],
    development: [] as DirectSupervisionDatasetRow[],
    final_test: [] as DirectSupervisionDatasetRow[],
  };
  const clusterCounts = new Map<string, number>();

  for (const candidate of [...candidates].sort(compareCandidates)) {
    const cluster = clusters.get(
      clusterKey(candidate.sourceId, candidate.speakerSource),
    );
    if (!cluster) {
      throw new Error(
        `candidate has no source-cluster assignment: ${candidate.datasetRecordId}`,
      );
    }
    if (cluster.assignment !== 'train' && !candidate.leakageGroupId) {
      throw new Error(
        `held-out candidate lacks leakage group: ${candidate.datasetRecordId}`,
      );
    }
    clusterCounts.set(
      cluster.cluster_id,
      (clusterCounts.get(cluster.cluster_id) ?? 0) + 1,
    );

    const heldOut = cluster.assignment !== 'train';
    const row: DirectSupervisionDatasetRow = {
      schema_version: 1,
      id: stableRowId(
        contract.split_contract_id,
        candidate.datasetRecordId,
        cluster.assignment,
      ),
      direction: contract.language.direction,
      source_lang: contract.language.source_language_token,
      target_lang: contract.language.target_language_token,
      input_text: candidate.inputText,
      unconditioned_input_text: unconditionedInput(candidate),
      output_text: candidate.targetText,
      split: cluster.assignment,
      task_family:
        candidate.taskType === 'lexical_reconstruction' ? 'lexeme' : 'sentence',
      pair_kind:
        candidate.taskType === 'lexical_reconstruction'
          ? 'attested_dictionary_lexeme'
          : 'attested_fixed_utterance',
      source_cluster_id: cluster.cluster_id,
      source_id: candidate.sourceId,
      source_record_id: candidate.sourceRecordId,
      source_ordinal: candidate.sourceOrdinal,
      speaker_source: candidate.speakerSource,
      review_id: candidate.reviewId,
      split_contract_id: contract.split_contract_id,
      dictionary_edition_sha256: contract.inputs.dictionary_edition.sha256,
      grammar_edition_sha256: contract.inputs.grammar_edition.sha256,
      rights_review_sha256: contract.inputs.rights_review.sha256,
      license: candidate.license,
      commercial_use: candidate.commercialUse,
      attribution_required: candidate.attributionRequired,
      task_eligibility: 'eligible_noncommercial',
      program_training_gate: heldOut
        ? 'not_applicable_held_out'
        : contract.policies.program_training_gate,
      trainer_inclusion_status: heldOut
        ? 'excluded_from_training'
        : 'blocked_pending_program_training_gate',
      benchmark_independence: heldOut
        ? 'source_cluster_and_leakage_group_held_out'
        : 'not_independent_training_reconstruction_only',
      evaluation_role:
        cluster.assignment === 'development'
          ? 'development'
          : cluster.assignment === 'final_test'
            ? 'final_test'
            : 'not_an_independent_evaluation_row',
      leakage_group_id: candidate.leakageGroupId ?? null,
      synthetic: false,
      linguistic_evidence_role: candidate.linguisticEvidenceRole,
      audio_asset_ids: [...candidate.audioAssetIds],
    };
    rowsByAssignment[cluster.assignment].push(row);
  }

  for (const cluster of contract.source_clusters) {
    const actual = clusterCounts.get(cluster.cluster_id) ?? 0;
    if (actual !== cluster.expected_rows) {
      throw new Error(
        `cluster row count mismatch for ${cluster.cluster_id}: ${actual} != ${cluster.expected_rows}`,
      );
    }
  }

  const leakageGroupAssignments = new Map<string, string>();
  for (const row of [
    ...rowsByAssignment.train,
    ...rowsByAssignment.development,
    ...rowsByAssignment.final_test,
  ]) {
    if (!row.leakage_group_id) continue;
    const existingAssignment = leakageGroupAssignments.get(
      row.leakage_group_id,
    );
    if (existingAssignment && existingAssignment !== row.split) {
      throw new Error(
        `leakage group crosses split boundary: ${row.leakage_group_id} (${existingAssignment} / ${row.split})`,
      );
    }
    leakageGroupAssignments.set(row.leakage_group_id, row.split);
  }

  const trainingReconstructionDiagnosticRows = rowsByAssignment.train.map(
    (row) => ({
      ...row,
      id: stableRowId(
        contract.split_contract_id,
        row.source_record_id,
        'training_reconstruction_diagnostic',
      ),
      split: 'training_reconstruction_diagnostic' as const,
      trainer_inclusion_status: 'excluded_from_training' as const,
      evaluation_role: 'training_reconstruction_diagnostic_only' as const,
    }),
  );

  const lexicalRows = candidates.filter(
    (row) => row.taskType === 'lexical_reconstruction',
  ).length;
  const fixedUtteranceRows = candidates.length - lexicalRows;
  const report = {
    candidateRows: candidates.length,
    trainRows: rowsByAssignment.train.length,
    developmentRows: rowsByAssignment.development.length,
    finalTestRows: rowsByAssignment.final_test.length,
    lexicalRows,
    fixedUtteranceRows,
    trainingReconstructionDiagnosticRows:
      trainingReconstructionDiagnosticRows.length,
    trainerReadyRows: 0 as const,
    syntheticRows: 0 as const,
    sourceClusters: contract.source_clusters.length,
  };

  const expected = contract.expected_counts;
  const comparisons: Array<[string, number, number]> = [
    ['train_rows', report.trainRows, expected.train_rows],
    ['development_rows', report.developmentRows, expected.development_rows],
    ['final_test_rows', report.finalTestRows, expected.final_test_rows],
    ['lexical_rows', report.lexicalRows, expected.lexical_rows],
    [
      'fixed_utterance_rows',
      report.fixedUtteranceRows,
      expected.fixed_utterance_rows,
    ],
    [
      'training_reconstruction_diagnostic_rows',
      report.trainingReconstructionDiagnosticRows,
      expected.training_reconstruction_diagnostic_rows,
    ],
  ];
  for (const [label, actual, required] of comparisons) {
    if (actual !== required) {
      throw new Error(`${label} mismatch: ${actual} != ${required}`);
    }
  }

  return {
    trainRows: rowsByAssignment.train,
    developmentRows: rowsByAssignment.development,
    finalTestRows: rowsByAssignment.final_test,
    trainingReconstructionDiagnosticRows,
    report,
  };
}
