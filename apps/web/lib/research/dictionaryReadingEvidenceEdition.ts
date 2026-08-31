import { z } from 'zod';

const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/u);
const KeySchema = z.string().regex(/^[a-z0-9][a-z0-9.-]*$/u);
const ComponentReferenceSchema = z.object({
  path: z.string().min(1),
  sha256: Sha256Schema,
  rows: z.number().int().nonnegative(),
});

const ObservationSchema = z.object({
  observation_id: KeySchema,
  cluster_id: KeySchema,
  source_form: z.string().min(1),
  scientific_name_source: z.string().min(1),
  english_context_label_source: z.string().min(1),
  source_form_occurrence_sentence_numbers: z
    .array(z.number().int().positive())
    .min(1),
  supporting_question_numbers: z.array(z.number().int().positive()).min(1),
  relation_status: z.literal('document_context_only'),
  automatic_acceptance: z.literal(false),
  training_use: z.literal('not_allowed'),
});

const TitleTranslationObservationSchema = z.object({
  observation_id: KeySchema,
  cluster_id: KeySchema,
  witness_id: KeySchema,
  source_form: z.string().min(1),
  scientific_name_source: z.string().min(1),
  english_translation_source: z.string().min(1),
  relation_status: z.literal('source_attested_title_translation'),
  automatic_acceptance: z.literal(false),
  training_use: z.literal('not_allowed'),
});

export const DictionaryReadingEvidenceContractSchema = z
  .object({
    schema_version: z.literal(1),
    edition_id: KeySchema,
    parent_edition_id: KeySchema,
    created_at_utc: z.string().datetime(),
    status: z.literal('reading_context_evidence_expansion'),
    scope: z.object({
      language: z.string().min(1),
      iso_639_3: z.string().length(3),
      glottocode: z.string().min(1),
      variety: z.string().min(1),
      orthographies: z.array(z.string().min(1)).min(1),
    }),
    parent_manifest: z.object({
      path: z.string().min(1),
      sha256: Sha256Schema,
    }),
    evidence_inventory: z.object({
      inventory_id: KeySchema,
      manifest_path: z.string().min(1),
      manifest_sha256: Sha256Schema,
      reading_component_key: z.literal('readingComprehensionClusters'),
      translation_witness_component_key: z
        .literal('documentTranslationWitnesses')
        .optional(),
    }),
    current_dictionary_source_id: z.string().min(1),
    source_ledger: z.object({ path: z.string().min(1), sha256: Sha256Schema }),
    change_ledger: z.object({
      path: z.string().min(1),
      sha256: Sha256Schema,
      issuing_change_id: KeySchema,
      accepted_change_ids: z.array(KeySchema),
    }),
    observations: z.array(ObservationSchema),
    title_translation_observations: z
      .array(TitleTranslationObservationSchema)
      .optional(),
    expected_counts: z.object({
      reading_clusters: z.number().int().nonnegative(),
      evidence_links: z.number().int().nonnegative(),
      exact_current_headword_links: z.number().int().nonnegative(),
      related_prompt_groups: z.number().int().nonnegative(),
      added_review_items: z.number().int().nonnegative(),
      title_translation_witnesses: z.number().int().nonnegative().optional(),
      title_translation_evidence_links: z
        .number()
        .int()
        .nonnegative()
        .optional(),
      title_translation_related_prompt_groups: z
        .number()
        .int()
        .nonnegative()
        .optional(),
      added_title_translation_review_items: z
        .number()
        .int()
        .nonnegative()
        .optional(),
    }),
    current_pointer_path: z.string().min(1),
    supersedes_pointer_sha256: Sha256Schema,
    release_status: z.literal('not_released'),
    claim_limit: z.string().min(1),
  })
  .superRefine((contract, context) => {
    const titleObservations = contract.title_translation_observations ?? [];
    if (contract.observations.length + titleObservations.length === 0)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'at least one reading or title-translation observation is required',
      });
    if (
      titleObservations.length > 0 &&
      !contract.evidence_inventory.translation_witness_component_key
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'title-translation observations require a translation witness component',
      });
  });

export type DictionaryReadingEvidenceContract = z.infer<
  typeof DictionaryReadingEvidenceContractSchema
>;

const ParentManifestSchema = z.object({
  edition_id: KeySchema,
  components: z.record(z.string(), ComponentReferenceSchema),
  counts: z
    .object({
      acceptedLexicalRows: z.literal(0),
      trainingEligibleRows: z.literal(0),
    })
    .passthrough(),
});

const InventoryManifestSchema = z.object({
  inventory_id: KeySchema,
  components: z.record(z.string(), ComponentReferenceSchema),
  validation: z.object({
    reading_comprehension_clusters: z.number().int().positive(),
    document_translation_witnesses: z.number().int().nonnegative().optional(),
    accepted_rows: z.literal(0),
    training_eligible_rows: z.literal(0),
  }),
});

const QuestionSchema = z.object({
  question_number: z.number().int().positive(),
  question_source: z.string().min(1),
  response_language_source: z.literal('English'),
  answer_supplied: z.literal(false),
  semantic_scope: z.literal('question_constrained_proposition_only'),
});

const ReadingClusterSchema = z
  .object({
    schemaVersion: z.literal(1),
    inventoryId: KeySchema,
    clusterId: KeySchema,
    sourceId: z.string().min(1),
    sourceArtifact: z
      .object({ path: z.string().min(1), sha256: Sha256Schema })
      .passthrough(),
    titleSource: z.string().min(1),
    scientificNameSource: z.string().min(1),
    wajarriSentencesSource: z.array(z.string().min(1)).min(1),
    comprehensionQuestionsSource: z.array(QuestionSchema).min(1),
    translationStatus: z.literal('no_translation_supplied'),
    translationBenchmarkUnitCount: z.literal(0),
    acceptanceStatus: z.literal('not_accepted'),
    trainingEligibility: z.literal('not_allowed'),
  })
  .passthrough();

const DocumentTranslationWitnessSchema = z
  .object({
    schemaVersion: z.literal(1),
    inventoryId: KeySchema,
    witnessId: KeySchema,
    sourceId: z.string().min(1),
    sourceArtifact: z
      .object({ path: z.string().min(1), sha256: Sha256Schema })
      .passthrough(),
    sourceClusterId: KeySchema,
    sourceTextSourceId: z.string().min(1),
    titleTranslationSource: z.string().min(1),
    translationStatus: z.literal(
      'official_marking_key_full_document_translation',
    ),
    documentParallelUnitCount: z.literal(1),
    sentenceTranslationBenchmarkUnitCount: z.literal(0),
    acceptanceStatus: z.literal('not_accepted'),
    trainingEligibility: z.literal('not_allowed'),
  })
  .passthrough();

const EntrySchema = z
  .object({
    entryCandidateId: z.string().min(1),
    sourceId: z.string().min(1),
    headwordComparison: z.string().min(1),
  })
  .passthrough();

const SenseSchema = z
  .object({
    senseCandidateId: z.string().min(1),
    entryCandidateId: z.string().min(1),
  })
  .passthrough();

const PromptGroupSchema = z
  .object({
    promptGroupId: z.string().min(1),
    sourcePromptComparison: z.string().min(1),
    acceptedReferences: z.array(z.string().min(1)).min(1),
    sourceRecordIds: z.array(z.string().min(1)).min(1),
    semanticTranslationAccepted: z.literal(false),
    trainingEligibility: z.literal('not_allowed'),
  })
  .passthrough();

const ReviewSchema = z
  .object({ reviewItemId: z.string().min(1) })
  .passthrough();

interface BuildInput {
  contractValue: unknown;
  parentManifestValue: unknown;
  inventoryManifestValue: unknown;
  readingClusterRows: unknown[];
  documentTranslationWitnessRows?: unknown[];
  parentEntries: unknown[];
  parentSenses: unknown[];
  parentPromptGroups: unknown[];
  parentReviewQueue: unknown[];
  changeLedgerRows: Array<Record<string, unknown>>;
}

function normalize(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('en').trim();
}

function tokens(value: string): string[] {
  return (value.normalize('NFKC').match(/[\p{L}\p{M}\p{N}]+/gu) ?? []).map(
    normalize,
  );
}

function containsTokenSequence(text: string, phrase: string): boolean {
  const textTokens = tokens(text);
  const phraseTokens = tokens(phrase);
  if (phraseTokens.length === 0 || phraseTokens.length > textTokens.length)
    return false;
  return textTokens.some((_, start) =>
    phraseTokens.every((token, offset) => textTokens[start + offset] === token),
  );
}

function assertUnique(values: string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw new Error(`duplicate ${label}: ${value}`);
    seen.add(value);
  }
}

export function buildDictionaryReadingEvidenceEdition({
  contractValue,
  parentManifestValue,
  inventoryManifestValue,
  readingClusterRows,
  documentTranslationWitnessRows = [],
  parentEntries,
  parentSenses,
  parentPromptGroups,
  parentReviewQueue,
  changeLedgerRows,
}: BuildInput) {
  const contract = DictionaryReadingEvidenceContractSchema.parse(contractValue);
  const parent = ParentManifestSchema.parse(parentManifestValue);
  const inventory = InventoryManifestSchema.parse(inventoryManifestValue);
  const clusters = z.array(ReadingClusterSchema).parse(readingClusterRows);
  const witnesses = z
    .array(DocumentTranslationWitnessSchema)
    .parse(documentTranslationWitnessRows);
  const entries = z.array(EntrySchema).parse(parentEntries);
  const senses = z.array(SenseSchema).parse(parentSenses);
  const promptGroups = z.array(PromptGroupSchema).parse(parentPromptGroups);
  const reviews = z.array(ReviewSchema).parse(parentReviewQueue);

  if (parent.edition_id !== contract.parent_edition_id)
    throw new Error('parent edition ID does not match the contract');
  if (inventory.inventory_id !== contract.evidence_inventory.inventory_id)
    throw new Error('evidence inventory ID does not match the contract');
  if (inventory.validation.reading_comprehension_clusters !== clusters.length)
    throw new Error('reading cluster count does not match its manifest');
  if (
    inventory.validation.document_translation_witnesses !== undefined &&
    inventory.validation.document_translation_witnesses !== witnesses.length
  )
    throw new Error(
      'document translation witness count does not match its manifest',
    );
  const change = changeLedgerRows.find(
    (row) => row.change_id === contract.change_ledger.issuing_change_id,
  );
  if (
    !change ||
    change.new_edition_id !== contract.edition_id ||
    change.parent_edition_id !== contract.parent_edition_id ||
    change.status !== 'candidate'
  )
    throw new Error('issuing dictionary change has the wrong lineage');

  const titleTranslationObservations =
    contract.title_translation_observations ?? [];
  assertUnique(
    [
      ...contract.observations.map((row) => row.observation_id),
      ...titleTranslationObservations.map((row) => row.observation_id),
    ],
    'observation ID',
  );
  assertUnique(
    clusters.map((row) => row.clusterId),
    'reading cluster ID',
  );
  assertUnique(
    reviews.map((row) => row.reviewItemId),
    'parent review item ID',
  );
  assertUnique(
    witnesses.map((row) => row.witnessId),
    'document translation witness ID',
  );

  const resolveDictionaryRelation = (
    sourceForm: string,
    englishLabel: string,
  ) => {
    const currentEntries = entries.filter(
      (entry) =>
        entry.sourceId === contract.current_dictionary_source_id &&
        normalize(entry.headwordComparison) === normalize(sourceForm),
    );
    if (currentEntries.length !== 1)
      throw new Error(
        `source form ${sourceForm} has ${currentEntries.length} exact current headword candidates`,
      );
    const currentEntry = currentEntries[0];
    const candidateSenseIds = senses
      .filter(
        (sense) => sense.entryCandidateId === currentEntry.entryCandidateId,
      )
      .map((sense) => sense.senseCandidateId)
      .sort();
    if (candidateSenseIds.length === 0)
      throw new Error(
        `current entry has no senses: ${currentEntry.entryCandidateId}`,
      );
    const relatedPromptGroups = promptGroups.filter(
      (group) =>
        normalize(group.sourcePromptComparison) === normalize(englishLabel),
    );
    if (relatedPromptGroups.length === 0)
      throw new Error(`no current prompt group matches ${englishLabel}`);
    if (
      !relatedPromptGroups.some((group) =>
        group.acceptedReferences.some(
          (reference) => normalize(reference) === normalize(sourceForm),
        ),
      )
    )
      throw new Error(
        `source form is absent from related prompt references: ${sourceForm}`,
      );
    return {
      currentEntry,
      candidateSenseIds,
      relatedPromptGroups: relatedPromptGroups.map((group) => ({
        promptGroupId: group.promptGroupId,
        sourceRecordIds: group.sourceRecordIds,
        recordedTargetCandidates: group.acceptedReferences,
      })),
    };
  };

  const evidenceLinks = contract.observations.map((observation) => {
    const cluster = clusters.find(
      (candidate) => candidate.clusterId === observation.cluster_id,
    );
    if (!cluster)
      throw new Error(
        `observation references an absent cluster: ${observation.cluster_id}`,
      );
    if (cluster.inventoryId !== inventory.inventory_id)
      throw new Error(`cluster has the wrong inventory: ${cluster.clusterId}`);
    if (
      normalize(cluster.scientificNameSource) !==
        normalize(observation.scientific_name_source) ||
      !containsTokenSequence(cluster.titleSource, observation.source_form) ||
      !containsTokenSequence(
        cluster.titleSource,
        observation.scientific_name_source,
      )
    )
      throw new Error(
        `observation/title mismatch: ${observation.observation_id}`,
      );

    const sentenceNumbers = [
      ...new Set(observation.source_form_occurrence_sentence_numbers),
    ].sort((left, right) => left - right);
    if (
      sentenceNumbers.length !==
      observation.source_form_occurrence_sentence_numbers.length
    )
      throw new Error(
        `duplicate sentence number: ${observation.observation_id}`,
      );
    const sentenceOccurrences = sentenceNumbers.map((sentenceNumber) => {
      const sentence = cluster.wajarriSentencesSource[sentenceNumber - 1];
      if (!sentence)
        throw new Error(
          `sentence number is outside the cluster: ${sentenceNumber}`,
        );
      if (!containsTokenSequence(sentence, observation.source_form))
        throw new Error(
          `source form is absent from declared sentence ${sentenceNumber}`,
        );
      return { sentenceNumber, sentenceSource: sentence };
    });

    const questionNumbers = [
      ...new Set(observation.supporting_question_numbers),
    ].sort((left, right) => left - right);
    if (
      questionNumbers.length !== observation.supporting_question_numbers.length
    )
      throw new Error(
        `duplicate question number: ${observation.observation_id}`,
      );
    const supportingQuestions = questionNumbers.map((questionNumber) => {
      const question = cluster.comprehensionQuestionsSource.find(
        (candidate) => candidate.question_number === questionNumber,
      );
      if (!question)
        throw new Error(`supporting question is absent: ${questionNumber}`);
      if (
        !containsTokenSequence(
          question.question_source,
          observation.english_context_label_source,
        )
      )
        throw new Error(
          `English context label is absent from question ${questionNumber}`,
        );
      return question;
    });

    const { currentEntry, candidateSenseIds, relatedPromptGroups } =
      resolveDictionaryRelation(
        observation.source_form,
        observation.english_context_label_source,
      );

    return {
      schemaVersion: 1,
      evidenceLinkId: `${observation.observation_id}-dictionary-link`,
      observationId: observation.observation_id,
      inventoryId: inventory.inventory_id,
      clusterId: cluster.clusterId,
      evidenceSourceId: cluster.sourceId,
      sourceArtifact: cluster.sourceArtifact,
      sourceForm: observation.source_form,
      scientificNameSource: observation.scientific_name_source,
      englishContextLabelSource: observation.english_context_label_source,
      sourceFormSentenceOccurrences: sentenceOccurrences,
      supportingQuestions,
      exactCurrentEntryCandidateId: currentEntry.entryCandidateId,
      candidateSenseIds,
      relatedPromptGroups,
      evidenceRelationStatus: observation.relation_status,
      lexicalIdentityStatus: 'unadjudicated',
      speciesScopeStatus: 'unadjudicated',
      synonymyStatus: 'unadjudicated',
      substitutabilityStatus: 'unadjudicated',
      automaticAcceptance: observation.automatic_acceptance,
      acceptanceStatus: 'not_accepted',
      trainingEligibility: observation.training_use,
    };
  });

  const titleTranslationEvidenceLinks = titleTranslationObservations.map(
    (observation) => {
      const cluster = clusters.find(
        (candidate) => candidate.clusterId === observation.cluster_id,
      );
      if (!cluster)
        throw new Error(
          `title observation references an absent cluster: ${observation.cluster_id}`,
        );
      const witness = witnesses.find(
        (candidate) => candidate.witnessId === observation.witness_id,
      );
      if (!witness)
        throw new Error(
          `title observation references an absent witness: ${observation.witness_id}`,
        );
      if (
        cluster.inventoryId !== inventory.inventory_id ||
        witness.inventoryId !== inventory.inventory_id ||
        witness.sourceClusterId !== cluster.clusterId ||
        witness.sourceTextSourceId !== cluster.sourceId
      )
        throw new Error(
          `title observation has inconsistent inventory lineage: ${observation.observation_id}`,
        );
      if (
        !containsTokenSequence(cluster.titleSource, observation.source_form) ||
        !containsTokenSequence(
          cluster.titleSource,
          observation.scientific_name_source,
        ) ||
        normalize(cluster.scientificNameSource) !==
          normalize(observation.scientific_name_source) ||
        normalize(witness.titleTranslationSource) !==
          normalize(observation.english_translation_source)
      )
        throw new Error(
          `title observation does not match its source witnesses: ${observation.observation_id}`,
        );
      const { currentEntry, candidateSenseIds, relatedPromptGroups } =
        resolveDictionaryRelation(
          observation.source_form,
          observation.english_translation_source,
        );
      return {
        schemaVersion: 1,
        evidenceLinkId: `${observation.observation_id}-dictionary-link`,
        observationId: observation.observation_id,
        inventoryId: inventory.inventory_id,
        clusterId: cluster.clusterId,
        witnessId: witness.witnessId,
        sourceTextSourceId: cluster.sourceId,
        sourceTextArtifact: cluster.sourceArtifact,
        evidenceSourceId: witness.sourceId,
        evidenceSourceArtifact: witness.sourceArtifact,
        sourceTitle: cluster.titleSource,
        sourceForm: observation.source_form,
        scientificNameSource: observation.scientific_name_source,
        titleTranslationSource: witness.titleTranslationSource,
        translationStatus: witness.translationStatus,
        documentParallelUnitCount: witness.documentParallelUnitCount,
        sentenceTranslationBenchmarkUnitCount:
          witness.sentenceTranslationBenchmarkUnitCount,
        exactCurrentEntryCandidateId: currentEntry.entryCandidateId,
        candidateSenseIds,
        relatedPromptGroups,
        evidenceRelationStatus: observation.relation_status,
        semanticRelationScope: 'source_document_title_only',
        lexicalIdentityStatus: 'unadjudicated',
        speciesScopeStatus: 'unadjudicated',
        synonymyStatus: 'unadjudicated',
        substitutabilityStatus: 'unadjudicated',
        automaticAcceptance: observation.automatic_acceptance,
        acceptanceStatus: 'not_accepted',
        trainingEligibility: observation.training_use,
      };
    },
  );

  const addedReviews = evidenceLinks.map((link) => ({
    schemaVersion: 1,
    reviewItemId: `${link.observationId}-reading-context-review`,
    reviewKind: 'reading_context_to_dictionary_relation',
    evidenceLinkId: link.evidenceLinkId,
    sourceForm: link.sourceForm,
    scientificNameSource: link.scientificNameSource,
    englishContextLabelSource: link.englishContextLabelSource,
    currentEntryCandidateId: link.exactCurrentEntryCandidateId,
    candidateSenseIds: link.candidateSenseIds,
    relatedPromptGroups: link.relatedPromptGroups,
    questions: [
      'Does the source support lexical identity, a species-specific sense, a generic label, or only document-level co-reference?',
      'What relation, if any, holds among every recorded target in the matching English prompt group?',
      'What variety, register, orthography, part of speech, and substitutability scope are supported?',
      'Is the source independent of the current dictionary lineage, and what uses do its rights permit?',
    ],
    automaticDecisionAllowed: false,
    status: 'pending',
    trainingEligibility: 'not_allowed',
  }));
  const addedTitleTranslationReviews = titleTranslationEvidenceLinks.map(
    (link) => ({
      schemaVersion: 1,
      reviewItemId: `${link.observationId}-title-translation-review`,
      reviewKind: 'source_attested_title_translation_to_dictionary_relation',
      evidenceLinkId: link.evidenceLinkId,
      sourceForm: link.sourceForm,
      scientificNameSource: link.scientificNameSource,
      titleTranslationSource: link.titleTranslationSource,
      currentEntryCandidateId: link.exactCurrentEntryCandidateId,
      candidateSenseIds: link.candidateSenseIds,
      relatedPromptGroups: link.relatedPromptGroups,
      questions: [
        'Does the explicit document-title translation establish a dictionary sense, a species-specific label, a generic label, or only title-level equivalence in this source?',
        'What relation holds between Thumbuny and every other recorded Wajarri candidate for sandalwood, including birdilyba?',
        'Which variety, register, orthography, part of speech, botanical scope, and substitutability conditions are supported?',
        'Is the marking-key witness independent of the current dictionary lineage, and what uses do the source rights permit?',
      ],
      automaticDecisionAllowed: false,
      status: 'pending',
      trainingEligibility: 'not_allowed',
    }),
  );
  assertUnique(
    [
      ...reviews.map((row) => row.reviewItemId),
      ...addedReviews.map((row) => row.reviewItemId),
      ...addedTitleTranslationReviews.map((row) => row.reviewItemId),
    ],
    'combined review item ID',
  );

  const relatedPromptGroupCount = new Set(
    evidenceLinks.flatMap((link) =>
      link.relatedPromptGroups.map((group) => group.promptGroupId),
    ),
  ).size;
  const titleTranslationRelatedPromptGroupCount = new Set(
    titleTranslationEvidenceLinks.flatMap((link) =>
      link.relatedPromptGroups.map((group) => group.promptGroupId),
    ),
  ).size;
  const actual = {
    reading_clusters: clusters.length,
    evidence_links: evidenceLinks.length,
    exact_current_headword_links: evidenceLinks.length,
    related_prompt_groups: relatedPromptGroupCount,
    added_review_items: addedReviews.length,
    title_translation_witnesses: witnesses.length,
    title_translation_evidence_links: titleTranslationEvidenceLinks.length,
    title_translation_related_prompt_groups:
      titleTranslationRelatedPromptGroupCount,
    added_title_translation_review_items: addedTitleTranslationReviews.length,
  };
  for (const [key, expected] of Object.entries(contract.expected_counts)) {
    const observed = actual[key as keyof typeof actual];
    if (observed !== expected)
      throw new Error(
        `expected count mismatch for ${key}: ${observed} != ${expected}`,
      );
  }

  return {
    reviewQueue: [...reviews, ...addedReviews, ...addedTitleTranslationReviews],
    readingContextEvidenceLinks: evidenceLinks,
    titleTranslationEvidenceLinks,
    report: {
      readingClusters: clusters.length,
      evidenceLinks: evidenceLinks.length,
      exactCurrentHeadwordLinks: evidenceLinks.length,
      relatedPromptGroups: relatedPromptGroupCount,
      inheritedReviewItems: reviews.length,
      addedReviewItems: addedReviews.length,
      titleTranslationWitnesses: witnesses.length,
      titleTranslationEvidenceLinks: titleTranslationEvidenceLinks.length,
      titleTranslationRelatedPromptGroups:
        titleTranslationRelatedPromptGroupCount,
      addedTitleTranslationReviewItems: addedTitleTranslationReviews.length,
      totalReviewItems:
        reviews.length +
        addedReviews.length +
        addedTitleTranslationReviews.length,
      acceptedLexicalRows: 0 as const,
      trainingEligibleRows: 0 as const,
    },
  };
}
