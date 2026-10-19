import { z } from 'zod';

const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/u);
const KeySchema = z.string().regex(/^[a-z0-9][a-z0-9.-]*$/u);
const ComponentReferenceSchema = z.object({
  path: z.string().min(1),
  sha256: Sha256Schema,
  rows: z.number().int().nonnegative(),
});

export const DictionaryPublishedEvidenceContractSchema = z.object({
  schema_version: z.literal(1),
  edition_id: KeySchema,
  parent_edition_id: KeySchema,
  created_at_utc: z.string().datetime(),
  status: z.literal('published_source_evidence_expansion'),
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
    lexical_component_key: z.literal('lexicalPairings'),
  }),
  current_dictionary_source_id: z.string().min(1),
  source_ledger: z.object({ path: z.string().min(1), sha256: Sha256Schema }),
  change_ledger: z.object({
    path: z.string().min(1),
    sha256: Sha256Schema,
    issuing_change_id: KeySchema,
    accepted_change_ids: z.array(KeySchema),
  }),
  expected_counts: z.object({
    evidence_links: z.number().int().nonnegative(),
    exact_current_headwords: z.number().int().nonnegative(),
    exact_normalized_glosses: z.number().int().nonnegative(),
    token_set_equal_glosses: z.number().int().nonnegative(),
    other_gloss_relations: z.number().int().nonnegative(),
    added_review_items: z.number().int().nonnegative(),
  }),
  current_pointer_path: z.string().min(1),
  supersedes_pointer_sha256: Sha256Schema,
  release_status: z.literal('not_released'),
});

export type DictionaryPublishedEvidenceContract = z.infer<
  typeof DictionaryPublishedEvidenceContractSchema
>;

const ParentManifestSchema = z.object({
  edition_id: KeySchema,
  components: z.record(z.string(), ComponentReferenceSchema),
  counts: z.object({ trainingEligibleRows: z.literal(0) }).passthrough(),
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
    translationSource: z.string().min(1).nullable(),
    translationComparison: z.string().min(1).nullable(),
    definitionSource: z.string().min(1).nullable(),
  })
  .passthrough();

const ReviewSchema = z
  .object({ reviewItemId: z.string().min(1) })
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
    sourceIndependence: z.string().min(1),
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
  lexicalPairingRows: unknown[];
  changeLedgerRows: Array<Record<string, unknown>>;
}

export interface DictionaryPublishedEvidenceResult {
  reviewQueue: Array<Record<string, unknown>>;
  publishedEvidenceLinks: Array<Record<string, unknown>>;
  report: {
    evidenceLinks: number;
    exactCurrentHeadwords: number;
    exactNormalizedGlosses: number;
    tokenSetEqualGlosses: number;
    otherGlossRelations: number;
    inheritedReviewItems: number;
    addedReviewItems: number;
    totalReviewItems: number;
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

function tokens(value: string): Set<string> {
  return new Set(normalize(value).match(/[\p{L}\p{M}\p{N}]+/gu) ?? []);
}

function tokenJaccard(left: string, right: string): number {
  const leftTokens = tokens(left);
  const rightTokens = tokens(right);
  const union = new Set([...leftTokens, ...rightTokens]);
  if (union.size === 0) return 0;
  const overlap = [...leftTokens].filter((token) => rightTokens.has(token));
  return Number((overlap.length / union.size).toFixed(6));
}

function relation(left: string, right: string): string {
  if (normalize(left) === normalize(right)) return 'exact_normalized_string';
  const leftTokens = [...tokens(left)].sort();
  const rightTokens = [...tokens(right)].sort();
  if (
    leftTokens.length > 0 &&
    leftTokens.length === rightTokens.length &&
    leftTokens.every((token, index) => token === rightTokens[index])
  )
    return 'equal_token_set_different_order_or_punctuation';
  return 'other_unadjudicated_relation';
}

export function buildDictionaryPublishedEvidenceEdition({
  contractValue,
  parentManifestValue,
  inventoryManifestValue,
  parentEntries,
  parentSenses,
  parentReviewQueue,
  lexicalPairingRows,
  changeLedgerRows,
}: BuildInput): DictionaryPublishedEvidenceResult {
  const contract =
    DictionaryPublishedEvidenceContractSchema.parse(contractValue);
  const parent = ParentManifestSchema.parse(parentManifestValue);
  const inventory = z
    .object({
      inventory_id: KeySchema,
      components: z.record(z.string(), ComponentReferenceSchema),
      validation: z.object({
        accepted_rows: z.literal(0),
        training_eligible_rows: z.literal(0),
      }),
    })
    .parse(inventoryManifestValue);
  const entries = parentEntries.map((row) => EntrySchema.parse(row));
  const senses = parentSenses.map((row) => SenseSchema.parse(row));
  const reviews = parentReviewQueue.map((row) => ReviewSchema.parse(row));
  const pairings = lexicalPairingRows.map((row) =>
    LexicalPairingSchema.parse(row),
  );

  if (parent.edition_id !== contract.parent_edition_id)
    throw new Error('parent edition ID does not match its manifest');
  if (inventory.inventory_id !== contract.evidence_inventory.inventory_id)
    throw new Error('evidence inventory ID does not match its manifest');
  if (!inventory.components[contract.evidence_inventory.lexical_component_key])
    throw new Error('lexical evidence component is absent from its manifest');
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
    'published pairing record ID',
  );

  const evidenceLinks = pairings.map((pairing) => {
    const candidates = entries.filter(
      (entry) =>
        entry.sourceId === contract.current_dictionary_source_id &&
        normalize(entry.headwordComparison) === normalize(pairing.sourceForm),
    );
    if (candidates.length !== 1)
      throw new Error(
        `published pairing ${pairing.recordId} has ${candidates.length} exact current headword candidates`,
      );
    const entry = candidates[0];
    const candidateSenses = senses.filter(
      (sense) => sense.entryCandidateId === entry.entryCandidateId,
    );
    if (candidateSenses.length === 0)
      throw new Error(
        `current entry ${entry.entryCandidateId} has no sense candidate`,
      );
    const senseDiagnostics = candidateSenses.map((sense) => {
      if (!sense.translationSource || !sense.translationComparison)
        throw new Error(
          `current sense ${sense.senseCandidateId} has no source translation`,
        );
      return {
        senseCandidateId: sense.senseCandidateId,
        translationSource: sense.translationSource,
        definitionSource: sense.definitionSource,
        glossRelation: relation(
          pairing.englishGlossSource,
          sense.translationComparison,
        ),
        tokenJaccard: tokenJaccard(
          pairing.englishGlossSource,
          sense.translationComparison,
        ),
      };
    });
    const relationPriority = [
      'exact_normalized_string',
      'equal_token_set_different_order_or_punctuation',
      'other_unadjudicated_relation',
    ];
    const diagnosticRelation = relationPriority.find((candidate) =>
      senseDiagnostics.some((row) => row.glossRelation === candidate),
    );
    return {
      schemaVersion: 1,
      evidenceLinkId: `${pairing.recordId}-current-dictionary-link`,
      evidenceInventoryId: pairing.inventoryId,
      evidenceRecordId: pairing.recordId,
      evidenceSourceId: pairing.sourceId,
      sourceForm: pairing.sourceForm,
      sourceEnglishGloss: pairing.englishGlossSource,
      sourceQuote: pairing.sourceQuote,
      sourceIndependence: pairing.sourceIndependence,
      exactCurrentEntryCandidateId: entry.entryCandidateId,
      senseDiagnostics,
      diagnosticGlossRelation: diagnosticRelation,
      lexicalIdentityStatus: 'unadjudicated',
      senseRelationStatus: 'unadjudicated',
      substitutabilityStatus: 'unadjudicated',
      automaticMergeAllowed: false,
      status: 'candidate',
      trainingEligibility: 'not_allowed',
    };
  });

  const addedReviews = evidenceLinks.map((link) => ({
    schemaVersion: 1,
    reviewItemId: `${link.evidenceRecordId}-published-pairing-review`,
    reviewKind: 'published_pairing_to_current_sense',
    evidenceLinkId: link.evidenceLinkId,
    sourceForm: link.sourceForm,
    sourceEnglishGloss: link.sourceEnglishGloss,
    currentEntryCandidateId: link.exactCurrentEntryCandidateId,
    candidateSenseIds: link.senseDiagnostics.map((row) => row.senseCandidateId),
    questions: [
      'Does the published pairing identify the same lexical entry and sense as the current candidate?',
      'What part of speech, variety, register, substitutability, and orthography scope are supported?',
      'Does same-project provenance provide enough independence for acceptance, or only corroboration?',
    ],
    automaticDecisionAllowed: false,
    status: 'pending',
    trainingEligibility: 'not_allowed',
  }));
  assertUnique(
    [
      ...reviews.map((row) => row.reviewItemId),
      ...addedReviews.map((row) => row.reviewItemId),
    ],
    'combined review item ID',
  );

  const exactNormalizedGlosses = evidenceLinks.filter(
    (row) => row.diagnosticGlossRelation === 'exact_normalized_string',
  ).length;
  const tokenSetEqualGlosses = evidenceLinks.filter(
    (row) =>
      row.diagnosticGlossRelation ===
      'equal_token_set_different_order_or_punctuation',
  ).length;
  return {
    reviewQueue: [...reviews, ...addedReviews],
    publishedEvidenceLinks: evidenceLinks,
    report: {
      evidenceLinks: evidenceLinks.length,
      exactCurrentHeadwords: evidenceLinks.length,
      exactNormalizedGlosses,
      tokenSetEqualGlosses,
      otherGlossRelations:
        evidenceLinks.length - exactNormalizedGlosses - tokenSetEqualGlosses,
      inheritedReviewItems: reviews.length,
      addedReviewItems: addedReviews.length,
      totalReviewItems: reviews.length + addedReviews.length,
      acceptedLexicalRows: 0,
      trainingEligibleRows: 0,
    },
  };
}
