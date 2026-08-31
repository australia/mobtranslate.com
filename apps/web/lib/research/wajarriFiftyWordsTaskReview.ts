import { createHash } from 'node:crypto';
import { z } from 'zod';

const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/u);

const ArtifactReferenceSchema = z.object({
  path: z.string().min(1),
  sha256: Sha256Schema,
  rows: z.number().int().nonnegative().optional(),
});

const CurrentDictionaryMatchSchema = z.object({
  sourceRecordId: z.string().min(1),
  sourceOrdinal: z.number().int().positive(),
  headwordSource: z.string().min(1),
  englishSource: z.string().min(1),
  descriptionSource: z.string().min(1),
  soundSource: z.string().min(1),
  exactEnglishSourceMatch: z.boolean(),
  exactEnglishAlternateMatch: z.boolean(),
  exactDescriptionMatch: z.boolean(),
});

export const FiftyWordsTaskPairingSchema = z.object({
  schemaVersion: z.literal(1),
  inventoryId: z.literal('wajarri-50words-a39-evidence-v0.1.0'),
  recordId: z.string().min(1),
  sourceId: z.literal('src-wbv-50words-a39-2019-20260723'),
  sourceOrdinal: z.number().int().positive(),
  englishSource: z.string().min(1),
  englishAlternateSource: z.string().min(1).nullable(),
  wajarriSource: z.string().min(1),
  speakerSource: z.string().min(1),
  sourceCollection: z.string().min(1),
  dateReceivedSource: z.number().int().positive(),
  sourceAttestationStatus: z.literal('speaker_attributed_published_pair'),
  licenseScope: z.literal('public_50words_site_material_only'),
  acceptanceStatus: z.literal('accepted_as_source_attestation'),
  lexicalSenseStatus: z.literal('unadjudicated'),
  translationTaskEligibility: z.literal('pending_task_and_sense_review'),
  syntheticEligibility: z.literal('not_yet_eligible'),
  trainingEligibility: z.literal('not_yet_eligible_pending_task_review'),
  englishTokenCount: z.number().int().positive(),
  wajarriTokenCount: z.number().int().positive(),
  sourceHasTerminalPunctuation: z.boolean(),
  audioPaths: z.array(z.string().min(1)).length(3),
  currentDictionaryRelation: z.enum([
    'no_exact_current_headword',
    'unique_exact_current_headword',
    'multiple_exact_current_headwords',
  ]),
  currentDictionaryMatches: z.array(CurrentDictionaryMatchSchema),
  claimLimit: z.string().min(1),
});

export const FiftyWordsTaskAudioAssetSchema = z.object({
  schemaVersion: z.literal(1),
  assetId: z.string().min(1),
  role: z.enum(['language_name', 'speaker_name', 'translation_pair']),
  sourceRecordId: z.string().min(1).nullable(),
  englishSource: z.string().min(1).nullable(),
  wajarriSource: z.string().min(1),
  speakerSource: z.string().min(1),
  remotePath: z.string().min(1),
  remoteUrl: z.string().url(),
  archiveRelativePath: z.string().min(1),
  mediaType: z.enum(['audio/mpeg', 'audio/wav', 'video/webm']),
});

export const FiftyWordsTaskReviewContractSchema = z.object({
  schema_version: z.literal(1),
  review_id: z.string().min(1),
  created_at_utc: z.string().datetime(),
  output_root: z.string().min(1),
  source_pairings: ArtifactReferenceSchema.extend({
    rows: z.number().int().positive(),
  }),
  source_audio_assets: ArtifactReferenceSchema.extend({
    rows: z.number().int().positive(),
  }),
  rights_review: ArtifactReferenceSchema.extend({
    review_id: z.string().min(1),
  }),
  task_tokens: z.object({
    lexical_concept: z.literal('<lexeme>'),
    fixed_utterance: z.literal('<translate>'),
  }),
  fixed_utterance_ordinals: z.array(z.number().int().positive()).min(1),
  lexical_concept_ordinals: z.array(z.number().int().positive()).min(1),
  expected_counts: z.object({
    source_pairings: z.number().int().positive(),
    fixed_utterances: z.number().int().nonnegative(),
    lexical_senses: z.number().int().nonnegative(),
    lexical_surface_groups: z.number().int().nonnegative(),
    pair_audio_links: z.number().int().nonnegative(),
    direct_supervision_candidates: z.number().int().nonnegative(),
    split_assigned_training_rows: z.literal(0),
    synthetic_eligible_rows: z.literal(0),
    productive_grammar_rules: z.literal(0),
  }),
  review_policy: z.object({
    direct_supervision: z.literal(
      'source_exact_noncommercial_after_split_assignment',
    ),
    source_independence: z.literal('not_assumed'),
    part_of_speech: z.literal('not_inferred'),
    morphology: z.literal('not_inferred'),
    fixed_utterance_productivity: z.literal('not_inferred'),
    synthetic_generation: z.literal(
      'blocked_until_productive_grammar_and_slot_compatibility_are_accepted',
    ),
  }),
});

const RightsReviewSchema = z.object({
  schema_version: z.literal(1),
  review_id: z.string().min(1),
  included_material: z.object({
    translation_pairings: z.number().int().positive(),
    public_audio_derivatives: z.number().int().positive(),
    license: z.literal('CC BY-NC 4.0'),
  }),
  operational_decision: z.object({
    model_training: z.literal(true),
    redistribution: z.literal(true),
    derived_model_weights: z.literal(true),
    third_party_hosted_processing: z.literal(true),
    conditions: z.array(z.string().min(1)).min(1),
  }),
});

export type FiftyWordsTaskReviewContract = z.infer<
  typeof FiftyWordsTaskReviewContractSchema
>;
export type FiftyWordsTaskPairing = z.infer<typeof FiftyWordsTaskPairingSchema>;
export type FiftyWordsTaskAudioAsset = z.infer<
  typeof FiftyWordsTaskAudioAssetSchema
>;

export interface FiftyWordsTaskDecision {
  schemaVersion: 1;
  reviewId: string;
  decisionId: string;
  sourceRecordId: string;
  sourceId: 'src-wbv-50words-a39-2019-20260723';
  sourceOrdinal: number;
  speakerSource: string;
  englishSource: string;
  englishAlternateSource: string | null;
  wajarriSource: string;
  sourceTaskClass: 'lexical_concept_or_expression' | 'fixed_utterance';
  taskToken: '<lexeme>' | '<translate>';
  inputText: string;
  targetText: string;
  sourceSenseStatus:
    | 'accepted_exact_source_lexical_sense'
    | 'accepted_exact_source_fixed_utterance';
  dictionaryIntegration: 'accepted_source_entry_and_sense' | 'example_only';
  directSupervisionEligibility: 'eligible_noncommercial_after_split_assignment';
  splitAssignment: 'unassigned';
  benchmarkInterpretation:
    | 'closed_set_reconstruction_only_if_trained'
    | 'attested_fixed_utterance_regression_only_if_trained';
  sourceIndependenceStatus: 'not_assumed';
  partOfSpeechStatus: 'not_inferred';
  morphologicalAnalysisStatus: 'not_inferred';
  syntheticEligibility:
    | 'blocked_pending_pos_morphology_and_productive_grammar'
    | 'not_a_productive_template';
  audioAssetIds: string[];
  currentDictionaryRelation: FiftyWordsTaskPairing['currentDictionaryRelation'];
  currentDictionaryMatchIds: string[];
  claimLimit: string;
}

export interface FiftyWordsDirectSupervisionCandidate {
  schemaVersion: 1;
  reviewId: string;
  datasetRecordId: string;
  sourceRecordId: string;
  sourceOrdinal: number;
  taskType: 'lexical_reconstruction' | 'fixed_utterance_translation';
  taskToken: '<lexeme>' | '<translate>';
  inputText: string;
  targetText: string;
  sourceId: 'src-wbv-50words-a39-2019-20260723';
  speakerSource: string;
  license: 'CC BY-NC 4.0';
  commercialUse: 'not_allowed';
  attributionRequired: true;
  splitAssignment: 'unassigned';
  trainingStatus: 'eligible_after_split_assignment';
  benchmarkIndependence: 'not_independent_if_in_training';
  synthetic: false;
  linguisticEvidenceRole: 'direct_source_pair';
  audioAssetIds: string[];
}

export interface FiftyWordsLexicalSurfaceGroup {
  schemaVersion: 1;
  reviewId: string;
  lexicalEntryId: string;
  formId: string;
  wajarriSource: string;
  sourceRecordIds: string[];
  sourceOrdinals: number[];
  englishSourceSenses: string[];
  senseDecisionIds: string[];
  speakerSource: string;
  sourceId: 'src-wbv-50words-a39-2019-20260723';
  orthographyStatus: 'accepted_exact_source_spelling';
  partOfSpeechStatus: 'not_inferred';
  morphologicalAnalysisStatus: 'not_inferred';
  syntheticEligibility: 'blocked_pending_pos_morphology_and_productive_grammar';
}

export interface FiftyWordsPairAudioLink {
  schemaVersion: 1;
  reviewId: string;
  mediaLinkId: string;
  sourceRecordId: string;
  assetId: string;
  archiveRelativePath: string;
  remoteUrl: string;
  mediaType: FiftyWordsTaskAudioAsset['mediaType'];
  speakerSource: string;
  decodeStatus: 'passed_in_source_archive_audit';
  trainingEligibility: 'eligible_noncommercial_after_split_assignment';
}

export interface FiftyWordsTaskReviewResult {
  taskDecisions: FiftyWordsTaskDecision[];
  lexicalSenseDecisions: FiftyWordsTaskDecision[];
  fixedUtteranceDecisions: FiftyWordsTaskDecision[];
  lexicalSurfaceGroups: FiftyWordsLexicalSurfaceGroup[];
  directSupervisionCandidates: FiftyWordsDirectSupervisionCandidate[];
  pairAudioLinks: FiftyWordsPairAudioLink[];
  report: {
    sourcePairings: number;
    fixedUtterances: number;
    lexicalSenses: number;
    lexicalSurfaceGroups: number;
    pairAudioLinks: number;
    directSupervisionCandidates: number;
    splitAssignedTrainingRows: 0;
    syntheticEligibleRows: 0;
    productiveGrammarRules: 0;
    exactCurrentHeadwordRows: number;
    rowsWithoutExactCurrentHeadword: number;
  };
}

function canonicalText(value: string): string {
  return value.normalize('NFC').trim().toLocaleLowerCase('en');
}

function shortHash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 24);
}

function assertUnique<T>(
  rows: T[],
  key: (row: T) => string | number,
  label: string,
): void {
  const seen = new Set<string | number>();
  for (const row of rows) {
    const value = key(row);
    if (seen.has(value)) throw new Error(`duplicate ${label}: ${value}`);
    seen.add(value);
  }
}

function assertExpectedCounts(
  actual: FiftyWordsTaskReviewResult['report'],
  expected: FiftyWordsTaskReviewContract['expected_counts'],
): void {
  const comparisons: Array<[string, number, number]> = [
    ['source_pairings', actual.sourcePairings, expected.source_pairings],
    ['fixed_utterances', actual.fixedUtterances, expected.fixed_utterances],
    ['lexical_senses', actual.lexicalSenses, expected.lexical_senses],
    [
      'lexical_surface_groups',
      actual.lexicalSurfaceGroups,
      expected.lexical_surface_groups,
    ],
    ['pair_audio_links', actual.pairAudioLinks, expected.pair_audio_links],
    [
      'direct_supervision_candidates',
      actual.directSupervisionCandidates,
      expected.direct_supervision_candidates,
    ],
    [
      'split_assigned_training_rows',
      actual.splitAssignedTrainingRows,
      expected.split_assigned_training_rows,
    ],
    [
      'synthetic_eligible_rows',
      actual.syntheticEligibleRows,
      expected.synthetic_eligible_rows,
    ],
    [
      'productive_grammar_rules',
      actual.productiveGrammarRules,
      expected.productive_grammar_rules,
    ],
  ];
  for (const [label, observed, wanted] of comparisons)
    if (observed !== wanted)
      throw new Error(
        `expected count mismatch for ${label}: ${observed} != ${wanted}`,
      );
}

export function buildWajarriFiftyWordsTaskReview(input: {
  contractValue: unknown;
  pairingRows: unknown[];
  audioAssetRows: unknown[];
  rightsReviewValue: unknown;
}): FiftyWordsTaskReviewResult {
  const contract = FiftyWordsTaskReviewContractSchema.parse(
    input.contractValue,
  );
  const pairings = z
    .array(FiftyWordsTaskPairingSchema)
    .parse(input.pairingRows);
  const audioAssets = z
    .array(FiftyWordsTaskAudioAssetSchema)
    .parse(input.audioAssetRows);
  const rightsReview = RightsReviewSchema.parse(input.rightsReviewValue);
  if (rightsReview.review_id !== contract.rights_review.review_id)
    throw new Error('rights-review identity mismatch');
  if (rightsReview.included_material.translation_pairings !== pairings.length)
    throw new Error('rights-review pairing count mismatch');
  if (
    rightsReview.included_material.public_audio_derivatives !==
    audioAssets.length
  )
    throw new Error('rights-review audio count mismatch');
  if (pairings.length !== contract.source_pairings.rows)
    throw new Error('source pairing row count mismatch');
  if (audioAssets.length !== contract.source_audio_assets.rows)
    throw new Error('source audio row count mismatch');

  assertUnique(pairings, (row) => row.recordId, 'source record ID');
  assertUnique(pairings, (row) => row.sourceOrdinal, 'source ordinal');
  assertUnique(audioAssets, (row) => row.assetId, 'audio asset ID');
  assertUnique(audioAssets, (row) => row.remotePath, 'audio remote path');

  const fixedOrdinals = new Set(contract.fixed_utterance_ordinals);
  const lexicalOrdinals = new Set(contract.lexical_concept_ordinals);
  if (fixedOrdinals.size !== contract.fixed_utterance_ordinals.length)
    throw new Error('duplicate fixed-utterance ordinal');
  if (lexicalOrdinals.size !== contract.lexical_concept_ordinals.length)
    throw new Error('duplicate lexical-concept ordinal');
  for (const ordinal of fixedOrdinals)
    if (lexicalOrdinals.has(ordinal))
      throw new Error(`task partition overlaps at source ordinal ${ordinal}`);
  for (const pairing of pairings)
    if (
      !fixedOrdinals.has(pairing.sourceOrdinal) &&
      !lexicalOrdinals.has(pairing.sourceOrdinal)
    )
      throw new Error(
        `task partition omits source ordinal ${pairing.sourceOrdinal}`,
      );
  for (const ordinal of [...fixedOrdinals, ...lexicalOrdinals])
    if (!pairings.some((row) => row.sourceOrdinal === ordinal))
      throw new Error(
        `task partition references absent source ordinal ${ordinal}`,
      );

  const pairAudioByRecord = new Map<string, FiftyWordsTaskAudioAsset[]>();
  for (const asset of audioAssets) {
    if (asset.role !== 'translation_pair') continue;
    if (!asset.sourceRecordId)
      throw new Error(`pair audio lacks source record ID: ${asset.assetId}`);
    const rows = pairAudioByRecord.get(asset.sourceRecordId) ?? [];
    rows.push(asset);
    pairAudioByRecord.set(asset.sourceRecordId, rows);
  }
  for (const pairing of pairings) {
    const assets = pairAudioByRecord.get(pairing.recordId) ?? [];
    if (assets.length !== 3)
      throw new Error(
        `expected three pair audio assets for ${pairing.recordId}, found ${assets.length}`,
      );
    const sourcePaths = [...pairing.audioPaths].sort().join('\n');
    const assetPaths = assets
      .map((asset) => asset.remotePath)
      .sort()
      .join('\n');
    if (sourcePaths !== assetPaths)
      throw new Error(`pair audio path mismatch for ${pairing.recordId}`);
  }
  if (pairAudioByRecord.size !== pairings.length)
    throw new Error('pair audio references an unknown source record');

  const taskDecisions = pairings
    .map((pairing): FiftyWordsTaskDecision => {
      const fixedUtterance = fixedOrdinals.has(pairing.sourceOrdinal);
      const assets = (pairAudioByRecord.get(pairing.recordId) ?? []).sort(
        (left, right) => left.assetId.localeCompare(right.assetId),
      );
      return {
        schemaVersion: 1,
        reviewId: contract.review_id,
        decisionId: `${pairing.recordId}-task-decision-v1`,
        sourceRecordId: pairing.recordId,
        sourceId: pairing.sourceId,
        sourceOrdinal: pairing.sourceOrdinal,
        speakerSource: pairing.speakerSource,
        englishSource: pairing.englishSource,
        englishAlternateSource: pairing.englishAlternateSource,
        wajarriSource: pairing.wajarriSource,
        sourceTaskClass: fixedUtterance
          ? 'fixed_utterance'
          : 'lexical_concept_or_expression',
        taskToken: fixedUtterance
          ? contract.task_tokens.fixed_utterance
          : contract.task_tokens.lexical_concept,
        inputText: `${
          fixedUtterance
            ? contract.task_tokens.fixed_utterance
            : contract.task_tokens.lexical_concept
        } ${pairing.englishSource}`,
        targetText: pairing.wajarriSource,
        sourceSenseStatus: fixedUtterance
          ? 'accepted_exact_source_fixed_utterance'
          : 'accepted_exact_source_lexical_sense',
        dictionaryIntegration: fixedUtterance
          ? 'example_only'
          : 'accepted_source_entry_and_sense',
        directSupervisionEligibility:
          'eligible_noncommercial_after_split_assignment',
        splitAssignment: 'unassigned',
        benchmarkInterpretation: fixedUtterance
          ? 'attested_fixed_utterance_regression_only_if_trained'
          : 'closed_set_reconstruction_only_if_trained',
        sourceIndependenceStatus: 'not_assumed',
        partOfSpeechStatus: 'not_inferred',
        morphologicalAnalysisStatus: 'not_inferred',
        syntheticEligibility: fixedUtterance
          ? 'not_a_productive_template'
          : 'blocked_pending_pos_morphology_and_productive_grammar',
        audioAssetIds: assets.map((asset) => asset.assetId),
        currentDictionaryRelation: pairing.currentDictionaryRelation,
        currentDictionaryMatchIds: pairing.currentDictionaryMatches.map(
          (match) => match.sourceRecordId,
        ),
        claimLimit: fixedUtterance
          ? 'This accepts the exact source utterance pair and audio as a fixed expression. It does not infer segmentation, literal composition, productive grammar, source independence, or an independent benchmark result after training.'
          : 'This accepts the exact source lexical concept or expression, source spelling, and audio. It does not infer part of speech, morphology, unrestricted substitutability, source independence, sentence behavior, or synthetic slot compatibility.',
      };
    })
    .sort((left, right) => left.sourceOrdinal - right.sourceOrdinal);

  const lexicalSenseDecisions = taskDecisions.filter(
    (row) => row.sourceTaskClass === 'lexical_concept_or_expression',
  );
  const fixedUtteranceDecisions = taskDecisions.filter(
    (row) => row.sourceTaskClass === 'fixed_utterance',
  );
  const lexicalGroups = new Map<string, FiftyWordsTaskDecision[]>();
  for (const decision of lexicalSenseDecisions) {
    const key = canonicalText(decision.wajarriSource);
    const rows = lexicalGroups.get(key) ?? [];
    rows.push(decision);
    lexicalGroups.set(key, rows);
  }
  const lexicalSurfaceGroups = [...lexicalGroups.entries()]
    .map(([canonicalSurface, rows]): FiftyWordsLexicalSurfaceGroup => {
      const sorted = rows.sort(
        (left, right) => left.sourceOrdinal - right.sourceOrdinal,
      );
      const surface = sorted[0].wajarriSource;
      return {
        schemaVersion: 1,
        reviewId: contract.review_id,
        lexicalEntryId: `wbv-50words-a39-entry-${shortHash(canonicalSurface)}`,
        formId: `wbv-50words-a39-form-${shortHash(canonicalSurface)}`,
        wajarriSource: surface,
        sourceRecordIds: sorted.map((row) => row.sourceRecordId),
        sourceOrdinals: sorted.map((row) => row.sourceOrdinal),
        englishSourceSenses: sorted.map((row) => row.englishSource),
        senseDecisionIds: sorted.map((row) => row.decisionId),
        speakerSource: sorted[0].speakerSource,
        sourceId: sorted[0].sourceId,
        orthographyStatus: 'accepted_exact_source_spelling',
        partOfSpeechStatus: 'not_inferred',
        morphologicalAnalysisStatus: 'not_inferred',
        syntheticEligibility:
          'blocked_pending_pos_morphology_and_productive_grammar',
      };
    })
    .sort((left, right) =>
      canonicalText(left.wajarriSource).localeCompare(
        canonicalText(right.wajarriSource),
      ),
    );

  const directSupervisionCandidates = taskDecisions.map(
    (decision): FiftyWordsDirectSupervisionCandidate => ({
      schemaVersion: 1,
      reviewId: contract.review_id,
      datasetRecordId: `${decision.sourceRecordId}-direct-supervision-v1`,
      sourceRecordId: decision.sourceRecordId,
      sourceOrdinal: decision.sourceOrdinal,
      taskType:
        decision.sourceTaskClass === 'fixed_utterance'
          ? 'fixed_utterance_translation'
          : 'lexical_reconstruction',
      taskToken: decision.taskToken,
      inputText: decision.inputText,
      targetText: decision.targetText,
      sourceId: decision.sourceId,
      speakerSource: decision.speakerSource,
      license: 'CC BY-NC 4.0',
      commercialUse: 'not_allowed',
      attributionRequired: true,
      splitAssignment: 'unassigned',
      trainingStatus: 'eligible_after_split_assignment',
      benchmarkIndependence: 'not_independent_if_in_training',
      synthetic: false,
      linguisticEvidenceRole: 'direct_source_pair',
      audioAssetIds: decision.audioAssetIds,
    }),
  );
  const pairAudioLinks = taskDecisions.flatMap((decision) =>
    decision.audioAssetIds.map((assetId): FiftyWordsPairAudioLink => {
      const asset = audioAssets.find(
        (candidate) => candidate.assetId === assetId,
      );
      if (!asset) throw new Error(`missing audio asset: ${assetId}`);
      return {
        schemaVersion: 1,
        reviewId: contract.review_id,
        mediaLinkId: `${decision.sourceRecordId}-media-${asset.mediaType.split('/').at(-1)}`,
        sourceRecordId: decision.sourceRecordId,
        assetId,
        archiveRelativePath: asset.archiveRelativePath,
        remoteUrl: asset.remoteUrl,
        mediaType: asset.mediaType,
        speakerSource: decision.speakerSource,
        decodeStatus: 'passed_in_source_archive_audit',
        trainingEligibility: 'eligible_noncommercial_after_split_assignment',
      };
    }),
  );
  assertUnique(pairAudioLinks, (row) => row.mediaLinkId, 'pair media-link ID');

  const report: FiftyWordsTaskReviewResult['report'] = {
    sourcePairings: pairings.length,
    fixedUtterances: fixedUtteranceDecisions.length,
    lexicalSenses: lexicalSenseDecisions.length,
    lexicalSurfaceGroups: lexicalSurfaceGroups.length,
    pairAudioLinks: pairAudioLinks.length,
    directSupervisionCandidates: directSupervisionCandidates.length,
    splitAssignedTrainingRows: 0,
    syntheticEligibleRows: 0,
    productiveGrammarRules: 0,
    exactCurrentHeadwordRows: pairings.filter(
      (row) => row.currentDictionaryRelation !== 'no_exact_current_headword',
    ).length,
    rowsWithoutExactCurrentHeadword: pairings.filter(
      (row) => row.currentDictionaryRelation === 'no_exact_current_headword',
    ).length,
  };
  assertExpectedCounts(report, contract.expected_counts);

  return {
    taskDecisions,
    lexicalSenseDecisions,
    fixedUtteranceDecisions,
    lexicalSurfaceGroups,
    directSupervisionCandidates,
    pairAudioLinks,
    report,
  };
}
