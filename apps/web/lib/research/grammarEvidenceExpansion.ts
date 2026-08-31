import { z } from 'zod';

const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const KeySchema = z.string().regex(/^[a-z0-9][a-z0-9.-]*$/);
const ComponentKeySchema = z.string().regex(/^[A-Za-z][A-Za-z0-9]*$/);

const ComponentReferenceSchema = z.object({
  path: z.string().min(1),
  sha256: Sha256Schema,
  rows: z.number().int().nonnegative(),
});

const ReviewItemSchema = z.object({
  review_key: KeySchema,
  question: z.string().min(1),
  evidence_component_keys: z.array(ComponentKeySchema).min(1),
  evidence_required: z.array(z.string().min(1)).min(1),
  priority: z.enum(['critical', 'high', 'medium', 'low']),
});

export const GrammarEvidenceExpansionContractSchema = z.object({
  schema_version: z.literal(1),
  edition_id: KeySchema,
  parent_edition_id: KeySchema,
  created_at_utc: z.string().datetime(),
  status: z.literal('source_evidence_expansion'),
  scope: z.object({
    language: z.string().min(1),
    iso_639_3: z.string().length(3),
    glottocode: z.string().min(1),
    variety: z.string().min(1),
    orthography: z.string().min(1),
  }),
  parent_edition: z.object({
    manifest_path: z.string().min(1),
    manifest_sha256: Sha256Schema,
  }),
  evidence_inventory: z.object({
    inventory_id: KeySchema,
    manifest_path: z.string().min(1),
    manifest_sha256: Sha256Schema,
    required_component_keys: z.array(ComponentKeySchema).min(1),
  }),
  catalog_artifacts: z.array(
    z.object({
      evidence_key: ComponentKeySchema,
      source_id: z.string().min(1),
      path: z.string().min(1),
      sha256: Sha256Schema,
      evidence_role: z.string().min(1),
      training_use: z.literal('not_allowed'),
    }),
  ),
  source_ledger: z.object({
    path: z.string().min(1),
    sha256: Sha256Schema,
  }),
  change_ledger: z.object({
    path: z.string().min(1),
    sha256: Sha256Schema,
    issuing_change_id: KeySchema,
    accepted_change_ids: z.array(KeySchema),
  }),
  current_pointer_path: z.string().min(1),
  supersedes_pointer_sha256: Sha256Schema,
  review_items: z.array(ReviewItemSchema).min(1),
  release_status: z.literal('not_released'),
});

export type GrammarEvidenceExpansionContract = z.infer<
  typeof GrammarEvidenceExpansionContractSchema
>;

const ParentManifestSchema = z.object({
  edition_id: KeySchema,
  components: z.object({
    assertions: ComponentReferenceSchema,
    syntheses: ComponentReferenceSchema,
    conflicts: ComponentReferenceSchema,
    reviewQueue: ComponentReferenceSchema,
  }),
  counts: z.object({
    accepted_for_analysis_syntheses: z.number().int().nonnegative(),
    unresolved_conflicts: z.number().int().nonnegative(),
    training_eligible_rows: z.literal(0),
  }),
});

const InventoryManifestSchema = z.object({
  inventory_id: KeySchema,
  components: z.record(ComponentKeySchema, ComponentReferenceSchema),
  validation: z.object({
    numbered_examples: z.number().int().positive(),
    numbered_example_occurrences: z.number().int().positive(),
    table_blocks: z.number().int().positive(),
    morphotactic_statements: z.number().int().positive(),
    curated_examples: z.number().int().nonnegative(),
    silent_ocr_corrections: z.literal(0),
    accepted_rows: z.literal(0),
    training_eligible_rows: z.literal(0),
  }),
});

interface BuildGrammarEvidenceExpansionInput {
  contractValue: unknown;
  parentManifestValue: unknown;
  inventoryManifestValue: unknown;
  parentReviewRows: Array<Record<string, unknown>>;
  inventoryRowsByComponent: Map<string, Array<Record<string, unknown>>>;
  changeLedgerRows: Array<Record<string, unknown>>;
}

export interface GrammarEvidenceExpansionResult {
  reviewQueue: Array<Record<string, unknown>>;
  evidenceComponents: Array<Record<string, unknown>>;
  inheritedComponents: z.infer<typeof ParentManifestSchema>['components'];
  inventoryComponents: Record<string, z.infer<typeof ComponentReferenceSchema>>;
  counts: {
    inheritedReviewItems: number;
    addedReviewItems: number;
    totalReviewItems: number;
    evidenceComponents: number;
    acceptedForAnalysisSyntheses: number;
    unresolvedConflicts: number;
    newAcceptedRows: 0;
    trainingEligibleRows: 0;
  };
  inventoryValidation: z.infer<typeof InventoryManifestSchema>['validation'];
}

function uniqueKeys(values: string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw new Error(`duplicate ${label}: ${value}`);
    seen.add(value);
  }
}

function assertInventoryRowsClosed(
  componentKey: string,
  rows: Array<Record<string, unknown>>,
): void {
  for (const [index, row] of rows.entries()) {
    if (row.trainingEligibility !== 'not_allowed')
      throw new Error(
        `inventory ${componentKey} row ${index + 1} is training eligible`,
      );
    if ('acceptanceStatus' in row && row.acceptanceStatus !== 'not_accepted')
      throw new Error(
        `inventory ${componentKey} row ${index + 1} has unexpected acceptance status`,
      );
  }
}

export function buildGrammarEvidenceExpansion({
  contractValue,
  parentManifestValue,
  inventoryManifestValue,
  parentReviewRows,
  inventoryRowsByComponent,
  changeLedgerRows,
}: BuildGrammarEvidenceExpansionInput): GrammarEvidenceExpansionResult {
  const contract = GrammarEvidenceExpansionContractSchema.parse(contractValue);
  const parent = ParentManifestSchema.parse(parentManifestValue);
  const inventory = InventoryManifestSchema.parse(inventoryManifestValue);

  if (parent.edition_id !== contract.parent_edition_id)
    throw new Error('parent edition ID does not match its manifest');
  if (inventory.inventory_id !== contract.evidence_inventory.inventory_id)
    throw new Error('evidence inventory ID does not match its manifest');

  const parentReviewKeys = parentReviewRows.map((row) => {
    if (typeof row.reviewKey !== 'string')
      throw new Error('parent review row has no reviewKey');
    return row.reviewKey;
  });
  uniqueKeys(parentReviewKeys, 'parent review key');
  uniqueKeys(
    contract.review_items.map((item) => item.review_key),
    'new review key',
  );
  const overlap = contract.review_items
    .map((item) => item.review_key)
    .filter((key) => parentReviewKeys.includes(key));
  if (overlap.length > 0)
    throw new Error(`new review keys already exist: ${overlap.join(',')}`);

  const issuingChange = changeLedgerRows.find(
    (row) => row.change_id === contract.change_ledger.issuing_change_id,
  );
  if (!issuingChange)
    throw new Error(
      `issuing change is absent: ${contract.change_ledger.issuing_change_id}`,
    );
  if (
    issuingChange.new_edition_id !== contract.edition_id ||
    issuingChange.parent_edition_id !== contract.parent_edition_id
  )
    throw new Error('issuing change does not identify this edition lineage');

  for (const key of contract.evidence_inventory.required_component_keys) {
    const component = inventory.components[key];
    if (!component)
      throw new Error(`required inventory component is absent: ${key}`);
    const rows = inventoryRowsByComponent.get(key);
    if (!rows) throw new Error(`required inventory rows are absent: ${key}`);
    if (rows.length !== component.rows)
      throw new Error(
        `inventory component ${key} has ${rows.length} rows, expected ${component.rows}`,
      );
    assertInventoryRowsClosed(key, rows);
  }

  const evidenceComponentKeys = new Set([
    ...contract.evidence_inventory.required_component_keys,
    ...contract.catalog_artifacts.map((artifact) => artifact.evidence_key),
  ]);
  for (const item of contract.review_items)
    for (const key of item.evidence_component_keys)
      if (!evidenceComponentKeys.has(key))
        throw new Error(
          `review item ${item.review_key} references unknown evidence component ${key}`,
        );

  const addedReviewRows = contract.review_items.map((item) => ({
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
  const evidenceComponents = [
    ...contract.evidence_inventory.required_component_keys.map((key) => ({
      schemaVersion: 1,
      evidenceComponentKey: key,
      evidenceKind: 'source_inventory_component',
      inventoryId: inventory.inventory_id,
      ...inventory.components[key],
      acceptanceStatus: 'not_accepted',
      trainingEligibility: 'not_allowed',
    })),
    ...contract.catalog_artifacts.map((artifact) => ({
      schemaVersion: 1,
      evidenceComponentKey: artifact.evidence_key,
      evidenceKind: 'catalog_artifact',
      sourceId: artifact.source_id,
      path: artifact.path,
      sha256: artifact.sha256,
      evidenceRole: artifact.evidence_role,
      acceptanceStatus: 'catalog_evidence_only',
      trainingEligibility: artifact.training_use,
    })),
  ];

  return {
    reviewQueue: [...parentReviewRows, ...addedReviewRows],
    evidenceComponents,
    inheritedComponents: parent.components,
    inventoryComponents: inventory.components,
    counts: {
      inheritedReviewItems: parentReviewRows.length,
      addedReviewItems: addedReviewRows.length,
      totalReviewItems: parentReviewRows.length + addedReviewRows.length,
      evidenceComponents: evidenceComponents.length,
      acceptedForAnalysisSyntheses:
        parent.counts.accepted_for_analysis_syntheses,
      unresolvedConflicts: parent.counts.unresolved_conflicts,
      newAcceptedRows: 0,
      trainingEligibleRows: 0,
    },
    inventoryValidation: inventory.validation,
  };
}
