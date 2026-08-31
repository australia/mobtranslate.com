import { z } from 'zod';

const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/u);
const KeySchema = z.string().regex(/^[a-z0-9][a-z0-9.-]*$/u);
const ComponentReferenceSchema = z.object({
  path: z.string().min(1),
  sha256: Sha256Schema,
  rows: z.number().int().nonnegative(),
});

export const DictionaryAttestedEvidenceContractSchema = z.object({
  schema_version: z.literal(1),
  edition_id: KeySchema,
  parent_edition_id: KeySchema,
  created_at_utc: z.string().datetime(),
  status: z.literal('attested_source_evidence_expansion'),
  scope: z.object({
    language: z.string().min(1),
    iso_639_3: z.string().length(3),
    glottocode: z.string().min(1),
    variety: z.string().min(1),
    orthographies: z.array(z.string().min(1)).min(1),
  }),
  parent_manifest: z.object({ path: z.string().min(1), sha256: Sha256Schema }),
  evidence_inventory: z.object({
    inventory_id: KeySchema,
    manifest_path: z.string().min(1),
    manifest_sha256: Sha256Schema,
    lexical_component_key: z.literal('lexicalPairings'),
    phrase_translation_component_key: z
      .literal('phraseTranslationPairings')
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
  review_candidate_limit: z.number().int().min(1).max(20),
  expected_counts: z.object({
    lexical_evidence_links: z.number().int().nonnegative(),
    phrase_translation_evidence_links: z.number().int().nonnegative(),
    unique_exact_current_headwords: z.number().int().nonnegative(),
    multiple_exact_current_headwords: z.number().int().nonnegative(),
    no_exact_current_headwords: z.number().int().nonnegative(),
    added_lexical_review_items: z.number().int().nonnegative(),
    added_phrase_review_items: z.number().int().nonnegative(),
  }),
  current_pointer_path: z.string().min(1),
  supersedes_pointer_sha256: Sha256Schema,
  release_status: z.literal('not_released'),
  claim_limit: z.string().min(1),
});

export type DictionaryAttestedEvidenceContract = z.infer<
  typeof DictionaryAttestedEvidenceContractSchema
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
    lexical_pairings: z.number().int().nonnegative(),
    phrase_translation_pairings: z.number().int().nonnegative().optional(),
    accepted_rows: z.literal(0),
    training_eligible_rows: z.literal(0),
  }),
});

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
    translationSource: z.string().min(1).nullable().optional(),
    translationComparison: z.string().min(1).nullable().optional(),
    definitionSource: z.string().min(1).nullable().optional(),
  })
  .passthrough();

const ReviewSchema = z
  .object({ reviewItemId: z.string().min(1) })
  .passthrough();
const ExistingPublishedEvidenceSchema = z
  .object({ evidenceLinkId: z.string().min(1) })
  .passthrough();
const ExistingPhraseEvidenceSchema = z
  .object({ evidenceLinkId: z.string().min(1) })
  .passthrough();

const LexicalPairingSchema = z
  .object({
    inventoryId: KeySchema,
    recordId: KeySchema,
    sourceId: z.string().min(1),
    sourceForm: z.string().min(1),
    englishGlossSource: z.string().min(1),
    sourceQuote: z.string().min(1),
    pairingStatus: z.literal('explicit_published_pairing'),
    pairingScope: z.enum([
      'explicit_lexeme_definition',
      'contextual_nominal_label',
      'visual_attribute_label',
      'cardinal_or_quantifier_label',
    ]),
    languageAttributionStatus: z.enum([
      'explicitly_wajarri',
      'wajarri_context_unqualified',
      'joint_yamaji_and_wajarri',
    ]),
    sourceIndependence: z.string().min(1),
    automaticAcceptance: z.literal(false),
    acceptanceStatus: z.literal('not_accepted'),
    trainingEligibility: z.literal('not_allowed'),
  })
  .passthrough();

const PhrasePairingSchema = z
  .object({
    inventoryId: KeySchema,
    recordId: KeySchema,
    sourceId: z.string().min(1),
    sourceTextSource: z.string().min(1),
    englishTranslationSource: z.string().min(1),
    sourceQuote: z.string().min(1),
    pairingScope: z.enum(['publication_title', 'section_title']),
    languageAttributionStatus: z.enum([
      'explicitly_wajarri',
      'wajarri_context_unqualified',
      'joint_yamaji_and_wajarri',
    ]),
    translationStatus: z.literal('explicit_published_whole_phrase_translation'),
    alignmentStatus: z.literal('whole_phrase_only'),
    sourceIndependence: z.string().min(1),
    lexicalSegmentationStatus: z.literal('not_inferred'),
    phraseBenchmarkUnitCount: z.literal(0),
    automaticAcceptance: z.literal(false),
    acceptanceStatus: z.literal('not_accepted'),
    trainingEligibility: z.literal('not_allowed'),
  })
  .passthrough();

interface BuildInput {
  contractValue: unknown;
  parentManifestValue: unknown;
  inventoryManifestValue: unknown;
  parentEntries: unknown[];
  parentSenses: unknown[];
  parentReviewQueue: unknown[];
  inheritedPublishedEvidenceLinks?: unknown[];
  inheritedPhraseTranslationEvidenceLinks?: unknown[];
  lexicalPairingRows: unknown[];
  phraseTranslationPairingRows?: unknown[];
  changeLedgerRows: Array<Record<string, unknown>>;
}

export interface DictionaryAttestedEvidenceResult {
  reviewQueue: Array<Record<string, unknown>>;
  publishedEvidenceLinks: Array<Record<string, unknown>>;
  phraseTranslationEvidenceLinks: Array<Record<string, unknown>>;
  report: {
    inheritedReviewItems: number;
    addedLexicalReviewItems: number;
    addedPhraseReviewItems: number;
    totalReviewItems: number;
    inheritedPublishedEvidenceLinks: number;
    addedLexicalEvidenceLinks: number;
    totalPublishedEvidenceLinks: number;
    inheritedPhraseTranslationEvidenceLinks: number;
    addedPhraseTranslationEvidenceLinks: number;
    totalPhraseTranslationEvidenceLinks: number;
    uniqueExactCurrentHeadwords: number;
    multipleExactCurrentHeadwords: number;
    noExactCurrentHeadwords: number;
    acceptedLexicalRows: 0;
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

function normalize(value: string): string {
  return value.normalize('NFKC').toLowerCase().trim().replace(/\s+/gu, ' ');
}

function comparisonSkeleton(value: string): string {
  return normalize(value).replace(/[^\p{L}\p{M}\p{N}]+/gu, '');
}

function ngrams(value: string, size = 3): Set<string> {
  const padded = `^${comparisonSkeleton(value)}$`;
  if (padded.length <= size) return new Set([padded]);
  return new Set(
    Array.from({ length: padded.length - size + 1 }, (_, index) =>
      padded.slice(index, index + size),
    ),
  );
}

function jaccard(left: Set<string>, right: Set<string>): number {
  const union = new Set([...left, ...right]);
  if (union.size === 0) return 0;
  let intersection = 0;
  for (const value of left) if (right.has(value)) intersection += 1;
  return intersection / union.size;
}

function tokenSet(value: string): Set<string> {
  return new Set(normalize(value).match(/[\p{L}\p{M}\p{N}]+/gu) ?? []);
}

function glossRelation(left: string, right: string): string {
  if (normalize(left) === normalize(right)) return 'exact_normalized_string';
  const leftTokens = [...tokenSet(left)].sort();
  const rightTokens = [...tokenSet(right)].sort();
  if (
    leftTokens.length > 0 &&
    leftTokens.length === rightTokens.length &&
    leftTokens.every((token, index) => token === rightTokens[index])
  )
    return 'equal_token_set_different_order_or_punctuation';
  return 'other_unadjudicated_relation';
}

export function buildDictionaryAttestedEvidenceEdition({
  contractValue,
  parentManifestValue,
  inventoryManifestValue,
  parentEntries,
  parentSenses,
  parentReviewQueue,
  inheritedPublishedEvidenceLinks = [],
  inheritedPhraseTranslationEvidenceLinks = [],
  lexicalPairingRows,
  phraseTranslationPairingRows = [],
  changeLedgerRows,
}: BuildInput): DictionaryAttestedEvidenceResult {
  const contract =
    DictionaryAttestedEvidenceContractSchema.parse(contractValue);
  const parent = ParentManifestSchema.parse(parentManifestValue);
  const inventory = InventoryManifestSchema.parse(inventoryManifestValue);
  const entries = parentEntries.map((row) => EntrySchema.parse(row));
  const senses = parentSenses.map((row) => SenseSchema.parse(row));
  const reviews = parentReviewQueue.map((row) => ReviewSchema.parse(row));
  const inheritedPublished = inheritedPublishedEvidenceLinks.map((row) =>
    ExistingPublishedEvidenceSchema.parse(row),
  );
  const inheritedPhrases = inheritedPhraseTranslationEvidenceLinks.map((row) =>
    ExistingPhraseEvidenceSchema.parse(row),
  );
  const pairings = lexicalPairingRows.map((row) =>
    LexicalPairingSchema.parse(row),
  );
  const phrasePairings = phraseTranslationPairingRows.map((row) =>
    PhrasePairingSchema.parse(row),
  );

  if (parent.edition_id !== contract.parent_edition_id)
    throw new Error('parent edition ID does not match its manifest');
  if (inventory.inventory_id !== contract.evidence_inventory.inventory_id)
    throw new Error('evidence inventory ID does not match its manifest');
  if (!inventory.components[contract.evidence_inventory.lexical_component_key])
    throw new Error('lexical evidence component is absent');
  const phraseKey =
    contract.evidence_inventory.phrase_translation_component_key;
  if (phraseKey && !inventory.components[phraseKey])
    throw new Error('phrase-translation evidence component is absent');
  if (!phraseKey && phrasePairings.length > 0)
    throw new Error('phrase rows require a declared inventory component');
  const change = changeLedgerRows.find(
    (row) => row.change_id === contract.change_ledger.issuing_change_id,
  );
  if (!change) throw new Error('issuing dictionary change is absent');
  if (
    change.new_edition_id !== contract.edition_id ||
    change.parent_edition_id !== contract.parent_edition_id ||
    change.status !== 'candidate'
  )
    throw new Error(
      'issuing dictionary change does not identify this candidate lineage',
    );

  assertUnique(
    entries.map((row) => row.entryCandidateId),
    'entry candidate ID',
  );
  assertUnique(
    senses.map((row) => row.senseCandidateId),
    'sense candidate ID',
  );
  assertUnique(
    reviews.map((row) => row.reviewItemId),
    'parent review item ID',
  );
  assertUnique(
    pairings.map((row) => row.recordId),
    'lexical evidence record ID',
  );
  assertUnique(
    phrasePairings.map((row) => row.recordId),
    'phrase evidence record ID',
  );
  assertUnique(
    inheritedPublished.map((row) => row.evidenceLinkId),
    'inherited published evidence link ID',
  );
  assertUnique(
    inheritedPhrases.map((row) => row.evidenceLinkId),
    'inherited phrase evidence link ID',
  );

  const sensesByEntry = new Map<string, Array<z.infer<typeof SenseSchema>>>();
  for (const sense of senses) {
    const rows = sensesByEntry.get(sense.entryCandidateId) ?? [];
    rows.push(sense);
    sensesByEntry.set(sense.entryCandidateId, rows);
  }
  const currentEntries = entries.filter(
    (entry) => entry.sourceId === contract.current_dictionary_source_id,
  );
  if (currentEntries.length === 0)
    throw new Error('current dictionary source has no entries');

  const senseDiagnostics = (
    entry: z.infer<typeof EntrySchema>,
    sourceGloss: string,
  ) =>
    (sensesByEntry.get(entry.entryCandidateId) ?? []).map((sense) => {
      const comparison =
        sense.translationComparison ??
        sense.translationSource ??
        sense.definitionSource ??
        '';
      return {
        senseCandidateId: sense.senseCandidateId,
        translationSource: sense.translationSource ?? null,
        definitionSource: sense.definitionSource ?? null,
        glossRelation: comparison
          ? glossRelation(sourceGloss, comparison)
          : 'no_comparable_gloss',
        glossTokenJaccard: comparison
          ? Number(
              jaccard(tokenSet(sourceGloss), tokenSet(comparison)).toFixed(6),
            )
          : 0,
      };
    });

  const rankedCandidates = (sourceForm: string, sourceGloss: string) =>
    currentEntries
      .map((entry) => {
        const diagnostics = senseDiagnostics(entry, sourceGloss);
        const formSimilarity = jaccard(
          ngrams(sourceForm),
          ngrams(entry.headwordComparison),
        );
        const glossSimilarity = Math.max(
          0,
          ...diagnostics.map((row) => row.glossTokenJaccard),
        );
        return {
          entryCandidateId: entry.entryCandidateId,
          headwordComparison: entry.headwordComparison,
          formTrigramJaccard: Number(formSimilarity.toFixed(6)),
          glossTokenJaccard: Number(glossSimilarity.toFixed(6)),
          combinedReviewScore: Number(
            (formSimilarity * 0.8 + glossSimilarity * 0.2).toFixed(6),
          ),
          senseDiagnostics: diagnostics,
        };
      })
      .sort(
        (left, right) =>
          right.combinedReviewScore - left.combinedReviewScore ||
          left.entryCandidateId.localeCompare(right.entryCandidateId),
      )
      .slice(0, contract.review_candidate_limit);

  const addedLexicalLinks = pairings.map((pairing) => {
    const exactEntries = currentEntries.filter(
      (entry) =>
        normalize(entry.headwordComparison) === normalize(pairing.sourceForm),
    );
    const headwordRelationStatus =
      exactEntries.length === 1
        ? 'unique_exact_current_headword'
        : exactEntries.length > 1
          ? 'multiple_exact_current_headwords'
          : 'no_exact_current_headword';
    return {
      schemaVersion: 1,
      evidenceLinkId: `${pairing.recordId}-current-dictionary-link`,
      evidenceInventoryId: pairing.inventoryId,
      evidenceRecordId: pairing.recordId,
      evidenceSourceId: pairing.sourceId,
      sourceForm: pairing.sourceForm,
      sourceEnglishGloss: pairing.englishGlossSource,
      sourceQuote: pairing.sourceQuote,
      pairingScope: pairing.pairingScope,
      languageAttributionStatus: pairing.languageAttributionStatus,
      sourceIndependence: pairing.sourceIndependence,
      headwordRelationStatus,
      exactCurrentEntryCandidates: exactEntries.map((entry) => ({
        entryCandidateId: entry.entryCandidateId,
        headwordComparison: entry.headwordComparison,
        senseDiagnostics: senseDiagnostics(entry, pairing.englishGlossSource),
      })),
      dynamicReviewCandidates: rankedCandidates(
        pairing.sourceForm,
        pairing.englishGlossSource,
      ),
      lexicalIdentityStatus: 'unadjudicated',
      senseRelationStatus: 'unadjudicated',
      varietyRelationStatus: 'unadjudicated',
      substitutabilityStatus: 'unadjudicated',
      automaticEntryCreationAllowed: false,
      automaticMergeAllowed: false,
      status: 'candidate',
      trainingEligibility: 'not_allowed',
    };
  });

  const addedPhraseLinks = phrasePairings.map((pairing) => ({
    schemaVersion: 1,
    evidenceLinkId: `${pairing.recordId}-dictionary-phrase-evidence-link`,
    evidenceInventoryId: pairing.inventoryId,
    evidenceRecordId: pairing.recordId,
    evidenceSourceId: pairing.sourceId,
    sourceTextSource: pairing.sourceTextSource,
    englishTranslationSource: pairing.englishTranslationSource,
    sourceQuote: pairing.sourceQuote,
    pairingScope: pairing.pairingScope,
    languageAttributionStatus: pairing.languageAttributionStatus,
    sourceIndependence: pairing.sourceIndependence,
    translationStatus: pairing.translationStatus,
    alignmentStatus: pairing.alignmentStatus,
    lexicalSegmentationStatus: 'not_inferred',
    compositionalGlossStatus: 'not_inferred',
    dictionaryEntryCreationAllowed: false,
    phraseBenchmarkUnitCount: 0,
    status: 'candidate',
    trainingEligibility: 'not_allowed',
  }));

  const inheritedReviewIds = new Set(reviews.map((row) => row.reviewItemId));
  const lexicalReviews = addedLexicalLinks.map((link) => ({
    schemaVersion: 1,
    reviewItemId: `${link.evidenceRecordId}-dictionary-review`,
    reviewKind: 'attested_lexical_pairing_to_current_dictionary_relation',
    evidenceLinkId: link.evidenceLinkId,
    sourceForm: link.sourceForm,
    sourceEnglishGloss: link.sourceEnglishGloss,
    pairingScope: link.pairingScope,
    languageAttributionStatus: link.languageAttributionStatus,
    headwordRelationStatus: link.headwordRelationStatus,
    exactCurrentEntryCandidates: link.exactCurrentEntryCandidates,
    dynamicReviewCandidates: link.dynamicReviewCandidates,
    questions: [
      'Does the source form belong specifically to Wajarri in the cited variety and context?',
      'Which current entry and sense, if any, is evidence-equivalent rather than merely string-similar?',
      'Are spelling, part-of-speech, meaning, and substitutability relations independently supported?',
    ],
    status: 'pending',
    trainingEligibility: 'not_allowed',
  }));
  const phraseReviews = addedPhraseLinks.map((link) => ({
    schemaVersion: 1,
    reviewItemId: `${link.evidenceRecordId}-dictionary-phrase-review`,
    reviewKind: 'whole_phrase_translation_without_lexical_segmentation',
    evidenceLinkId: link.evidenceLinkId,
    sourceTextSource: link.sourceTextSource,
    englishTranslationSource: link.englishTranslationSource,
    languageAttributionStatus: link.languageAttributionStatus,
    questions: [
      'Is the whole-title relation independently corroborated for the relevant Wajarri variety?',
      'Can any lexical or morphological segmentation be established from qualified evidence without inferring it from the English title?',
    ],
    status: 'pending',
    trainingEligibility: 'not_allowed',
  }));
  for (const review of [...lexicalReviews, ...phraseReviews])
    if (inheritedReviewIds.has(review.reviewItemId))
      throw new Error(`new review item already exists: ${review.reviewItemId}`);

  const allPublished = [...inheritedPublished, ...addedLexicalLinks];
  const allPhrases = [...inheritedPhrases, ...addedPhraseLinks];
  assertUnique(
    allPublished.map((row) => row.evidenceLinkId),
    'published evidence link ID',
  );
  assertUnique(
    allPhrases.map((row) => row.evidenceLinkId),
    'phrase evidence link ID',
  );

  const uniqueExactCurrentHeadwords = addedLexicalLinks.filter(
    (row) => row.headwordRelationStatus === 'unique_exact_current_headword',
  ).length;
  const multipleExactCurrentHeadwords = addedLexicalLinks.filter(
    (row) => row.headwordRelationStatus === 'multiple_exact_current_headwords',
  ).length;
  const noExactCurrentHeadwords = addedLexicalLinks.filter(
    (row) => row.headwordRelationStatus === 'no_exact_current_headword',
  ).length;

  return {
    reviewQueue: [...reviews, ...lexicalReviews, ...phraseReviews],
    publishedEvidenceLinks: allPublished,
    phraseTranslationEvidenceLinks: allPhrases,
    report: {
      inheritedReviewItems: reviews.length,
      addedLexicalReviewItems: lexicalReviews.length,
      addedPhraseReviewItems: phraseReviews.length,
      totalReviewItems:
        reviews.length + lexicalReviews.length + phraseReviews.length,
      inheritedPublishedEvidenceLinks: inheritedPublished.length,
      addedLexicalEvidenceLinks: addedLexicalLinks.length,
      totalPublishedEvidenceLinks: allPublished.length,
      inheritedPhraseTranslationEvidenceLinks: inheritedPhrases.length,
      addedPhraseTranslationEvidenceLinks: addedPhraseLinks.length,
      totalPhraseTranslationEvidenceLinks: allPhrases.length,
      uniqueExactCurrentHeadwords,
      multipleExactCurrentHeadwords,
      noExactCurrentHeadwords,
      acceptedLexicalRows: 0,
      trainingEligibleRows: 0,
    },
  };
}
