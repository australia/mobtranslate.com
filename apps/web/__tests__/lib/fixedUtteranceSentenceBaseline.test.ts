import { describe, expect, it } from 'vitest';
import { buildFixedUtteranceSentenceBaseline } from '../../lib/research/fixedUtteranceSentenceBaseline';

const SHA = 'a'.repeat(64);

function decision(ordinal: number, overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    decisionId: `decision-${ordinal}`,
    reviewId: 'review-1',
    sourceRecordId: `record-${ordinal}`,
    sourceOrdinal: ordinal,
    sourceId: 'source-1',
    speakerSource: 'Speaker One',
    sourceTaskClass: 'fixed_utterance',
    taskToken: '<translate>',
    inputText: `<translate> prompt ${ordinal}`,
    englishSource: `prompt ${ordinal}`,
    englishAlternateSource: null,
    targetText: ordinal === 1 ? 'target one?' : 'target two!',
    wajarriSource: ordinal === 1 ? 'target one?' : 'target two!',
    sourceSenseStatus: 'accepted_exact_source_fixed_utterance',
    benchmarkInterpretation:
      'attested_fixed_utterance_regression_only_if_trained',
    sourceIndependenceStatus: 'not_assumed',
    directSupervisionEligibility:
      'eligible_noncommercial_after_split_assignment',
    syntheticEligibility: 'not_a_productive_template',
    morphologicalAnalysisStatus: 'not_inferred',
    partOfSpeechStatus: 'not_inferred',
    audioAssetIds: [`audio-${ordinal}`],
    claimLimit: 'Fixed source utterance only.',
    ...overrides,
  };
}

function contract() {
  const reference = { path: 'artifact.json', sha256: SHA };
  return {
    schema_version: 1,
    benchmark_release_id: 'wajarri-fixed-utterance-baseline-v1',
    created_at_utc: '2026-07-24T05:10:00Z',
    output_root: 'benchmarks/sentence-regression/release-v1',
    language: {
      name: 'Wajarri',
      iso_639_3: 'wbv',
      glottocode: 'waja1257',
      direction: 'eng-wbv',
      source_language_token: 'eng_Latn',
      target_language_token: 'wbv_Latn',
    },
    inputs: {
      fixed_utterance_decisions: { ...reference, rows: 2 },
      task_review_manifest: reference,
      rights_review: reference,
      split_contract: reference,
      attested_dataset_manifest: reference,
      dictionary_edition: reference,
      grammar_edition: reference,
      source_ledger_snapshot: { ...reference, rows: 42 },
    },
    implementation: {
      library: reference,
      builder: reference,
      tests: reference,
    },
    suite: {
      suite_key: 'wbv-fixed-utterance-pretraining-v1',
      role: 'regression',
      expected_rows: 2,
      measurement_phase: 'pretraining_zero_step_only',
      source_cluster_id: 'source-1--speaker-one',
      source_id: 'source-1',
      speaker_source: 'Speaker One',
      future_split_assignment: 'train',
    },
    metric_contract: {
      primary_metric: 'normalized_whole_utterance_exact_match',
      normalization: {
        unicode: 'NFKC',
        case: 'lowercase',
        whitespace: 'trim_and_collapse',
        punctuation: 'preserve',
        whole_output_only: true,
      },
      secondary_metrics: ['grapheme_cluster_error_rate', 'blank_output_rate'],
      sampling_unit: 'one_attested_fixed_utterance',
      inference_cluster: 'single_source_speaker_cluster',
    },
    policy: {
      local_evaluation_authorized: true,
      hosted_transfer_authorized: false,
      baseline_before_training_required: true,
      source_cluster_atomic: true,
      independent_future_test: false,
      post_training_interpretation: 'training_reconstruction_only',
      sentence_translation_authorization: false,
      morphology_claim_authorized: false,
      productive_grammar_claim_authorized: false,
      synthetic_generation_authorized: false,
      model_output_is_linguistic_evidence: false,
      current_trainer_inclusion: 'blocked_pending_program_training_gate',
    },
    expected_counts: {
      rows: 2,
      source_clusters: 1,
      speakers: 1,
      independent_development_rows: 0,
      independent_final_test_rows: 0,
      synthetic_rows: 0,
      morphology_claims: 0,
      productive_grammar_claims: 0,
      trainer_ready_rows: 0,
    },
    claim_limit:
      'Pretraining fixed-utterance reconstruction only; no independent sentence claim.',
  };
}

describe('fixed-utterance sentence baseline', () => {
  it('builds a deterministic single-cluster pretraining regression suite', () => {
    const forward = buildFixedUtteranceSentenceBaseline(contract(), [
      decision(2),
      decision(1),
    ]);
    const reverse = buildFixedUtteranceSentenceBaseline(contract(), [
      decision(1),
      decision(2),
    ]);

    expect(forward).toEqual(reverse);
    expect(forward.rows.map((row) => row.source_ordinal)).toEqual([1, 2]);
    expect(forward.rows[0]).toMatchObject({
      task_family: 'sentence',
      pair_kind: 'attested_fixed_utterance',
      future_split_assignment: 'train',
      post_training_interpretation: 'training_reconstruction_only',
      synthetic: false,
      sentence_translation_authorization: false,
      morphological_analysis_status: 'not_inferred',
    });
    expect(forward.sourceGroups).toHaveLength(1);
    expect(forward.report).toMatchObject({
      rows: 2,
      sourceClusters: 1,
      independentFinalTestRows: 0,
      syntheticRows: 0,
      morphologyClaims: 0,
      trainerReadyRows: 0,
    });
  });

  it('rejects a task-prefix mismatch', () => {
    expect(() =>
      buildFixedUtteranceSentenceBaseline(contract(), [
        decision(1, { inputText: '<lexeme> prompt 1' }),
        decision(2),
      ]),
    ).toThrow(/invalid task prefix/u);
  });

  it('rejects duplicate source records', () => {
    expect(() =>
      buildFixedUtteranceSentenceBaseline(contract(), [
        decision(1),
        decision(2, { sourceRecordId: 'record-1' }),
      ]),
    ).toThrow(/duplicate source record/u);
  });

  it('rejects a source-speaker cluster mismatch', () => {
    expect(() =>
      buildFixedUtteranceSentenceBaseline(contract(), [
        decision(1),
        decision(2, { speakerSource: 'Speaker Two' }),
      ]),
    ).toThrow(/unexpected speaker/u);
  });

  it('rejects a target that differs from the reviewed source form', () => {
    expect(() =>
      buildFixedUtteranceSentenceBaseline(contract(), [
        decision(1, { targetText: 'different target' }),
        decision(2),
      ]),
    ).toThrow(/Wajarri target mismatch/u);
  });

  it('rejects contract and input count drift', () => {
    expect(() =>
      buildFixedUtteranceSentenceBaseline(contract(), [decision(1)]),
    ).toThrow(/input row count mismatch/u);
  });
});
