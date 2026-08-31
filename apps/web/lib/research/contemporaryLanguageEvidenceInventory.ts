import { z } from 'zod';

const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/u);
const KeySchema = z.string().regex(/^[a-z0-9][a-z0-9.-]*$/u);

const SourceArtifactSchema = z.object({
  artifact_key: z.string().regex(/^[A-Za-z][A-Za-z0-9]*$/u),
  source_id: z.string().min(1),
  path: z.string().min(1),
  sha256: Sha256Schema,
  media_type: z.enum(['application/pdf', 'image/png']),
  physical_pdf_page: z.number().int().positive().optional(),
  printed_page: z.string().min(1).optional(),
});

const ClosedEvidenceSchema = z.object({
  source_id: z.string().min(1),
  artifact_key: z.string().regex(/^[A-Za-z][A-Za-z0-9]*$/u),
  automatic_acceptance: z.literal(false),
  training_use: z.literal('not_allowed'),
});

const LanguageAttributionStatusSchema = z.enum([
  'explicitly_wajarri',
  'wajarri_context_unqualified',
  'joint_yamaji_and_wajarri',
]);

const LexicalPairingSchema = ClosedEvidenceSchema.extend({
  record_id: KeySchema,
  source_form: z.string().min(1),
  english_gloss_source: z.string().min(1),
  source_quote: z.string().min(1),
  pairing_status: z.literal('explicit_published_pairing'),
  source_independence: z.enum([
    'same_project_corroboration',
    'independence_unknown',
    'independent_source',
  ]),
  pairing_scope: z
    .enum([
      'explicit_lexeme_definition',
      'contextual_nominal_label',
      'visual_attribute_label',
      'cardinal_or_quantifier_label',
    ])
    .optional(),
  language_attribution_status: LanguageAttributionStatusSchema.optional(),
});

const PhraseTranslationPairingSchema = ClosedEvidenceSchema.extend({
  record_id: KeySchema,
  source_text_source: z.string().min(1),
  english_translation_source: z.string().min(1),
  source_quote: z.string().min(1),
  pairing_scope: z.enum(['publication_title', 'section_title']),
  language_attribution_status: LanguageAttributionStatusSchema,
  translation_status: z.literal('explicit_published_whole_phrase_translation'),
  alignment_status: z.literal('whole_phrase_only'),
  source_independence: z.enum([
    'same_project_corroboration',
    'independence_unknown',
    'independent_source',
  ]),
});

const WordBankSchema = ClosedEvidenceSchema.extend({
  record_kind: z.literal('word_bank'),
  record_id: KeySchema,
  section_title_source: z.string().min(1),
  forms_source: z.array(z.string().min(1)).min(1),
  semantic_mapping_status: z.literal('no_semantics_supplied'),
});

const PictureCompletionSchema = ClosedEvidenceSchema.extend({
  record_kind: z.literal('picture_completion'),
  record_id: KeySchema,
  source_mask: z.string().min(1),
  completed_form_source: z.string().min(1),
  picture_prompt_editorial: z.string().min(1),
  mapping_status: z.literal('source_implied_unadjudicated'),
  transcription_status: z.literal('manual_visual_transcription'),
});

const ChantSchema = ClosedEvidenceSchema.extend({
  record_kind: z.literal('chant'),
  record_id: KeySchema,
  title_source: z.string().min(1),
  tune_note_source: z.string().min(1),
  lines_source: z.array(z.string().min(1)).min(1),
  translation_scope: z.literal('parenthetical_action_cues_only'),
  segmentation_status: z.literal('unanalysed_source_text'),
});

const SourceInternalFormConflictSchema = ClosedEvidenceSchema.extend({
  record_kind: z.literal('source_internal_form_conflict'),
  record_id: KeySchema,
  source_forms_source: z.array(z.string().min(1)).min(2),
  source_contexts_source: z.array(z.string().min(1)).min(2),
  conflict_status: z.literal(
    'unresolved_orthographic_or_morphological_relation',
  ),
});

const PedagogicalEvidenceSchema = z.discriminatedUnion('record_kind', [
  WordBankSchema,
  PictureCompletionSchema,
  ChantSchema,
  SourceInternalFormConflictSchema,
]);

const DiscourseClusterSchema = ClosedEvidenceSchema.extend({
  cluster_id: KeySchema,
  title_source: z.string().min(1),
  wajarri_heading_source: z.string().min(1),
  wajarri_paragraphs_source: z.array(z.string().min(1)).min(1),
  english_heading_source: z.string().min(1),
  english_paragraphs_source: z.array(z.string().min(1)).min(1),
  attribution_source: z.string().min(1),
  alignment_status: z.literal('discourse_level_only'),
  speaker_status: z.literal('not_identified'),
  occasion_status: z.literal('not_identified'),
  code_switching_status: z.literal('present'),
  independence_status: z.literal('unresolved'),
});

const ReadingComprehensionQuestionSchema = z.object({
  question_number: z.number().int().positive(),
  question_source: z.string().min(1),
  response_language_source: z.literal('English'),
  answer_supplied: z.literal(false),
  semantic_scope: z.literal('question_constrained_proposition_only'),
  maximum_marks_source: z.number().int().positive().optional(),
});

const ReadingComprehensionClusterSchema = ClosedEvidenceSchema.extend({
  cluster_id: KeySchema,
  title_source: z.string().min(1),
  scientific_name_source: z.string().min(1).optional(),
  wajarri_sentences_source: z.array(z.string().min(1)).min(1),
  attribution_source: z.string().min(1),
  comprehension_questions_source: z
    .array(ReadingComprehensionQuestionSchema)
    .min(1),
  translation_status: z.literal('no_translation_supplied'),
  alignment_status: z.literal('not_applicable_without_translation'),
  segmentation_status: z.literal('orthographic_sentence_boundaries_only'),
  speaker_status: z.literal('not_identified'),
  occasion_status: z.literal('not_identified'),
  variety_status: z.literal('not_identified'),
  code_switching_status: z.literal('not_annotated'),
  independence_status: z.literal('unresolved'),
});

const MarkingKeyQuestionSchema = z.object({
  question_number: z.number().int().positive(),
  question_source: z.string().min(1),
  answer_points_source: z.array(z.string().min(1)).min(1),
  maximum_marks_source: z.number().int().positive(),
});

const DocumentTranslationWitnessSchema = ClosedEvidenceSchema.extend({
  witness_id: KeySchema,
  source_cluster_id: KeySchema,
  source_text_source_id: z.string().min(1),
  translation_heading_source: z.string().min(1),
  title_translation_source: z.string().min(1),
  english_translation_sentences_source: z.array(z.string().min(1)).min(1),
  attribution_source: z.string().min(1),
  page_citation_source: z.string().min(1),
  translation_status: z.literal(
    'official_marking_key_full_document_translation',
  ),
  alignment_status: z.literal('document_level_only'),
  segmentation_status: z.literal('orthographic_sentence_boundaries_only'),
  speaker_status: z.literal('not_identified'),
  translator_status: z.literal('not_identified'),
  variety_status: z.literal('not_identified'),
  independence_status: z.literal('same_attributed_publication_lineage'),
  declared_source_sentence_count: z.number().int().positive(),
  declared_translation_sentence_count: z.number().int().positive(),
  marking_key_questions_source: z.array(MarkingKeyQuestionSchema).min(1),
  task_part_1_marks_source: z.number().int().positive(),
  marking_key_part_1_marks_source: z.number().int().positive(),
  task_part_2_marks_source: z.number().int().positive(),
  marking_key_part_2_marks_source: z.number().int().positive(),
});

export const ContemporaryLanguageEvidenceInventoryContractSchema = z
  .object({
    schema_version: z.literal(1),
    inventory_id: KeySchema,
    created_at_utc: z.string().datetime(),
    language: z.object({
      name: z.string().min(1),
      iso_639_3: z.string().length(3),
      glottocode: z.string().min(1),
    }),
    source_ledger: z.object({
      path: z.string().min(1),
      sha256: Sha256Schema,
    }),
    source_artifacts: z.array(SourceArtifactSchema).min(1),
    lexical_pairings: z.array(LexicalPairingSchema),
    phrase_translation_pairings: z
      .array(PhraseTranslationPairingSchema)
      .optional(),
    pedagogical_evidence: z.array(PedagogicalEvidenceSchema),
    discourse_clusters: z.array(DiscourseClusterSchema),
    reading_comprehension_clusters: z
      .array(ReadingComprehensionClusterSchema)
      .optional(),
    document_translation_witnesses: z
      .array(DocumentTranslationWitnessSchema)
      .optional(),
    expected_counts: z.object({
      lexical_pairings: z.number().int().nonnegative(),
      phrase_translation_pairings: z.number().int().nonnegative().optional(),
      pedagogical_records: z.number().int().nonnegative(),
      picture_completions: z.number().int().nonnegative(),
      discourse_clusters: z.number().int().nonnegative(),
      reading_comprehension_clusters: z.number().int().nonnegative().optional(),
      document_translation_witnesses: z.number().int().nonnegative().optional(),
      assessment_version_conflicts: z.number().int().nonnegative().optional(),
    }),
    release_status: z.literal('not_released'),
    claim_limit: z.string().min(1),
  })
  .superRefine((value, context) => {
    const phraseRowsDeclared = value.phrase_translation_pairings !== undefined;
    const phraseCountDeclared =
      value.expected_counts.phrase_translation_pairings !== undefined;
    if (phraseRowsDeclared !== phraseCountDeclared)
      context.addIssue({
        code: 'custom',
        path: ['phrase_translation_pairings'],
        message:
          'phrase-translation rows and expected count must be declared together',
      });
    const rowsDeclared = value.reading_comprehension_clusters !== undefined;
    const countDeclared =
      value.expected_counts.reading_comprehension_clusters !== undefined;
    if (rowsDeclared !== countDeclared)
      context.addIssue({
        code: 'custom',
        path: ['reading_comprehension_clusters'],
        message:
          'reading-comprehension rows and expected count must be declared together',
      });
    const witnessesDeclared =
      value.document_translation_witnesses !== undefined;
    const witnessCountDeclared =
      value.expected_counts.document_translation_witnesses !== undefined;
    const conflictCountDeclared =
      value.expected_counts.assessment_version_conflicts !== undefined;
    if (
      witnessesDeclared !== witnessCountDeclared ||
      witnessesDeclared !== conflictCountDeclared
    )
      context.addIssue({
        code: 'custom',
        path: ['document_translation_witnesses'],
        message:
          'document-translation rows, witness count, and conflict count must be declared together',
      });
  });

export type ContemporaryLanguageEvidenceInventoryContract = z.infer<
  typeof ContemporaryLanguageEvidenceInventoryContractSchema
>;

const SourceLedgerRowSchema = z
  .object({
    source_id: z.string().min(1),
    training_use: z.literal('not_allowed'),
    redistribution: z.literal('not_allowed'),
    derived_weights: z.literal('not_allowed'),
    hosted_transfer: z.literal('not_allowed'),
  })
  .passthrough();

interface BuildInput {
  contractValue: unknown;
  sourceLedgerRows: unknown[];
}

export interface ContemporaryLanguageEvidenceInventoryResult {
  lexicalPairings: Array<Record<string, unknown>>;
  phraseTranslationPairings: Array<Record<string, unknown>>;
  pedagogicalEvidence: Array<Record<string, unknown>>;
  discourseClusters: Array<Record<string, unknown>>;
  readingComprehensionClusters: Array<Record<string, unknown>>;
  documentTranslationWitnesses: Array<Record<string, unknown>>;
  assessmentVersionConflicts: Array<Record<string, unknown>>;
  report: {
    sourceArtifacts: number;
    sourceLedgerRows: number;
    lexicalPairings: number;
    phraseTranslationPairings?: number;
    wordBanks: number;
    pictureCompletions: number;
    chants: number;
    pedagogicalRecords: number;
    discourseClusters: number;
    readingComprehensionClusters?: number;
    documentTranslationWitnesses?: number;
    assessmentVersionConflicts?: number;
    documentParallelUnits?: number;
    sentenceTranslationBenchmarkUnits?: 0;
    acceptedRows: 0;
    trainingEligibleRows: 0;
  };
}

function assertUnique(values: string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw new Error(`duplicate ${label}: ${value}`);
    seen.add(value);
  }
}

export function buildContemporaryLanguageEvidenceInventory({
  contractValue,
  sourceLedgerRows,
}: BuildInput): ContemporaryLanguageEvidenceInventoryResult {
  const contract =
    ContemporaryLanguageEvidenceInventoryContractSchema.parse(contractValue);
  const readingComprehensionClusters =
    contract.reading_comprehension_clusters ?? [];
  const phraseTranslationPairings = contract.phrase_translation_pairings ?? [];
  const documentTranslationWitnesses =
    contract.document_translation_witnesses ?? [];
  const sourceIdRows = sourceLedgerRows.map((row) =>
    z
      .object({ source_id: z.string().min(1) })
      .passthrough()
      .parse(row),
  );
  assertUnique(
    sourceIdRows.map((row) => row.source_id),
    'source ledger ID',
  );
  const rawSourceById = new Map(
    sourceIdRows.map((row) => [row.source_id, row]),
  );
  const requiredSourceIds = new Set(
    contract.source_artifacts.map((artifact) => artifact.source_id),
  );
  const ledgerRows = [...requiredSourceIds].map((sourceId) => {
    const row = rawSourceById.get(sourceId);
    if (!row) throw new Error(`required source is absent: ${sourceId}`);
    return SourceLedgerRowSchema.parse(row);
  });

  assertUnique(
    contract.source_artifacts.map((artifact) => artifact.artifact_key),
    'source artifact key',
  );
  assertUnique(
    contract.lexical_pairings.map((row) => row.record_id),
    'lexical record ID',
  );
  assertUnique(
    phraseTranslationPairings.map((row) => row.record_id),
    'phrase-translation record ID',
  );
  assertUnique(
    contract.pedagogical_evidence.map((row) => row.record_id),
    'pedagogical record ID',
  );
  assertUnique(
    contract.discourse_clusters.map((row) => row.cluster_id),
    'discourse cluster ID',
  );
  assertUnique(
    readingComprehensionClusters.map((row) => row.cluster_id),
    'reading-comprehension cluster ID',
  );
  assertUnique(
    documentTranslationWitnesses.map((row) => row.witness_id),
    'document-translation witness ID',
  );

  const sourceById = new Map(ledgerRows.map((row) => [row.source_id, row]));
  const artifactByKey = new Map(
    contract.source_artifacts.map((artifact) => [
      artifact.artifact_key,
      artifact,
    ]),
  );
  for (const artifact of contract.source_artifacts)
    if (!sourceById.has(artifact.source_id))
      throw new Error(
        `source artifact ${artifact.artifact_key} references an absent or ineligible source ${artifact.source_id}`,
      );

  const allEvidence = [
    ...contract.lexical_pairings,
    ...phraseTranslationPairings,
    ...contract.pedagogical_evidence,
    ...contract.discourse_clusters,
    ...readingComprehensionClusters,
    ...documentTranslationWitnesses,
  ];
  for (const row of allEvidence) {
    const artifact = artifactByKey.get(row.artifact_key);
    if (!artifact)
      throw new Error(
        `evidence row references unknown artifact ${row.artifact_key}`,
      );
    if (artifact.source_id !== row.source_id)
      throw new Error(
        `evidence/source mismatch for artifact ${row.artifact_key}`,
      );
  }

  const readingClusterById = new Map(
    readingComprehensionClusters.map((row) => [row.cluster_id, row]),
  );
  const questionCorrespondenceByWitness = new Map<
    string,
    Array<Record<string, unknown>>
  >();
  const assessmentVersionConflicts: Array<Record<string, unknown>> = [];
  for (const witness of documentTranslationWitnesses) {
    const sourceCluster = readingClusterById.get(witness.source_cluster_id);
    if (!sourceCluster)
      throw new Error(
        `document translation ${witness.witness_id} references absent reading cluster ${witness.source_cluster_id}`,
      );
    if (sourceCluster.source_id !== witness.source_text_source_id)
      throw new Error(
        `document translation ${witness.witness_id} source-text identity does not match its reading cluster`,
      );
    if (
      sourceCluster.wajarri_sentences_source.length !==
      witness.declared_source_sentence_count
    )
      throw new Error(
        `source sentence count mismatch for ${witness.witness_id}`,
      );
    if (
      witness.english_translation_sentences_source.length !==
      witness.declared_translation_sentence_count
    )
      throw new Error(
        `translation sentence count mismatch for ${witness.witness_id}`,
      );

    assertUnique(
      sourceCluster.comprehension_questions_source.map((row) =>
        row.question_number.toString(),
      ),
      `task question number in ${sourceCluster.cluster_id}`,
    );
    assertUnique(
      witness.marking_key_questions_source.map((row) =>
        row.question_number.toString(),
      ),
      `marking-key question number in ${witness.witness_id}`,
    );
    const taskQuestionByNumber = new Map(
      sourceCluster.comprehension_questions_source.map((row) => [
        row.question_number,
        row,
      ]),
    );
    const correspondence = witness.marking_key_questions_source.map(
      (markingQuestion) => {
        const taskQuestion = taskQuestionByNumber.get(
          markingQuestion.question_number,
        );
        if (!taskQuestion)
          throw new Error(
            `marking-key question ${markingQuestion.question_number} has no task question in ${sourceCluster.cluster_id}`,
          );
        if (taskQuestion.maximum_marks_source === undefined)
          throw new Error(
            `task question ${taskQuestion.question_number} lacks source marks for translation-witness comparison`,
          );
        const questionTextMatches =
          taskQuestion.question_source === markingQuestion.question_source;
        const marksMatch =
          taskQuestion.maximum_marks_source ===
          markingQuestion.maximum_marks_source;
        const relationStatus =
          questionTextMatches && marksMatch
            ? 'exact_question_and_marks_match'
            : questionTextMatches
              ? 'question_matches_marks_conflict'
              : marksMatch
                ? 'question_conflict_marks_match'
                : 'question_and_marks_conflict';
        const row = {
          schemaVersion: 1,
          inventoryId: contract.inventory_id,
          witnessId: witness.witness_id,
          sourceClusterId: sourceCluster.cluster_id,
          questionNumber: markingQuestion.question_number,
          taskQuestionSource: taskQuestion.question_source,
          markingKeyQuestionSource: markingQuestion.question_source,
          taskMaximumMarksSource: taskQuestion.maximum_marks_source,
          markingKeyMaximumMarksSource: markingQuestion.maximum_marks_source,
          answerPointsSource: markingQuestion.answer_points_source,
          relationStatus,
          acceptanceStatus: 'not_accepted',
          trainingEligibility: 'not_allowed',
        };
        if (relationStatus !== 'exact_question_and_marks_match')
          assessmentVersionConflicts.push({
            ...row,
            conflictId: `${witness.witness_id}-question-${markingQuestion.question_number}`,
            conflictStatus: 'unresolved_source_version_conflict',
          });
        return row;
      },
    );
    if (correspondence.length !== taskQuestionByNumber.size)
      throw new Error(
        `question-set cardinality mismatch for ${witness.witness_id}`,
      );
    questionCorrespondenceByWitness.set(witness.witness_id, correspondence);
  }

  const sourceWordBankForms = new Set(
    contract.pedagogical_evidence
      .filter(
        (row): row is z.infer<typeof WordBankSchema> =>
          row.record_kind === 'word_bank',
      )
      .flatMap((row) => row.forms_source.map((form) => form.toLowerCase())),
  );
  for (const row of contract.pedagogical_evidence)
    if (
      row.record_kind === 'picture_completion' &&
      !sourceWordBankForms.has(row.completed_form_source.toLowerCase())
    )
      throw new Error(
        `picture completion ${row.record_id} is absent from every source word bank`,
      );
  for (const row of contract.pedagogical_evidence)
    if (
      row.record_kind === 'source_internal_form_conflict' &&
      row.source_forms_source.length !== row.source_contexts_source.length
    )
      throw new Error(
        `source form and context counts must match for ${row.record_id}`,
      );

  const pictureCompletions = contract.pedagogical_evidence.filter(
    (row) => row.record_kind === 'picture_completion',
  ).length;
  const counts = {
    lexical_pairings: contract.lexical_pairings.length,
    ...(contract.phrase_translation_pairings !== undefined
      ? {
          phrase_translation_pairings: phraseTranslationPairings.length,
        }
      : {}),
    pedagogical_records: contract.pedagogical_evidence.length,
    picture_completions: pictureCompletions,
    discourse_clusters: contract.discourse_clusters.length,
    ...(contract.reading_comprehension_clusters !== undefined
      ? {
          reading_comprehension_clusters: readingComprehensionClusters.length,
        }
      : {}),
    ...(contract.document_translation_witnesses !== undefined
      ? {
          document_translation_witnesses: documentTranslationWitnesses.length,
          assessment_version_conflicts: assessmentVersionConflicts.length,
        }
      : {}),
  };
  for (const [key, actual] of Object.entries(counts)) {
    const expected =
      contract.expected_counts[key as keyof typeof contract.expected_counts];
    if (actual !== expected)
      throw new Error(`count mismatch for ${key}: ${actual} != ${expected}`);
  }

  const evidenceBase = {
    schemaVersion: 1,
    inventoryId: contract.inventory_id,
    acceptanceStatus: 'not_accepted',
    trainingEligibility: 'not_allowed',
  };
  const lexicalPairings = contract.lexical_pairings.map((row) => ({
    ...evidenceBase,
    recordKind: 'explicit_lexical_pairing',
    recordId: row.record_id,
    sourceId: row.source_id,
    sourceArtifact: artifactByKey.get(row.artifact_key),
    sourceForm: row.source_form,
    englishGlossSource: row.english_gloss_source,
    sourceQuote: row.source_quote,
    pairingStatus: row.pairing_status,
    sourceIndependence: row.source_independence,
    ...(row.pairing_scope !== undefined
      ? { pairingScope: row.pairing_scope }
      : {}),
    ...(row.language_attribution_status !== undefined
      ? { languageAttributionStatus: row.language_attribution_status }
      : {}),
    automaticAcceptance: row.automatic_acceptance,
  }));
  const phrasePairings = phraseTranslationPairings.map((row) => ({
    ...evidenceBase,
    recordKind: 'explicit_whole_phrase_translation_pairing',
    recordId: row.record_id,
    sourceId: row.source_id,
    sourceArtifact: artifactByKey.get(row.artifact_key),
    sourceTextSource: row.source_text_source,
    englishTranslationSource: row.english_translation_source,
    sourceQuote: row.source_quote,
    pairingScope: row.pairing_scope,
    languageAttributionStatus: row.language_attribution_status,
    translationStatus: row.translation_status,
    alignmentStatus: row.alignment_status,
    sourceIndependence: row.source_independence,
    automaticAcceptance: row.automatic_acceptance,
    lexicalSegmentationStatus: 'not_inferred',
    phraseBenchmarkUnitCount: 0,
  }));
  const pedagogicalEvidence = contract.pedagogical_evidence.map((row) => {
    const {
      record_id: recordId,
      source_id: sourceId,
      artifact_key: artifactKey,
      automatic_acceptance: automaticAcceptance,
      training_use: sourceTrainingUse,
      ...sourceFields
    } = row;
    return {
      ...evidenceBase,
      ...sourceFields,
      recordId,
      sourceId,
      sourceArtifact: artifactByKey.get(artifactKey),
      automaticAcceptance,
      sourceTrainingUse,
    };
  });
  const discourseClusters = contract.discourse_clusters.map((row) => ({
    ...evidenceBase,
    recordKind: 'coarse_parallel_discourse_cluster',
    clusterId: row.cluster_id,
    sourceId: row.source_id,
    sourceArtifact: artifactByKey.get(row.artifact_key),
    titleSource: row.title_source,
    wajarriHeadingSource: row.wajarri_heading_source,
    wajarriParagraphsSource: row.wajarri_paragraphs_source,
    englishHeadingSource: row.english_heading_source,
    englishParagraphsSource: row.english_paragraphs_source,
    attributionSource: row.attribution_source,
    alignmentStatus: row.alignment_status,
    speakerStatus: row.speaker_status,
    occasionStatus: row.occasion_status,
    codeSwitchingStatus: row.code_switching_status,
    independenceStatus: row.independence_status,
    automaticAcceptance: row.automatic_acceptance,
    benchmarkUnitCount: 1,
  }));
  const readingClusters = readingComprehensionClusters.map((row) => ({
    ...evidenceBase,
    recordKind: 'monolingual_reading_comprehension_cluster',
    clusterId: row.cluster_id,
    sourceId: row.source_id,
    sourceArtifact: artifactByKey.get(row.artifact_key),
    titleSource: row.title_source,
    scientificNameSource: row.scientific_name_source,
    wajarriSentencesSource: row.wajarri_sentences_source,
    attributionSource: row.attribution_source,
    comprehensionQuestionsSource: row.comprehension_questions_source,
    translationStatus: row.translation_status,
    alignmentStatus: row.alignment_status,
    segmentationStatus: row.segmentation_status,
    speakerStatus: row.speaker_status,
    occasionStatus: row.occasion_status,
    varietyStatus: row.variety_status,
    codeSwitchingStatus: row.code_switching_status,
    independenceStatus: row.independence_status,
    automaticAcceptance: row.automatic_acceptance,
    translationBenchmarkUnitCount: 0,
  }));
  const translationWitnesses = documentTranslationWitnesses.map((row) => ({
    ...evidenceBase,
    recordKind: 'official_document_translation_witness',
    witnessId: row.witness_id,
    sourceId: row.source_id,
    sourceArtifact: artifactByKey.get(row.artifact_key),
    sourceClusterId: row.source_cluster_id,
    sourceTextSourceId: row.source_text_source_id,
    translationHeadingSource: row.translation_heading_source,
    titleTranslationSource: row.title_translation_source,
    englishTranslationSentencesSource: row.english_translation_sentences_source,
    attributionSource: row.attribution_source,
    pageCitationSource: row.page_citation_source,
    translationStatus: row.translation_status,
    alignmentStatus: row.alignment_status,
    segmentationStatus: row.segmentation_status,
    speakerStatus: row.speaker_status,
    translatorStatus: row.translator_status,
    varietyStatus: row.variety_status,
    independenceStatus: row.independence_status,
    sourceSentenceCount: row.declared_source_sentence_count,
    translationSentenceCount: row.declared_translation_sentence_count,
    questionCorrespondence:
      questionCorrespondenceByWitness.get(row.witness_id) ?? [],
    taskPart1MarksSource: row.task_part_1_marks_source,
    markingKeyPart1MarksSource: row.marking_key_part_1_marks_source,
    taskPart2MarksSource: row.task_part_2_marks_source,
    markingKeyPart2MarksSource: row.marking_key_part_2_marks_source,
    automaticAcceptance: row.automatic_acceptance,
    documentParallelUnitCount: 1,
    sentenceTranslationBenchmarkUnitCount: 0,
  }));

  return {
    lexicalPairings,
    phraseTranslationPairings: phrasePairings,
    pedagogicalEvidence,
    discourseClusters,
    readingComprehensionClusters: readingClusters,
    documentTranslationWitnesses: translationWitnesses,
    assessmentVersionConflicts,
    report: {
      sourceArtifacts: contract.source_artifacts.length,
      sourceLedgerRows: new Set(
        contract.source_artifacts.map((artifact) => artifact.source_id),
      ).size,
      lexicalPairings: lexicalPairings.length,
      ...(contract.phrase_translation_pairings !== undefined
        ? { phraseTranslationPairings: phrasePairings.length }
        : {}),
      wordBanks: contract.pedagogical_evidence.filter(
        (row) => row.record_kind === 'word_bank',
      ).length,
      pictureCompletions,
      chants: contract.pedagogical_evidence.filter(
        (row) => row.record_kind === 'chant',
      ).length,
      pedagogicalRecords: pedagogicalEvidence.length,
      discourseClusters: discourseClusters.length,
      ...(contract.reading_comprehension_clusters !== undefined
        ? { readingComprehensionClusters: readingClusters.length }
        : {}),
      ...(contract.document_translation_witnesses !== undefined
        ? {
            documentTranslationWitnesses: translationWitnesses.length,
            assessmentVersionConflicts: assessmentVersionConflicts.length,
            documentParallelUnits: translationWitnesses.length,
            sentenceTranslationBenchmarkUnits: 0 as const,
          }
        : {}),
      acceptedRows: 0,
      trainingEligibleRows: 0,
    },
  };
}
