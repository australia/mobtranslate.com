import { z } from 'zod';

const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/u);
const KeySchema = z.string().regex(/^[a-z0-9][a-z0-9.-]*$/u);
const ComponentKeySchema = z.string().regex(/^[A-Za-z][A-Za-z0-9]*$/u);
const ComponentReferenceSchema = z.object({
  path: z.string().min(1),
  sha256: Sha256Schema,
  rows: z.number().int().nonnegative(),
});

export const GrammarContemporaryEvidenceContractSchema = z.object({
  schema_version: z.literal(1),
  edition_id: KeySchema,
  parent_edition_id: KeySchema,
  created_at_utc: z.string().datetime(),
  status: z.literal('contemporary_source_evidence_expansion'),
  scope: z.object({
    language: z.string().min(1),
    iso_639_3: z.string().length(3),
    glottocode: z.string().min(1),
    variety: z.string().min(1),
    orthography: z.string().min(1),
  }),
  parent_manifest: z.object({ path: z.string().min(1), sha256: Sha256Schema }),
  evidence_inventory: z.object({
    inventory_id: KeySchema,
    manifest_path: z.string().min(1),
    manifest_sha256: Sha256Schema,
    component_keys: z.array(ComponentKeySchema).min(1),
    component_aliases: z
      .record(ComponentKeySchema, ComponentKeySchema)
      .optional(),
  }),
  source_ledger: z.object({ path: z.string().min(1), sha256: Sha256Schema }),
  change_ledger: z.object({
    path: z.string().min(1),
    sha256: Sha256Schema,
    issuing_change_id: KeySchema,
    accepted_change_ids: z.array(KeySchema),
  }),
  review_items: z
    .array(
      z.object({
        review_key: KeySchema,
        question: z.string().min(1),
        evidence_component_keys: z.array(ComponentKeySchema).min(1),
        evidence_required: z.array(z.string().min(1)).min(1),
        priority: z.enum(['critical', 'high', 'medium', 'low']),
      }),
    )
    .min(1),
  expected_counts: z.object({
    lexical_pairings: z.number().int().nonnegative().optional(),
    phrase_translation_pairings: z.number().int().nonnegative().optional(),
    source_internal_form_conflicts: z.number().int().nonnegative().optional(),
    pedagogical_records: z.number().int().nonnegative(),
    discourse_clusters: z.number().int().nonnegative(),
    discourse_benchmark_units: z.number().int().nonnegative(),
    reading_comprehension_clusters: z.number().int().nonnegative().optional(),
    document_translation_witnesses: z.number().int().nonnegative().optional(),
    assessment_version_conflicts: z.number().int().nonnegative().optional(),
    document_parallel_units: z.number().int().nonnegative().optional(),
    sentence_translation_benchmark_units: z
      .number()
      .int()
      .nonnegative()
      .optional(),
    added_review_items: z.number().int().nonnegative(),
  }),
  current_pointer_path: z.string().min(1),
  supersedes_pointer_sha256: Sha256Schema,
  release_status: z.literal('not_released'),
});

export type GrammarContemporaryEvidenceContract = z.infer<
  typeof GrammarContemporaryEvidenceContractSchema
>;

const ParentManifestSchema = z.object({
  edition_id: KeySchema,
  components: z.record(z.string(), ComponentReferenceSchema),
  counts: z.union([
    z
      .object({
        inherited_accepted_for_analysis_syntheses: z
          .number()
          .int()
          .nonnegative(),
        unresolved_conflicts: z.number().int().nonnegative(),
        training_eligible_rows: z.literal(0),
      })
      .passthrough(),
    z
      .object({
        acceptedForAnalysisSyntheses: z.number().int().nonnegative(),
        unresolvedConflicts: z.number().int().nonnegative(),
        trainingEligibleRows: z.literal(0),
      })
      .passthrough(),
  ]),
});

const InventoryManifestSchema = z.object({
  inventory_id: KeySchema,
  components: z.record(z.string(), ComponentReferenceSchema),
  validation: z.object({
    lexical_pairings: z.number().int().nonnegative().optional(),
    phrase_translation_pairings: z.number().int().nonnegative().optional(),
    pedagogical_records: z.number().int().nonnegative(),
    discourse_clusters: z.number().int().nonnegative(),
    benchmark_units_from_discourse: z.number().int().nonnegative(),
    reading_comprehension_clusters: z.number().int().nonnegative().optional(),
    document_translation_witnesses: z.number().int().nonnegative().optional(),
    assessment_version_conflicts: z.number().int().nonnegative().optional(),
    document_parallel_units: z.number().int().nonnegative().optional(),
    sentence_translation_benchmark_units: z
      .number()
      .int()
      .nonnegative()
      .optional(),
    accepted_rows: z.literal(0),
    training_eligible_rows: z.literal(0),
  }),
});

const ReviewSchema = z
  .object({ reviewItemId: z.string().min(1), reviewKey: z.string().min(1) })
  .passthrough();
const EvidenceComponentSchema = z
  .object({ evidenceComponentKey: z.string().min(1) })
  .passthrough();
const ClosedInventoryRowSchema = z
  .object({
    acceptanceStatus: z.literal('not_accepted'),
    trainingEligibility: z.literal('not_allowed'),
  })
  .passthrough();

interface BuildInput {
  contractValue: unknown;
  parentManifestValue: unknown;
  inventoryManifestValue: unknown;
  parentReviewRows: unknown[];
  parentEvidenceComponentRows: unknown[];
  inventoryRowsByComponent: Map<string, unknown[]>;
  changeLedgerRows: Array<Record<string, unknown>>;
}

export interface GrammarContemporaryEvidenceResult {
  reviewQueue: Array<Record<string, unknown>>;
  evidenceComponents: Array<Record<string, unknown>>;
  inheritedComponents: Record<string, z.infer<typeof ComponentReferenceSchema>>;
  inventoryComponents: Record<string, z.infer<typeof ComponentReferenceSchema>>;
  report: {
    inheritedReviewItems: number;
    addedReviewItems: number;
    totalReviewItems: number;
    inheritedEvidenceComponents: number;
    addedEvidenceComponents: number;
    totalEvidenceComponents: number;
    lexicalPairings?: number;
    phraseTranslationPairings?: number;
    sourceInternalFormConflicts?: number;
    pedagogicalRecords: number;
    discourseClusters: number;
    discourseBenchmarkUnits: number;
    readingComprehensionClusters?: number;
    documentTranslationWitnesses?: number;
    assessmentVersionConflicts?: number;
    documentParallelUnits?: number;
    sentenceTranslationBenchmarkUnits?: number;
    acceptedForAnalysisSyntheses: number;
    unresolvedConflicts: number;
    newAcceptedRows: 0;
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

export function buildGrammarContemporaryEvidenceEdition({
  contractValue,
  parentManifestValue,
  inventoryManifestValue,
  parentReviewRows,
  parentEvidenceComponentRows,
  inventoryRowsByComponent,
  changeLedgerRows,
}: BuildInput): GrammarContemporaryEvidenceResult {
  const contract =
    GrammarContemporaryEvidenceContractSchema.parse(contractValue);
  const parent = ParentManifestSchema.parse(parentManifestValue);
  const inventory = InventoryManifestSchema.parse(inventoryManifestValue);
  const reviews = parentReviewRows.map((row) => ReviewSchema.parse(row));
  const inheritedEvidence = parentEvidenceComponentRows.map((row) =>
    EvidenceComponentSchema.parse(row),
  );
  const acceptedForAnalysisSyntheses = z
    .number()
    .int()
    .nonnegative()
    .parse(
      'inherited_accepted_for_analysis_syntheses' in parent.counts
        ? parent.counts.inherited_accepted_for_analysis_syntheses
        : parent.counts.acceptedForAnalysisSyntheses,
    );
  const unresolvedConflicts = z
    .number()
    .int()
    .nonnegative()
    .parse(
      'unresolved_conflicts' in parent.counts
        ? parent.counts.unresolved_conflicts
        : parent.counts.unresolvedConflicts,
    );
  const componentAliases = contract.evidence_inventory.component_aliases ?? {};
  for (const sourceKey of Object.keys(componentAliases))
    if (!contract.evidence_inventory.component_keys.includes(sourceKey))
      throw new Error(
        `component alias references an unselected inventory key: ${sourceKey}`,
      );
  const editionComponentKey = (sourceKey: string) =>
    componentAliases[sourceKey] ?? sourceKey;
  assertUnique(
    contract.evidence_inventory.component_keys.map(editionComponentKey),
    'edition evidence component alias',
  );

  if (parent.edition_id !== contract.parent_edition_id)
    throw new Error('parent edition ID does not match its manifest');
  if (inventory.inventory_id !== contract.evidence_inventory.inventory_id)
    throw new Error('evidence inventory ID does not match its manifest');
  const change = changeLedgerRows.find(
    (row) => row.change_id === contract.change_ledger.issuing_change_id,
  );
  if (!change) throw new Error('issuing grammar change is absent');
  if (
    change.new_edition_id !== contract.edition_id ||
    change.parent_edition_id !== contract.parent_edition_id ||
    change.accepted !== false
  )
    throw new Error(
      'issuing grammar change does not identify this closed lineage',
    );

  assertUnique(
    reviews.map((row) => row.reviewKey),
    'parent review key',
  );
  assertUnique(
    inheritedEvidence.map((row) => row.evidenceComponentKey),
    'parent evidence component key',
  );
  assertUnique(
    contract.review_items.map((row) => row.review_key),
    'new review key',
  );
  const inheritedReviewKeys = new Set(reviews.map((row) => row.reviewKey));
  for (const item of contract.review_items)
    if (inheritedReviewKeys.has(item.review_key))
      throw new Error(`new review key already exists: ${item.review_key}`);

  const inheritedEvidenceKeys = new Set(
    inheritedEvidence.map((row) => row.evidenceComponentKey),
  );
  for (const sourceComponentKey of contract.evidence_inventory.component_keys) {
    const componentKey = editionComponentKey(sourceComponentKey);
    if (inheritedEvidenceKeys.has(componentKey))
      throw new Error(`new evidence component already exists: ${componentKey}`);
    const reference = inventory.components[sourceComponentKey];
    if (!reference)
      throw new Error(`inventory component is absent: ${sourceComponentKey}`);
    const rows = inventoryRowsByComponent.get(sourceComponentKey);
    if (!rows)
      throw new Error(`inventory rows are absent: ${sourceComponentKey}`);
    if (rows.length !== reference.rows)
      throw new Error(`inventory row count mismatch: ${sourceComponentKey}`);
    rows.forEach((row) => ClosedInventoryRowSchema.parse(row));
  }
  const availableEvidenceKeys = new Set([
    ...inheritedEvidenceKeys,
    ...contract.evidence_inventory.component_keys.map(editionComponentKey),
  ]);
  for (const item of contract.review_items)
    for (const componentKey of item.evidence_component_keys)
      if (!availableEvidenceKeys.has(componentKey))
        throw new Error(
          `review item ${item.review_key} references unknown evidence component ${componentKey}`,
        );

  const lexicalPairings =
    inventoryRowsByComponent.get('lexicalPairings')?.length ?? 0;
  const phraseTranslationPairings =
    inventoryRowsByComponent.get('phraseTranslationPairings')?.length ?? 0;
  const sourceInternalFormConflicts = [...inventoryRowsByComponent.values()]
    .flat()
    .filter(
      (row) =>
        z
          .object({ record_kind: z.string().optional() })
          .passthrough()
          .parse(row).record_kind === 'source_internal_form_conflict',
    ).length;
  if (
    contract.expected_counts.lexical_pairings !== undefined &&
    inventory.validation.lexical_pairings !== lexicalPairings
  )
    throw new Error('inventory lexical-pairing count does not match its rows');
  if (
    contract.expected_counts.phrase_translation_pairings !== undefined &&
    inventory.validation.phrase_translation_pairings !==
      phraseTranslationPairings
  )
    throw new Error(
      'inventory phrase-translation count does not match its rows',
    );

  const newReviews = contract.review_items.map((item) => ({
    schemaVersion: 1,
    reviewItemId: `${contract.edition_id}:review:${item.review_key}`,
    reviewKey: item.review_key,
    question: item.question,
    evidenceComponentKeys: item.evidence_component_keys,
    evidenceRequired: item.evidence_required,
    priority: item.priority,
    status: 'pending',
    introducedInEdition: contract.edition_id,
  }));
  const newEvidence = contract.evidence_inventory.component_keys.map(
    (sourceComponentKey) => ({
      schemaVersion: 1,
      evidenceComponentKey: editionComponentKey(sourceComponentKey),
      inventoryComponentKey: sourceComponentKey,
      evidenceKind: 'contemporary_source_inventory_component',
      inventoryId: inventory.inventory_id,
      ...inventory.components[sourceComponentKey],
      acceptanceStatus: 'not_accepted',
      trainingEligibility: 'not_allowed',
    }),
  );
  const selectedInventoryComponents = Object.fromEntries(
    contract.evidence_inventory.component_keys.map((sourceComponentKey) => [
      editionComponentKey(sourceComponentKey),
      inventory.components[sourceComponentKey]!,
    ]),
  );

  return {
    reviewQueue: [...reviews, ...newReviews],
    evidenceComponents: [...inheritedEvidence, ...newEvidence],
    inheritedComponents: parent.components,
    inventoryComponents: selectedInventoryComponents,
    report: {
      inheritedReviewItems: reviews.length,
      addedReviewItems: newReviews.length,
      totalReviewItems: reviews.length + newReviews.length,
      inheritedEvidenceComponents: inheritedEvidence.length,
      addedEvidenceComponents: newEvidence.length,
      totalEvidenceComponents: inheritedEvidence.length + newEvidence.length,
      ...(contract.expected_counts.lexical_pairings !== undefined
        ? { lexicalPairings }
        : {}),
      ...(contract.expected_counts.phrase_translation_pairings !== undefined
        ? { phraseTranslationPairings }
        : {}),
      ...(contract.expected_counts.source_internal_form_conflicts !== undefined
        ? { sourceInternalFormConflicts }
        : {}),
      pedagogicalRecords: inventory.validation.pedagogical_records,
      discourseClusters: inventory.validation.discourse_clusters,
      discourseBenchmarkUnits:
        inventory.validation.benchmark_units_from_discourse,
      ...(inventory.validation.reading_comprehension_clusters !== undefined
        ? {
            readingComprehensionClusters:
              inventory.validation.reading_comprehension_clusters,
          }
        : {}),
      ...(inventory.validation.document_translation_witnesses !== undefined
        ? {
            documentTranslationWitnesses:
              inventory.validation.document_translation_witnesses,
          }
        : {}),
      ...(inventory.validation.assessment_version_conflicts !== undefined
        ? {
            assessmentVersionConflicts:
              inventory.validation.assessment_version_conflicts,
          }
        : {}),
      ...(inventory.validation.document_parallel_units !== undefined
        ? {
            documentParallelUnits: inventory.validation.document_parallel_units,
          }
        : {}),
      ...(inventory.validation.sentence_translation_benchmark_units !==
      undefined
        ? {
            sentenceTranslationBenchmarkUnits:
              inventory.validation.sentence_translation_benchmark_units,
          }
        : {}),
      acceptedForAnalysisSyntheses,
      unresolvedConflicts,
      newAcceptedRows: 0,
      trainingEligibleRows: 0,
    },
  };
}
