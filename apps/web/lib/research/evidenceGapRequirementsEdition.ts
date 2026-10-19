import { z } from 'zod';

const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/u);
const KeySchema = z.string().regex(/^[a-z0-9][a-z0-9.-]*$/u);
const KnowledgeEditionSchema = z.object({
  edition_id: KeySchema,
  manifest_path: z.string().min(1),
  manifest_sha256: Sha256Schema,
});

export const EvidenceGapRequirementsContractSchema = z.object({
  schema_version: z.literal(1),
  requirements_edition_id: KeySchema,
  parent_requirements_edition_id: KeySchema,
  created_at_utc: z.string().datetime(),
  language: z.object({
    name: z.string().min(1),
    iso_639_3: z.string().length(3),
    glottocode: z.string().min(1),
  }),
  parent: z.object({
    manifest_path: z.string().min(1),
    manifest_sha256: Sha256Schema,
    requirements_path: z.string().min(1),
    requirements_sha256: Sha256Schema,
    requirements_rows: z.number().int().positive(),
  }),
  bound_inputs: z.object({
    dictionary: KnowledgeEditionSchema,
    grammar: KnowledgeEditionSchema,
    contemporary_inventory: z.object({
      inventory_id: KeySchema,
      manifest_path: z.string().min(1),
      manifest_sha256: Sha256Schema,
    }),
  }),
  expected_parent_bindings: z.object({
    dictionary_edition_id: KeySchema,
    dictionary_manifest_sha256: Sha256Schema,
    grammar_edition_id: KeySchema,
    grammar_manifest_sha256: Sha256Schema,
  }),
  amendments: z.array(
    z.object({
      requirement_id: KeySchema,
      add_component_keys: z.array(z.string().min(1)),
      replace_blockers: z.array(z.string().min(1)).min(1),
    }),
  ),
  expected_counts: z.object({
    requirements: z.number().int().positive(),
    critical: z.number().int().nonnegative(),
    high: z.number().int().nonnegative(),
    blocked_direct_conflict: z.number().int().nonnegative(),
    blocked_evidence_review: z.number().int().nonnegative(),
    blocked_human_review: z.number().int().nonnegative(),
    blocked_natural_data: z.number().int().nonnegative(),
    closed: z.number().int().nonnegative(),
  }),
  count_policy: z.string().min(1),
  claim_limit: z.string().min(1),
  release_status: z.literal('not_released'),
});

export type EvidenceGapRequirementsContract = z.infer<
  typeof EvidenceGapRequirementsContractSchema
>;

const RequirementSchema = z
  .object({
    schemaVersion: z.literal(1),
    requirementId: KeySchema,
    capability: z.string().min(1),
    evidenceBasis: z
      .object({
        dictionaryEditionId: KeySchema,
        dictionaryManifestSha256: Sha256Schema,
        grammarEditionId: KeySchema,
        grammarManifestSha256: Sha256Schema,
        componentKeys: z.array(z.string().min(1)).min(1),
      })
      .passthrough(),
    blockers: z.array(z.string().min(1)).min(1),
    status: z.enum([
      'blocked_direct_conflict',
      'blocked_evidence_review',
      'blocked_human_review',
      'blocked_natural_data',
      'closed',
    ]),
    priority: z.enum(['critical', 'high']),
  })
  .passthrough();

interface BuildInput {
  contractValue: unknown;
  parentManifestValue: unknown;
  parentRequirementRows: unknown[];
  dictionaryManifestValue: unknown;
  grammarManifestValue: unknown;
  inventoryManifestValue: unknown;
}

export interface EvidenceGapRequirementsResult {
  requirements: Array<Record<string, unknown>>;
  summary: {
    requirements: number;
    critical: number;
    high: number;
    blockedDirectConflict: number;
    blockedEvidenceReview: number;
    blockedHumanReview: number;
    blockedNaturalData: number;
    closed: number;
    amendedRequirements: number;
    syntheticRowsAuthorized: 0;
    modelTrainingAuthorized: false;
  };
}

function assertUnique(values: string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw new Error(`duplicate ${label}: ${value}`);
    seen.add(value);
  }
}

export function buildEvidenceGapRequirementsEdition({
  contractValue,
  parentManifestValue,
  parentRequirementRows,
  dictionaryManifestValue,
  grammarManifestValue,
  inventoryManifestValue,
}: BuildInput): EvidenceGapRequirementsResult {
  const contract = EvidenceGapRequirementsContractSchema.parse(contractValue);
  const parentManifest = z
    .object({ requirements_edition_id: KeySchema })
    .passthrough()
    .parse(parentManifestValue);
  const dictionaryManifest = z
    .object({
      edition_id: KeySchema,
      counts: z.record(z.string(), z.unknown()),
    })
    .passthrough()
    .parse(dictionaryManifestValue);
  const grammarManifest = z
    .object({
      edition_id: KeySchema,
      counts: z.record(z.string(), z.unknown()),
    })
    .passthrough()
    .parse(grammarManifestValue);
  const inventoryManifest = z
    .object({
      inventory_id: KeySchema,
      validation: z.object({
        accepted_rows: z.literal(0),
        training_eligible_rows: z.literal(0),
      }),
    })
    .passthrough()
    .parse(inventoryManifestValue);
  const parentRows = parentRequirementRows.map((row) =>
    RequirementSchema.parse(row),
  );

  if (
    parentManifest.requirements_edition_id !==
    contract.parent_requirements_edition_id
  )
    throw new Error(
      'parent requirements edition ID does not match its manifest',
    );
  if (
    dictionaryManifest.edition_id !==
    contract.bound_inputs.dictionary.edition_id
  )
    throw new Error('dictionary edition ID does not match its manifest');
  if (grammarManifest.edition_id !== contract.bound_inputs.grammar.edition_id)
    throw new Error('grammar edition ID does not match its manifest');
  if (
    inventoryManifest.inventory_id !==
    contract.bound_inputs.contemporary_inventory.inventory_id
  )
    throw new Error('contemporary inventory ID does not match its manifest');
  if (parentRows.length !== contract.parent.requirements_rows)
    throw new Error('parent requirement row count does not match contract');

  assertUnique(
    parentRows.map((row) => row.requirementId),
    'parent requirement ID',
  );
  assertUnique(
    contract.amendments.map((row) => row.requirement_id),
    'amendment requirement ID',
  );
  const parentIds = new Set(parentRows.map((row) => row.requirementId));
  for (const amendment of contract.amendments)
    if (!parentIds.has(amendment.requirement_id))
      throw new Error(
        `amendment references unknown requirement ${amendment.requirement_id}`,
      );

  for (const row of parentRows) {
    if (
      row.evidenceBasis.dictionaryEditionId !==
        contract.expected_parent_bindings.dictionary_edition_id ||
      row.evidenceBasis.dictionaryManifestSha256 !==
        contract.expected_parent_bindings.dictionary_manifest_sha256 ||
      row.evidenceBasis.grammarEditionId !==
        contract.expected_parent_bindings.grammar_edition_id ||
      row.evidenceBasis.grammarManifestSha256 !==
        contract.expected_parent_bindings.grammar_manifest_sha256
    )
      throw new Error(`parent binding mismatch in ${row.requirementId}`);
  }

  const amendmentById = new Map(
    contract.amendments.map((row) => [row.requirement_id, row]),
  );
  const requirements = parentRows.map((row) => {
    const amendment = amendmentById.get(row.requirementId);
    const componentKeys = [
      ...row.evidenceBasis.componentKeys,
      ...(amendment?.add_component_keys ?? []),
    ];
    assertUnique(componentKeys, `component key in ${row.requirementId}`);
    return {
      ...row,
      requirementsEditionId: contract.requirements_edition_id,
      supersedesRequirementsEditionId: contract.parent_requirements_edition_id,
      evidenceBasis: {
        ...row.evidenceBasis,
        dictionaryEditionId: contract.bound_inputs.dictionary.edition_id,
        dictionaryManifestSha256:
          contract.bound_inputs.dictionary.manifest_sha256,
        grammarEditionId: contract.bound_inputs.grammar.edition_id,
        grammarManifestSha256: contract.bound_inputs.grammar.manifest_sha256,
        componentKeys,
        contemporaryInventoryId:
          contract.bound_inputs.contemporary_inventory.inventory_id,
        contemporaryInventoryManifestSha256:
          contract.bound_inputs.contemporary_inventory.manifest_sha256,
      },
      blockers: amendment?.replace_blockers ?? row.blockers,
    };
  });

  const count = (field: 'status' | 'priority', value: string) =>
    requirements.filter((row) => row[field] === value).length;
  return {
    requirements,
    summary: {
      requirements: requirements.length,
      critical: count('priority', 'critical'),
      high: count('priority', 'high'),
      blockedDirectConflict: count('status', 'blocked_direct_conflict'),
      blockedEvidenceReview: count('status', 'blocked_evidence_review'),
      blockedHumanReview: count('status', 'blocked_human_review'),
      blockedNaturalData: count('status', 'blocked_natural_data'),
      closed: count('status', 'closed'),
      amendedRequirements: contract.amendments.length,
      syntheticRowsAuthorized: 0,
      modelTrainingAuthorized: false,
    },
  };
}
