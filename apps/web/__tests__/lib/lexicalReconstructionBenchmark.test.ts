import { describe, expect, it } from 'vitest';
import { buildLexicalReconstructionBenchmark } from '../../lib/research/lexicalReconstructionBenchmark';

const SHA = 'a'.repeat(64);

const dispositions = [
  {
    sourceRecordId: 'record-1',
    sourceTarget: 'target-a',
    contextGroupId: 'context-1',
    promptGroupId: 'prompt-1',
    referenceMembershipStatus:
      'accepted_for_internal_source_reconstruction_only',
    semanticTranslationStatus: 'unadjudicated',
    benchmarkEligibility: {
      sourceContextReconstruction: true,
      unconditionedPromptReconstruction: true,
      sentenceTranslation: false,
    },
    trainingEligibility: 'not_allowed',
    redistributionStatus: 'not_authorized',
  },
  {
    sourceRecordId: 'record-2',
    sourceTarget: 'target-b',
    contextGroupId: 'context-1',
    promptGroupId: 'prompt-1',
    referenceMembershipStatus:
      'accepted_for_internal_source_reconstruction_only',
    semanticTranslationStatus: 'unadjudicated',
    benchmarkEligibility: {
      sourceContextReconstruction: true,
      unconditionedPromptReconstruction: true,
      sentenceTranslation: false,
    },
    trainingEligibility: 'not_allowed',
    redistributionStatus: 'not_authorized',
  },
];

const contextGroups = [
  {
    contextGroupId: 'context-1',
    task: 'L1_internal_source_context_reconstruction',
    inputText: '<lexeme> cat\nDefinition: cat',
    sourcePrompt: 'cat',
    sourcePromptComparison: 'cat',
    sourceDefinition: 'cat',
    sourceRecordIds: ['record-1', 'record-2'],
    acceptedReferences: ['target-a', 'target-b'],
    referenceScope: 'internal_closed_set_source_reconstruction',
    ambiguityStatus: 'source_context_underdetermined_reference_set',
    structuralStrata: ['multi_target_prompt_requires_relation_review'],
    semanticTranslationAccepted: false,
    trainingEligibility: 'not_allowed',
    redistributionStatus: 'not_authorized',
  },
];

const promptGroups = [
  {
    promptGroupId: 'prompt-1',
    task: 'L0_internal_dictionary_prompt_reconstruction',
    inputText: '<lexeme> cat',
    sourcePromptValues: ['cat'],
    sourcePromptComparison: 'cat',
    sourceRecordIds: ['record-1', 'record-2'],
    acceptedReferences: ['target-a', 'target-b'],
    referenceScope: 'internal_closed_set_source_reconstruction',
    ambiguityStatus: 'unconditioned_prompt_reference_set',
    semanticTranslationAccepted: false,
    trainingEligibility: 'not_allowed',
    redistributionStatus: 'not_authorized',
  },
];

function contract() {
  return {
    schema_version: 1,
    benchmark_release_id: 'wbv-lexical-internal-v1',
    created_at_utc: '2026-07-22T10:20:00.000Z',
    language: {
      name: 'Wajarri',
      iso_639_3: 'wbv',
      glottocode: 'waja1257',
    },
    dictionary_edition: {
      edition_id: 'dictionary-v0.6.0',
      manifest_path: 'dictionary.json',
      manifest_sha256: SHA,
    },
    components: {
      dispositions: { path: 'dispositions.jsonl', sha256: SHA, rows: 2 },
      context_groups: { path: 'contexts.jsonl', sha256: SHA, rows: 1 },
      prompt_groups: { path: 'prompts.jsonl', sha256: SHA, rows: 1 },
    },
    suites: {
      source_context: {
        suite_key: 'wbv-lexical-source-context-v1',
        role: 'regression',
        expected_rows: 1,
        output_directory: 'benchmarks/context',
        sampling_unit: 'source context group',
      },
      prompt_group: {
        suite_key: 'wbv-lexical-prompt-group-v1',
        role: 'operational',
        expected_rows: 1,
        output_directory: 'benchmarks/prompt',
        sampling_unit: 'prompt group',
      },
    },
    metric_contract: {
      primary_metric: 'ambiguity_aware_normalized_exact_match',
      normalization: {
        unicode: 'NFKC',
        case: 'lowercase',
        whitespace: 'trim_and_collapse',
        punctuation: 'preserve',
        whole_output_only: true,
      },
      secondary_metrics: ['strict_exact_match', 'grapheme_cer'],
      population_interpretation: 'Complete source population.',
      failure_join_unit: 'source_record_id',
    },
    policy: {
      internal_only: true,
      sealed: false,
      semantic_translation_claim: false,
      sentence_translation_authorization: false,
      training_eligibility: false,
      redistribution_authorized: false,
      model_output_is_linguistic_evidence: false,
    },
    output_root: 'benchmarks/release',
    claim_limit: 'Source reconstruction only.',
  };
}

describe('lexical reconstruction benchmark', () => {
  it('freezes complete ambiguity-aware source populations', () => {
    const result = buildLexicalReconstructionBenchmark({
      contractValue: contract(),
      dispositions,
      contextGroups,
      promptGroups,
    });

    expect(result.contextRows).toHaveLength(1);
    expect(result.promptRows).toHaveLength(1);
    expect(result.contextRows[0].acceptedReferences).toEqual([
      'target-a',
      'target-b',
    ]);
    expect(result.report.sourceRecordCoverage).toBe(2);
    expect(result.report.semanticTranslationReferences).toBe(0);
    expect(result.report.trainingEligibleRows).toBe(0);
  });

  it('rejects a reference set that omits a source member', () => {
    const invalidContext = [
      { ...contextGroups[0], acceptedReferences: ['target-a'] },
    ];

    expect(() =>
      buildLexicalReconstructionBenchmark({
        contractValue: contract(),
        dispositions,
        contextGroups: invalidContext,
        promptGroups,
      }),
    ).toThrow(/context references omit target-b/u);
  });

  it('rejects incomplete source-record coverage', () => {
    const invalidPrompt = [
      { ...promptGroups[0], sourceRecordIds: ['record-1'] },
    ];

    expect(() =>
      buildLexicalReconstructionBenchmark({
        contractValue: contract(),
        dispositions,
        contextGroups,
        promptGroups: invalidPrompt,
      }),
    ).toThrow(/prompt group omits record-2/u);
  });

  it('rejects a suite row-count mismatch', () => {
    const invalidContract = contract();
    invalidContract.suites.source_context.expected_rows = 2;

    expect(() =>
      buildLexicalReconstructionBenchmark({
        contractValue: invalidContract,
        dispositions,
        contextGroups,
        promptGroups,
      }),
    ).toThrow(/source-context suite row count/u);
  });
});
