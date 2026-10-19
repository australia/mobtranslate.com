import { z } from 'zod';

const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/u);
const KeySchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u);
const ComponentKeySchema = z.string().regex(/^[A-Za-z][A-Za-z0-9]*$/u);

export const ComponentReferenceSchema = z.object({
  path: z.string().min(1),
  sha256: Sha256Schema,
  rows: z.number().int().nonnegative(),
});

const ComponentBindingSchema = z.object({
  inventory_component_key: ComponentKeySchema,
  edition_component_key: ComponentKeySchema,
  evidence_kind: z.string().min(1),
});

const ComponentAppendSchema = z.object({
  parent_component_key: ComponentKeySchema,
  inventory_component_key: ComponentKeySchema,
  output_filename: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]*\.jsonl$/u),
  id_field: z.string().min(1),
});

export const EvidenceOnlyEditionContractSchema = z.object({
  schema_version: z.literal(1),
  artifact: z.enum(['dictionary', 'grammar']),
  edition_id: KeySchema,
  parent_edition_id: KeySchema,
  created_at_utc: z.string().datetime(),
  status: z.literal('scholarly_source_evidence_expansion'),
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
    component_bindings: z.array(ComponentBindingSchema).min(1),
  }),
  source_ledger: z.object({ path: z.string().min(1), sha256: Sha256Schema }),
  change_ledger: z.object({
    path: z.string().min(1),
    sha256: Sha256Schema,
    issuing_change_id: KeySchema,
    accepted_change_ids: z.array(KeySchema),
  }),
  component_appends: z.array(ComponentAppendSchema),
  review_items: z.array(
    z.object({
      review_key: KeySchema,
      question: z.string().min(1),
      evidence_component_keys: z.array(ComponentKeySchema).min(1),
      evidence_record_ids: z.array(KeySchema).min(1),
      evidence_required: z.array(z.string().min(1)).min(1),
      priority: z.enum(['critical', 'high', 'medium', 'low']),
    }),
  ),
  expected_counts: z.object({
    parent_components: z.number().int().positive(),
    inventory_components: z.number().int().positive(),
    component_appends: z.number().int().nonnegative(),
    inherited_review_items: z.number().int().nonnegative(),
    added_review_items: z.number().int().nonnegative(),
    added_evidence_rows: z.number().int().nonnegative(),
  }),
  current_pointer_path: z.string().min(1),
  supersedes_pointer_sha256: Sha256Schema,
  release_status: z.literal('not_released'),
  evidence_policy: z.record(z.string(), z.string().min(1)),
  claim_limit: z.string().min(1),
});

export type EvidenceOnlyEditionContract = z.infer<
  typeof EvidenceOnlyEditionContractSchema
>;

interface BuildInput {
  contractValue: unknown;
  parentManifestValue: unknown;
  inventoryManifestValue: unknown;
  parentRowsByComponent: Map<string, Array<Record<string, unknown>>>;
  inventoryRowsByComponent: Map<string, Array<Record<string, unknown>>>;
  changeLedgerRows: Array<Record<string, unknown>>;
}

export interface EvidenceOnlyEditionResult {
  components: Record<string, z.infer<typeof ComponentReferenceSchema>>;
  generatedRows: Map<string, Array<Record<string, unknown>>>;
  reviewQueue: Array<Record<string, unknown>>;
  evidenceComponents: Array<Record<string, unknown>> | null;
  counts: {
    parentComponents: number;
    inheritedReviewItems: number;
    addedReviewItems: number;
    totalReviewItems: number;
    inheritedEvidenceComponents: number | null;
    addedEvidenceComponents: number;
    totalEvidenceComponents: number | null;
    appendedRowsByComponent: Record<string, number>;
    addedEvidenceRows: number;
    newAcceptedRows: 0;
    trainingEligibleRows: 0;
  };
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function assertUnique(values: string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw new Error(`duplicate ${label}: ${value}`);
    seen.add(value);
  }
}

function stringField(
  row: Record<string, unknown>,
  field: string,
  label: string,
): string {
  const value = row[field];
  if (typeof value !== 'string' || value.length === 0)
    throw new Error(`${label} lacks ${field}`);
  return value;
}

function inheritedReviewIdentifier(
  row: Record<string, unknown>,
): string {
  for (const field of ['reviewKey', 'reviewItemId'] as const) {
    const value = row[field];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  throw new Error('parent review item lacks reviewKey or reviewItemId');
}

function closedEvidenceRow(row: Record<string, unknown>, label: string): void {
  if (
    row.acceptanceStatus !== 'not_accepted' ||
    row.trainingEligibility !== 'not_allowed' ||
    row.benchmarkEligibility !== 'not_allowed' ||
    row.syntheticEligibility !== 'not_allowed'
  )
    throw new Error(`${label} is not closed evidence`);
}

export function buildEvidenceOnlyEdition({
  contractValue,
  parentManifestValue,
  inventoryManifestValue,
  parentRowsByComponent,
  inventoryRowsByComponent,
  changeLedgerRows,
}: BuildInput): EvidenceOnlyEditionResult {
  const contract = EvidenceOnlyEditionContractSchema.parse(contractValue);
  const parent = object(parentManifestValue, 'parent manifest');
  const inventory = object(inventoryManifestValue, 'inventory manifest');
  if (parent.edition_id !== contract.parent_edition_id)
    throw new Error('parent edition ID does not match contract');
  if (inventory.inventory_id !== contract.evidence_inventory.inventory_id)
    throw new Error('inventory ID does not match contract');
  const parentComponents = z
    .record(z.string(), ComponentReferenceSchema)
    .parse(parent.components);
  const inventoryComponents = z
    .record(z.string(), ComponentReferenceSchema)
    .parse(inventory.components);
  if (
    Object.keys(parentComponents).length !==
    contract.expected_counts.parent_components
  )
    throw new Error('parent component count does not match contract');
  if (
    contract.evidence_inventory.component_bindings.length !==
    contract.expected_counts.inventory_components
  )
    throw new Error('inventory component count does not match contract');
  if (
    contract.component_appends.length !==
    contract.expected_counts.component_appends
  )
    throw new Error('component append count does not match contract');

  const issuingChanges = changeLedgerRows.filter(
    (row) => row.change_id === contract.change_ledger.issuing_change_id,
  );
  if (issuingChanges.length !== 1)
    throw new Error('issuing change is absent or duplicated');
  const issuingChange = issuingChanges[0];
  if (
    issuingChange.new_edition_id !== contract.edition_id ||
    issuingChange.parent_edition_id !== contract.parent_edition_id ||
    issuingChange.accepted === true
  )
    throw new Error('issuing change does not identify this closed edition');

  const reviewReference = parentComponents.reviewQueue;
  if (!reviewReference) throw new Error('parent lacks reviewQueue component');
  const parentReviewQueue = parentRowsByComponent.get('reviewQueue');
  if (!parentReviewQueue)
    throw new Error('parent reviewQueue rows were not provided');
  if (parentReviewQueue.length !== reviewReference.rows)
    throw new Error('parent reviewQueue row count mismatch');
  if (
    parentReviewQueue.length !==
    contract.expected_counts.inherited_review_items
  )
    throw new Error('inherited review count does not match contract');
  if (
    contract.review_items.length !== contract.expected_counts.added_review_items
  )
    throw new Error('added review count does not match contract');

  const bindings = contract.evidence_inventory.component_bindings;
  assertUnique(
    bindings.map((row) => row.inventory_component_key),
    'inventory component binding',
  );
  assertUnique(
    bindings.map((row) => row.edition_component_key),
    'edition component binding',
  );
  const availableEvidenceRecordIds = new Set<string>();
  let addedEvidenceRows = 0;
  for (const binding of bindings) {
    if (parentComponents[binding.edition_component_key])
      throw new Error(
        `edition component already exists: ${binding.edition_component_key}`,
      );
    const reference = inventoryComponents[binding.inventory_component_key];
    const rows = inventoryRowsByComponent.get(
      binding.inventory_component_key,
    );
    if (!reference || !rows)
      throw new Error(
        `inventory component is unavailable: ${binding.inventory_component_key}`,
      );
    if (rows.length !== reference.rows)
      throw new Error(
        `inventory row count mismatch: ${binding.inventory_component_key}`,
      );
    for (const row of rows) {
      closedEvidenceRow(row, binding.inventory_component_key);
      availableEvidenceRecordIds.add(
        stringField(row, 'recordId', binding.inventory_component_key),
      );
    }
    addedEvidenceRows += rows.length;
  }
  if (addedEvidenceRows !== contract.expected_counts.added_evidence_rows)
    throw new Error('added evidence row count does not match contract');

  const bindingByInventoryKey = new Map(
    bindings.map((row) => [row.inventory_component_key, row]),
  );
  const generatedRows = new Map<string, Array<Record<string, unknown>>>();
  const appendedRowsByComponent: Record<string, number> = {};
  for (const operation of contract.component_appends) {
    const parentReference = parentComponents[operation.parent_component_key];
    const parentRows = parentRowsByComponent.get(
      operation.parent_component_key,
    );
    const inventoryRows = inventoryRowsByComponent.get(
      operation.inventory_component_key,
    );
    if (!parentReference || !parentRows)
      throw new Error(
        `append parent component is unavailable: ${operation.parent_component_key}`,
      );
    if (!bindingByInventoryKey.has(operation.inventory_component_key))
      throw new Error(
        `append inventory component is not bound: ${operation.inventory_component_key}`,
      );
    if (!inventoryRows)
      throw new Error(
        `append inventory rows are unavailable: ${operation.inventory_component_key}`,
      );
    const ids = [
      ...parentRows.map((row) =>
        stringField(
          row,
          operation.id_field,
          operation.parent_component_key,
        ),
      ),
      ...inventoryRows.map((row) =>
        stringField(
          row,
          operation.id_field,
          operation.inventory_component_key,
        ),
      ),
    ];
    assertUnique(ids, `${operation.parent_component_key} ${operation.id_field}`);
    generatedRows.set(operation.parent_component_key, [
      ...parentRows,
      ...inventoryRows,
    ]);
    appendedRowsByComponent[operation.parent_component_key] =
      inventoryRows.length;
  }

  const inheritedReviewKeys = parentReviewQueue.map(inheritedReviewIdentifier);
  assertUnique(inheritedReviewKeys, 'parent review key');
  assertUnique(
    contract.review_items.map((row) => row.review_key),
    'new review key',
  );
  const inheritedReviewSet = new Set(inheritedReviewKeys);
  for (const item of contract.review_items) {
    if (inheritedReviewSet.has(item.review_key))
      throw new Error(`review key already exists: ${item.review_key}`);
    for (const componentKey of item.evidence_component_keys)
      if (!bindings.some((row) => row.edition_component_key === componentKey))
        throw new Error(
          `review item references unbound evidence component: ${componentKey}`,
        );
    for (const recordId of item.evidence_record_ids)
      if (!availableEvidenceRecordIds.has(recordId))
        throw new Error(
          `review item references unknown evidence record: ${recordId}`,
        );
  }
  const addedReviewRows = contract.review_items.map((item) => ({
    schemaVersion: 1,
    reviewItemId: `${contract.edition_id}:review:${item.review_key}`,
    reviewKey: item.review_key,
    question: item.question,
    evidenceComponentKeys: item.evidence_component_keys,
    evidenceRecordIds: item.evidence_record_ids,
    evidenceRequired: item.evidence_required,
    priority: item.priority,
    status: 'pending',
    introducedInEdition: contract.edition_id,
    trainingEligibility: 'not_allowed',
  }));
  const reviewQueue = [...parentReviewQueue, ...addedReviewRows];
  generatedRows.set('reviewQueue', reviewQueue);

  let evidenceComponents: Array<Record<string, unknown>> | null = null;
  let inheritedEvidenceComponents: number | null = null;
  if (parentComponents.evidenceComponents) {
    const parentEvidenceRows = parentRowsByComponent.get('evidenceComponents');
    if (!parentEvidenceRows)
      throw new Error('parent evidenceComponents rows were not provided');
    inheritedEvidenceComponents = parentEvidenceRows.length;
    const inheritedKeys = parentEvidenceRows.map((row) =>
      stringField(row, 'evidenceComponentKey', 'parent evidence component'),
    );
    assertUnique(inheritedKeys, 'parent evidence component key');
    const inheritedKeySet = new Set(inheritedKeys);
    for (const binding of bindings)
      if (inheritedKeySet.has(binding.edition_component_key))
        throw new Error(
          `evidence component already exists: ${binding.edition_component_key}`,
        );
    evidenceComponents = [
      ...parentEvidenceRows,
      ...bindings.map((binding) => ({
        schemaVersion: 1,
        evidenceComponentKey: binding.edition_component_key,
        inventoryComponentKey: binding.inventory_component_key,
        evidenceKind: binding.evidence_kind,
        inventoryId: contract.evidence_inventory.inventory_id,
        ...inventoryComponents[binding.inventory_component_key],
        acceptanceStatus: 'not_accepted',
        trainingEligibility: 'not_allowed',
        introducedInEdition: contract.edition_id,
      })),
    ];
    generatedRows.set('evidenceComponents', evidenceComponents);
  }

  const components = { ...parentComponents };
  for (const binding of bindings)
    components[binding.edition_component_key] =
      inventoryComponents[binding.inventory_component_key]!;

  return {
    components,
    generatedRows,
    reviewQueue,
    evidenceComponents,
    counts: {
      parentComponents: Object.keys(parentComponents).length,
      inheritedReviewItems: parentReviewQueue.length,
      addedReviewItems: addedReviewRows.length,
      totalReviewItems: reviewQueue.length,
      inheritedEvidenceComponents,
      addedEvidenceComponents: bindings.length,
      totalEvidenceComponents:
        evidenceComponents === null ? null : evidenceComponents.length,
      appendedRowsByComponent,
      addedEvidenceRows,
      newAcceptedRows: 0,
      trainingEligibleRows: 0,
    },
  };
}
