import { createHash } from 'node:crypto';
import { z } from 'zod';

const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/u);
const KeySchema = z.string().regex(/^[a-z0-9][a-z0-9.-]*$/u);

const ArtifactReferenceSchema = z.object({
  path: z.string().min(1),
  sha256: Sha256Schema,
  rows: z.number().int().nonnegative().optional(),
});

export const FixedUtteranceDecisionSchema = z
  .object({
    schemaVersion: z.literal(1),
    decisionId: z.string().min(1),
    reviewId: z.string().min(1),
    sourceRecordId: z.string().min(1),
    sourceOrdinal: z.number().int().positive(),
    sourceId: z.string().min(1),
    speakerSource: z.string().min(1),
    sourceTaskClass: z.literal('fixed_utterance'),
    taskToken: z.literal('<translate>'),
    inputText: z.string().min(1),
    englishSource: z.string().min(1),
    englishAlternateSource: z.string().min(1).nullable(),
    targetText: z.string().min(1),
    wajarriSource: z.string().min(1),
    sourceSenseStatus: z.literal('accepted_exact_source_fixed_utterance'),
    benchmarkInterpretation: z.literal(
      'attested_fixed_utterance_regression_only_if_trained',
    ),
    sourceIndependenceStatus: z.literal('not_assumed'),
    directSupervisionEligibility: z.literal(
      'eligible_noncommercial_after_split_assignment',
    ),
    syntheticEligibility: z.literal('not_a_productive_template'),
    morphologicalAnalysisStatus: z.literal('not_inferred'),
    partOfSpeechStatus: z.literal('not_inferred'),
    audioAssetIds: z.array(z.string().min(1)).min(1),
    claimLimit: z.string().min(1),
  })
  .passthrough();

export const FixedUtteranceSentenceBaselineContractSchema = z.object({
  schema_version: z.literal(1),
  benchmark_release_id: KeySchema,
  created_at_utc: z.string().datetime(),
  output_root: z.string().min(1),
  language: z.object({
    name: z.string().min(1),
    iso_639_3: z.string().length(3),
    glottocode: z.string().min(1),
    direction: z.literal('eng-wbv'),
    source_language_token: z.literal('eng_Latn'),
    target_language_token: z.literal('wbv_Latn'),
  }),
  inputs: z.object({
    fixed_utterance_decisions: ArtifactReferenceSchema.extend({
      rows: z.number().int().positive(),
    }),
    task_review_manifest: ArtifactReferenceSchema,
    rights_review: ArtifactReferenceSchema,
    split_contract: ArtifactReferenceSchema,
    attested_dataset_manifest: ArtifactReferenceSchema,
    dictionary_edition: ArtifactReferenceSchema,
    grammar_edition: ArtifactReferenceSchema,
    source_ledger_snapshot: ArtifactReferenceSchema.extend({
      rows: z.number().int().positive(),
    }),
  }),
  implementation: z.object({
    library: ArtifactReferenceSchema,
    builder: ArtifactReferenceSchema,
    tests: ArtifactReferenceSchema,
  }),
  suite: z.object({
    suite_key: KeySchema,
    role: z.literal('regression'),
    expected_rows: z.number().int().positive(),
    measurement_phase: z.literal('pretraining_zero_step_only'),
    source_cluster_id: z.string().min(1),
    source_id: z.string().min(1),
    speaker_source: z.string().min(1),
    future_split_assignment: z.literal('train'),
  }),
  metric_contract: z.object({
    primary_metric: z.literal('normalized_whole_utterance_exact_match'),
    normalization: z.object({
      unicode: z.literal('NFKC'),
      case: z.literal('lowercase'),
      whitespace: z.literal('trim_and_collapse'),
      punctuation: z.literal('preserve'),
      whole_output_only: z.literal(true),
    }),
    secondary_metrics: z.array(z.string().min(1)).min(1),
    sampling_unit: z.literal('one_attested_fixed_utterance'),
    inference_cluster: z.literal('single_source_speaker_cluster'),
  }),
  policy: z.object({
    local_evaluation_authorized: z.literal(true),
    hosted_transfer_authorized: z.literal(false),
    baseline_before_training_required: z.literal(true),
    source_cluster_atomic: z.literal(true),
    independent_future_test: z.literal(false),
    post_training_interpretation: z.literal('training_reconstruction_only'),
    sentence_translation_authorization: z.literal(false),
    morphology_claim_authorized: z.literal(false),
    productive_grammar_claim_authorized: z.literal(false),
    synthetic_generation_authorized: z.literal(false),
    model_output_is_linguistic_evidence: z.literal(false),
    current_trainer_inclusion: z.literal(
      'blocked_pending_program_training_gate',
    ),
  }),
  expected_counts: z.object({
    rows: z.number().int().positive(),
    source_clusters: z.literal(1),
    speakers: z.literal(1),
    independent_development_rows: z.literal(0),
    independent_final_test_rows: z.literal(0),
    synthetic_rows: z.literal(0),
    morphology_claims: z.literal(0),
    productive_grammar_claims: z.literal(0),
    trainer_ready_rows: z.literal(0),
  }),
  claim_limit: z.string().min(1),
});

export type FixedUtteranceDecision = z.infer<
  typeof FixedUtteranceDecisionSchema
>;
export type FixedUtteranceSentenceBaselineContract = z.infer<
  typeof FixedUtteranceSentenceBaselineContractSchema
>;

export interface FixedUtteranceSentenceBaselineRow {
  schema_version: 1;
  id: string;
  suite_key: string;
  task: 'S0_attested_fixed_utterance_pretraining_reconstruction';
  task_family: 'sentence';
  pair_kind: 'attested_fixed_utterance';
  direction: 'eng-wbv';
  input_text: string;
  source_prompt: string;
  accepted_references: string[];
  measurement_phase: 'pretraining_zero_step_only';
  project_training_exposure_at_measurement: 'none';
  future_split_assignment: 'train';
  post_training_interpretation: 'training_reconstruction_only';
  benchmark_independence: 'single_source_cluster_pretraining_diagnostic';
  source_cluster_id: string;
  source_id: string;
  source_record_id: string;
  source_ordinal: number;
  speaker_source: string;
  decision_id: string;
  review_id: string;
  audio_asset_ids: string[];
  source_token_count: number;
  target_token_count: number;
  target_grapheme_count: number;
  structural_risk_tags: string[];
  morphological_analysis_status: 'not_inferred';
  productive_grammar_status: 'not_inferred';
  synthetic: false;
  sentence_translation_authorization: false;
  model_output_is_linguistic_evidence: false;
  claim_limit: string;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalized(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase('en')
    .replace(/\s+/gu, ' ');
}

function tokens(value: string): string[] {
  return value.trim().split(/\s+/u).filter(Boolean);
}

function graphemeCount(value: string): number {
  const segmenter = new Intl.Segmenter('und', { granularity: 'grapheme' });
  return [...segmenter.segment(value)].length;
}

function stableId(releaseId: string, decisionId: string): string {
  const digest = createHash('sha256')
    .update(`${releaseId}\u0000${decisionId}`)
    .digest('hex')
    .slice(0, 24);
  return `${releaseId}:row:${digest}`;
}

function sourcePrompt(row: FixedUtteranceDecision): string {
  const prefix = `${row.taskToken} `;
  if (!row.inputText.startsWith(prefix))
    throw new Error(`invalid task prefix for ${row.decisionId}`);
  const prompt = row.inputText.slice(prefix.length).trim();
  if (!prompt) throw new Error(`empty source prompt for ${row.decisionId}`);
  if (normalized(prompt) !== normalized(row.englishSource))
    throw new Error(`English source mismatch for ${row.decisionId}`);
  return prompt;
}

function structuralRiskTags(
  source: string,
  target: string,
  targetTokenCount: number,
): string[] {
  const values = new Set<string>();
  values.add(`target_tokens:${targetTokenCount}`);
  if (source.includes('/')) values.add('source_alternative_label');
  if (source.includes('?')) values.add('source_question_punctuation');
  if (target.includes('?')) values.add('target_question_punctuation');
  if (source.includes('!')) values.add('source_exclamation_punctuation');
  if (target.includes('!')) values.add('target_exclamation_punctuation');
  return [...values].sort(compareText);
}

export function buildFixedUtteranceSentenceBaseline(
  rawContract: unknown,
  rawDecisions: unknown[],
) {
  const contract =
    FixedUtteranceSentenceBaselineContractSchema.parse(rawContract);
  const decisions = rawDecisions.map((row) =>
    FixedUtteranceDecisionSchema.parse(row),
  );

  if (decisions.length !== contract.inputs.fixed_utterance_decisions.rows)
    throw new Error('fixed-utterance input row count mismatch');
  if (decisions.length !== contract.suite.expected_rows)
    throw new Error('suite row count mismatch');
  if (decisions.length !== contract.expected_counts.rows)
    throw new Error('expected row count mismatch');

  const decisionIds = new Set<string>();
  const sourceRecordIds = new Set<string>();
  const sourceOrdinals = new Set<number>();
  for (const row of decisions) {
    if (decisionIds.has(row.decisionId))
      throw new Error(`duplicate decision ID: ${row.decisionId}`);
    if (sourceRecordIds.has(row.sourceRecordId))
      throw new Error(`duplicate source record ID: ${row.sourceRecordId}`);
    if (sourceOrdinals.has(row.sourceOrdinal))
      throw new Error(`duplicate source ordinal: ${row.sourceOrdinal}`);
    if (row.sourceId !== contract.suite.source_id)
      throw new Error(`unexpected source ID for ${row.decisionId}`);
    if (row.speakerSource !== contract.suite.speaker_source)
      throw new Error(`unexpected speaker for ${row.decisionId}`);
    if (row.targetText !== row.wajarriSource)
      throw new Error(`Wajarri target mismatch for ${row.decisionId}`);
    decisionIds.add(row.decisionId);
    sourceRecordIds.add(row.sourceRecordId);
    sourceOrdinals.add(row.sourceOrdinal);
  }

  const sharedClaimLimit = contract.claim_limit;
  const rows: FixedUtteranceSentenceBaselineRow[] = [...decisions]
    .sort(
      (left, right) =>
        left.sourceOrdinal - right.sourceOrdinal ||
        compareText(left.decisionId, right.decisionId),
    )
    .map((decision) => {
      const prompt = sourcePrompt(decision);
      const targetTokenCount = tokens(decision.targetText).length;
      return {
        schema_version: 1,
        id: stableId(contract.benchmark_release_id, decision.decisionId),
        suite_key: contract.suite.suite_key,
        task: 'S0_attested_fixed_utterance_pretraining_reconstruction',
        task_family: 'sentence',
        pair_kind: 'attested_fixed_utterance',
        direction: 'eng-wbv',
        input_text: decision.inputText,
        source_prompt: prompt,
        accepted_references: [decision.targetText],
        measurement_phase: 'pretraining_zero_step_only',
        project_training_exposure_at_measurement: 'none',
        future_split_assignment: 'train',
        post_training_interpretation: 'training_reconstruction_only',
        benchmark_independence: 'single_source_cluster_pretraining_diagnostic',
        source_cluster_id: contract.suite.source_cluster_id,
        source_id: decision.sourceId,
        source_record_id: decision.sourceRecordId,
        source_ordinal: decision.sourceOrdinal,
        speaker_source: decision.speakerSource,
        decision_id: decision.decisionId,
        review_id: decision.reviewId,
        audio_asset_ids: [...decision.audioAssetIds].sort(compareText),
        source_token_count: tokens(prompt).length,
        target_token_count: targetTokenCount,
        target_grapheme_count: graphemeCount(decision.targetText),
        structural_risk_tags: structuralRiskTags(
          prompt,
          decision.targetText,
          targetTokenCount,
        ),
        morphological_analysis_status: 'not_inferred',
        productive_grammar_status: 'not_inferred',
        synthetic: false,
        sentence_translation_authorization: false,
        model_output_is_linguistic_evidence: false,
        claim_limit: sharedClaimLimit,
      };
    });

  const sourceGroups = [
    {
      source_cluster_id: contract.suite.source_cluster_id,
      source_id: contract.suite.source_id,
      speaker_source: contract.suite.speaker_source,
      future_split_assignment: 'train',
      row_ids: rows.map((row) => row.id),
      rows: rows.length,
      independent_development_rows: 0,
      independent_final_test_rows: 0,
      post_training_interpretation: 'training_reconstruction_only',
      claim_limit:
        'All rows are one source and speaker cluster. Row-level splitting cannot manufacture independent evidence.',
    },
  ];

  const report = {
    rows: rows.length,
    sourceClusters: 1,
    speakers: 1,
    sourceQuestionRows: rows.filter((row) =>
      row.structural_risk_tags.includes('source_question_punctuation'),
    ).length,
    targetQuestionRows: rows.filter((row) =>
      row.structural_risk_tags.includes('target_question_punctuation'),
    ).length,
    targetExclamationRows: rows.filter((row) =>
      row.structural_risk_tags.includes('target_exclamation_punctuation'),
    ).length,
    sourceAlternativeLabelRows: rows.filter((row) =>
      row.structural_risk_tags.includes('source_alternative_label'),
    ).length,
    singleTokenTargetRows: rows.filter((row) => row.target_token_count === 1)
      .length,
    multiTokenTargetRows: rows.filter((row) => row.target_token_count > 1)
      .length,
    independentDevelopmentRows: 0,
    independentFinalTestRows: 0,
    syntheticRows: 0,
    morphologyClaims: 0,
    productiveGrammarClaims: 0,
    trainerReadyRows: 0,
  };

  if (report.rows !== contract.expected_counts.rows)
    throw new Error('report row count mismatch');

  return { contract, rows, sourceGroups, report };
}
