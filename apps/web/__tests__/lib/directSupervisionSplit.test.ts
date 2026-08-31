import { describe, expect, it } from 'vitest';
import {
  buildDirectSupervisionSplit,
  type DirectSupervisionCandidate,
} from '@/lib/research/directSupervisionSplit';

function candidate(
  ordinal: number,
  overrides: Partial<DirectSupervisionCandidate> = {},
): DirectSupervisionCandidate {
  return {
    schemaVersion: 1,
    reviewId: 'review-1',
    datasetRecordId: `dataset-${ordinal}`,
    sourceRecordId: `source-record-${ordinal}`,
    sourceOrdinal: ordinal,
    taskType: 'lexical_reconstruction',
    taskToken: '<lexeme>',
    inputText: `<lexeme> english-${ordinal}`,
    targetText: `wajarri-${ordinal}`,
    sourceId: 'source-1',
    speakerSource: 'Speaker One',
    license: 'CC BY-NC 4.0',
    commercialUse: 'not_allowed',
    attributionRequired: true,
    splitAssignment: 'unassigned',
    trainingStatus: 'eligible_after_split_assignment',
    benchmarkIndependence: 'not_independent_if_in_training',
    synthetic: false,
    linguisticEvidenceRole: 'direct_source_pair',
    audioAssetIds: [`audio-${ordinal}`],
    ...overrides,
  };
}

function contract(overrides: Record<string, unknown> = {}) {
  return {
    schema_version: 1,
    split_contract_id: 'split-1',
    created_at_utc: '2026-07-23T00:00:00Z',
    output_root: 'corpora/attested/split-1',
    language: {
      name: 'Wajarri',
      code: 'wbv',
      source_language_token: 'eng_Latn',
      target_language_token: 'wbv_Latn',
      direction: 'eng-wbv',
    },
    inputs: {
      candidates: { path: 'candidates.jsonl', sha256: 'a'.repeat(64), rows: 2 },
      task_review: { path: 'task-review.json', sha256: 'b'.repeat(64) },
      rights_review: { path: 'rights.json', sha256: 'c'.repeat(64) },
      dictionary_edition: { path: 'dictionary.json', sha256: 'd'.repeat(64) },
      grammar_edition: { path: 'grammar.json', sha256: 'e'.repeat(64) },
      source_ledger_snapshot: {
        path: 'source-ledger.jsonl',
        sha256: 'f'.repeat(64),
        rows: 42,
      },
    },
    source_clusters: [
      {
        cluster_id: 'source-1-speaker-one',
        source_id: 'source-1',
        speaker_source: 'Speaker One',
        assignment: 'train',
        expected_rows: 2,
        rationale: 'The complete source and speaker cluster remains atomic.',
      },
    ],
    policies: {
      cluster_atomicity: 'source_and_speaker_cluster_is_atomic',
      independent_evaluation:
        'no_training_row_can_be_claimed_as_independent_evaluation',
      training_reconstruction:
        'allowed_only_as_explicitly_non_independent_diagnostic',
      evaluation_leakage_groups: 'required_for_development_and_final_test_rows',
      synthetic_data: 'excluded',
      program_training_gate:
        'closed_pending_zero_step_census_and_failure_analysis',
    },
    expected_counts: {
      candidate_rows: 2,
      train_rows: 2,
      development_rows: 0,
      final_test_rows: 0,
      lexical_rows: 1,
      fixed_utterance_rows: 1,
      training_reconstruction_diagnostic_rows: 2,
      trainer_ready_rows: 0,
      synthetic_rows: 0,
    },
    claim_limit:
      'Training-cluster assignment only; no independent evaluation claim.',
    ...overrides,
  };
}

describe('buildDirectSupervisionSplit', () => {
  it('keeps a source-speaker cluster atomic and labels reconstruction as non-independent', () => {
    const rows = [
      candidate(2, {
        taskType: 'fixed_utterance_translation',
        taskToken: '<translate>',
        inputText: '<translate> hello',
      }),
      candidate(1),
    ];
    const result = buildDirectSupervisionSplit(contract(), rows);

    expect(result.report).toEqual({
      candidateRows: 2,
      trainRows: 2,
      developmentRows: 0,
      finalTestRows: 0,
      lexicalRows: 1,
      fixedUtteranceRows: 1,
      trainingReconstructionDiagnosticRows: 2,
      trainerReadyRows: 0,
      syntheticRows: 0,
      sourceClusters: 1,
    });
    expect(result.trainRows.map((row) => row.source_ordinal)).toEqual([1, 2]);
    expect(result.trainRows[0]).toMatchObject({
      source_lang: 'eng_Latn',
      target_lang: 'wbv_Latn',
      direction: 'eng-wbv',
      split: 'train',
      unconditioned_input_text: 'english-1',
      trainer_inclusion_status: 'blocked_pending_program_training_gate',
      benchmark_independence: 'not_independent_training_reconstruction_only',
      synthetic: false,
    });
    expect(result.trainingReconstructionDiagnosticRows).toHaveLength(2);
    expect(result.trainingReconstructionDiagnosticRows[0]).toMatchObject({
      split: 'training_reconstruction_diagnostic',
      trainer_inclusion_status: 'excluded_from_training',
      evaluation_role: 'training_reconstruction_diagnostic_only',
      benchmark_independence: 'not_independent_training_reconstruction_only',
    });
  });

  it('rejects multiple assignments for one source-speaker cluster', () => {
    const value = contract();
    value.source_clusters.push({
      ...value.source_clusters[0],
      cluster_id: 'duplicate-cluster',
      assignment: 'development',
    });
    expect(() =>
      buildDirectSupervisionSplit(value, [candidate(1), candidate(2)]),
    ).toThrow('source/speaker cluster has multiple assignments');
  });

  it('rejects a held-out row without a leakage group', () => {
    const value = contract({
      source_clusters: [
        {
          ...contract().source_clusters[0],
          assignment: 'development',
        },
      ],
      expected_counts: {
        ...contract().expected_counts,
        train_rows: 0,
        development_rows: 2,
        training_reconstruction_diagnostic_rows: 0,
      },
    });
    expect(() =>
      buildDirectSupervisionSplit(value, [candidate(1), candidate(2)]),
    ).toThrow('held-out candidate lacks leakage group');
  });

  it('rejects a leakage group that crosses split boundaries', () => {
    const value = contract({
      source_clusters: [
        {
          ...contract().source_clusters[0],
          source_id: 'source-1',
          speaker_source: 'Speaker One',
          assignment: 'development',
          expected_rows: 1,
        },
        {
          ...contract().source_clusters[0],
          cluster_id: 'source-2-speaker-two',
          source_id: 'source-2',
          speaker_source: 'Speaker Two',
          assignment: 'final_test',
          expected_rows: 1,
        },
      ],
      expected_counts: {
        ...contract().expected_counts,
        train_rows: 0,
        development_rows: 1,
        final_test_rows: 1,
        training_reconstruction_diagnostic_rows: 0,
      },
    });
    const rows = [
      candidate(1, { leakageGroupId: 'shared-group' }),
      candidate(2, {
        sourceId: 'source-2',
        speakerSource: 'Speaker Two',
        leakageGroupId: 'shared-group',
        taskType: 'fixed_utterance_translation',
        taskToken: '<translate>',
        inputText: '<translate> hello',
      }),
    ];
    expect(() => buildDirectSupervisionSplit(value, rows)).toThrow(
      'leakage group crosses split boundary',
    );
  });

  it('rejects a task token that does not agree with its task type', () => {
    expect(() =>
      buildDirectSupervisionSplit(contract(), [
        candidate(1, {
          taskToken: '<translate>',
          inputText: '<translate> word',
        }),
        candidate(2, {
          taskType: 'fixed_utterance_translation',
          taskToken: '<translate>',
          inputText: '<translate> hello',
        }),
      ]),
    ).toThrow('task token does not match task type');
  });

  it('rejects an expected-count mismatch', () => {
    const value = contract({
      expected_counts: { ...contract().expected_counts, train_rows: 1 },
    });
    expect(() =>
      buildDirectSupervisionSplit(value, [candidate(1), candidate(2)]),
    ).toThrow('train_rows mismatch');
  });
});
