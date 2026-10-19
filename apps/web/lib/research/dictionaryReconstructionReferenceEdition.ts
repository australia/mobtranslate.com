import { createHash } from 'node:crypto';
import { z } from 'zod';

const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/u);
const KeySchema = z.string().regex(/^[a-z0-9][a-z0-9.-]*$/u);

const ComponentReferenceSchema = z.object({
  path: z.string().min(1),
  sha256: Sha256Schema,
  rows: z.number().int().nonnegative(),
});

const CensusOutputReferenceSchema = ComponentReferenceSchema.extend({
  rows: z.number().int().nonnegative().nullable(),
});

export const DictionaryReconstructionReferenceContractSchema = z.object({
  schema_version: z.literal(1),
  edition_id: KeySchema,
  parent_edition_id: KeySchema,
  created_at_utc: z.string().datetime(),
  status: z.literal('internal_reconstruction_reference_scope_expansion'),
  scope: z.object({
    language: z.string().min(1),
    iso_639_3: z.string().length(3),
    glottocode: z.string().min(1),
    variety: z.string().min(1),
    orthographies: z.array(z.string().min(1)).min(1),
  }),
  parent_manifest: z.object({ path: z.string().min(1), sha256: Sha256Schema }),
  candidate_census: z.object({
    census_id: KeySchema,
    manifest_path: z.string().min(1),
    manifest_sha256: Sha256Schema,
    records_component_key: z.literal('records'),
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
    current_source_records: z.number().int().positive(),
    current_target_surfaces: z.number().int().positive(),
    context_groups: z.number().int().positive(),
    multi_target_context_groups: z.number().int().nonnegative(),
    rows_in_multi_target_context_groups: z.number().int().nonnegative(),
    prompt_groups: z.number().int().positive(),
    multi_target_prompt_groups: z.number().int().nonnegative(),
  }),
  reference_policy: z.object({
    evaluation_scope: z.literal('internal_closed_set_source_reconstruction'),
    semantic_translation_acceptance: z.literal(false),
    training_eligibility: z.literal(false),
    redistribution_authorized: z.literal(false),
    model_output_is_linguistic_evidence: z.literal(false),
    ambiguity_requires_reference_sets: z.literal(true),
  }),
  current_pointer_path: z.string().min(1),
  supersedes_pointer_sha256: Sha256Schema,
  release_status: z.literal('not_released'),
  claim_limit: z.string().min(1),
});

export type DictionaryReconstructionReferenceContract = z.infer<
  typeof DictionaryReconstructionReferenceContractSchema
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

const CensusManifestSchema = z.object({
  census_id: KeySchema,
  dictionary_edition: z.object({
    edition_id: KeySchema,
    manifest_sha256: Sha256Schema,
  }),
  outputs: z.record(z.string(), CensusOutputReferenceSchema),
  validation: z.object({
    acceptedReferences: z.literal(0),
    registeredBenchmarkRows: z.literal(0),
    trainingEligibleRows: z.literal(0),
    benchmarkRegistrationAllowed: z.literal(false),
  }),
});

const CensusRecordSchema = z
  .object({
    sourceLayer: z.enum(['current', 'historical']),
    sourceRecordId: z.string().min(1),
    sourceId: z.string().min(1),
    sourceOrdinal: z.number().int().positive(),
    sourceRecordSha256: Sha256Schema,
    entryCandidateId: z.string().min(1),
    senseCandidateId: z.string().min(1),
    formCandidateId: z.string().min(1),
    sourceTargetCandidate: z.object({
      source: z.string().min(1),
      comparison: z.string().min(1),
      acceptedReference: z.literal(false),
    }),
    sourcePromptCandidate: z
      .object({
        source: z.string().min(1),
        comparison: z.string().min(1),
        definitionSource: z.string().min(1),
        acceptedReferences: z.array(z.never()).length(0),
      })
      .nullable(),
    grouping: z.object({
      promptGroupId: z.string().min(1).nullable(),
      headwordGroupId: z.string().min(1),
    }),
    structuralStratum: z.string().min(1),
    blockerCodes: z.array(z.string().min(1)),
  })
  .passthrough();

const SourceSchema = z
  .object({
    source_id: z.string().min(1),
    training_use: z.enum(['unknown', 'allowed', 'not_allowed', 'needs_review']),
    redistribution: z.enum([
      'unknown',
      'allowed',
      'not_allowed',
      'needs_review',
    ]),
    derived_weights: z.enum([
      'unknown',
      'allowed',
      'not_allowed',
      'needs_review',
    ]),
    hosted_transfer: z.enum([
      'unknown',
      'allowed',
      'not_allowed',
      'needs_review',
    ]),
  })
  .passthrough();

interface BuildInput {
  contractValue: unknown;
  parentManifestValue: unknown;
  censusManifestValue: unknown;
  censusRecords: unknown[];
  sourceLedgerRows: unknown[];
  changeLedgerRows: Array<Record<string, unknown>>;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalize(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('en')
    .trim()
    .replace(/\s+/gu, ' ');
}

function stableId(prefix: string, ...parts: string[]): string {
  const digest = createHash('sha256')
    .update(parts.join('\0'))
    .digest('hex')
    .slice(0, 24);
  return `${prefix}-${digest}`;
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort(compareText);
}

function grouped<T>(rows: T[], key: (_row: T) => string): Map<string, T[]> {
  const result = new Map<string, T[]>();
  for (const row of rows) {
    const groupKey = key(row);
    result.set(groupKey, [...(result.get(groupKey) ?? []), row]);
  }
  return result;
}

function assertUnique(values: string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw new Error(`duplicate ${label}: ${value}`);
    seen.add(value);
  }
}

export function buildDictionaryReconstructionReferenceEdition({
  contractValue,
  parentManifestValue,
  censusManifestValue,
  censusRecords,
  sourceLedgerRows,
  changeLedgerRows,
}: BuildInput) {
  const contract =
    DictionaryReconstructionReferenceContractSchema.parse(contractValue);
  const parent = ParentManifestSchema.parse(parentManifestValue);
  const census = CensusManifestSchema.parse(censusManifestValue);
  const records = z.array(CensusRecordSchema).parse(censusRecords);
  const sources = z.array(SourceSchema).parse(sourceLedgerRows);

  if (parent.edition_id !== contract.parent_edition_id)
    throw new Error('parent edition ID does not match the contract');
  if (census.census_id !== contract.candidate_census.census_id)
    throw new Error('candidate census ID does not match the contract');
  if (census.dictionary_edition.edition_id !== contract.parent_edition_id)
    throw new Error('candidate census is not bound to the parent dictionary');
  if (
    census.dictionary_edition.manifest_sha256 !==
    contract.parent_manifest.sha256
  )
    throw new Error('candidate census parent manifest hash does not match');

  const recordComponent =
    census.outputs[contract.candidate_census.records_component_key];
  if (!recordComponent)
    throw new Error('candidate census records component is absent');

  const source = sources.find(
    (row) => row.source_id === contract.current_dictionary_source_id,
  );
  if (!source) throw new Error('current dictionary source is absent');
  for (const field of [
    'training_use',
    'redistribution',
    'derived_weights',
    'hosted_transfer',
  ] as const) {
    if (source[field] === 'allowed')
      throw new Error(
        `contract requires a non-release scope, but source ${field} is allowed`,
      );
  }

  const change = changeLedgerRows.find(
    (row) => row.change_id === contract.change_ledger.issuing_change_id,
  );
  if (!change) throw new Error('issuing dictionary change is absent');
  if (
    change.new_edition_id !== contract.edition_id ||
    change.parent_edition_id !== contract.parent_edition_id ||
    change.status !== 'candidate'
  )
    throw new Error('issuing dictionary change has the wrong lineage');

  assertUnique(
    records.map((row) => row.sourceRecordId),
    'census source record ID',
  );
  const currentRecords = records
    .filter((row) => row.sourceLayer === 'current')
    .sort((left, right) => left.sourceOrdinal - right.sourceOrdinal);
  for (const row of currentRecords) {
    if (row.sourceId !== contract.current_dictionary_source_id)
      throw new Error(`unexpected current source: ${row.sourceId}`);
    if (!row.sourcePromptCandidate || !row.grouping.promptGroupId)
      throw new Error(
        `current record lacks prompt evidence: ${row.sourceRecordId}`,
      );
  }

  const contextGroupsMap = grouped(currentRecords, (row) => {
    const prompt = row.sourcePromptCandidate!;
    return `${prompt.comparison}\0${normalize(prompt.definitionSource)}`;
  });
  const promptGroupsMap = grouped(
    currentRecords,
    (row) => row.sourcePromptCandidate!.comparison,
  );

  const contextGroups = [...contextGroupsMap.entries()]
    .map(([groupKey, groupRows]) => {
      const prompt = groupRows[0].sourcePromptCandidate!;
      const acceptedReferences = uniqueSorted(
        groupRows.map((row) => row.sourceTargetCandidate.source),
      );
      const contextGroupId = stableId('wbv-reconstruction-context', groupKey);
      return {
        schemaVersion: 1,
        contextGroupId,
        task: 'L1_internal_source_context_reconstruction',
        inputText: `<lexeme> ${prompt.source}\nDefinition: ${prompt.definitionSource}`,
        sourcePrompt: prompt.source,
        sourcePromptComparison: prompt.comparison,
        sourceDefinition: prompt.definitionSource,
        sourceRecordIds: uniqueSorted(
          groupRows.map((row) => row.sourceRecordId),
        ),
        entryCandidateIds: uniqueSorted(
          groupRows.map((row) => row.entryCandidateId),
        ),
        acceptedReferences,
        referenceScope: 'internal_closed_set_source_reconstruction',
        ambiguityStatus:
          acceptedReferences.length > 1
            ? 'source_context_underdetermined_reference_set'
            : 'single_source_context_reference',
        structuralStrata: uniqueSorted(
          groupRows.map((row) => row.structuralStratum),
        ),
        semanticTranslationAccepted: false,
        trainingEligibility: 'not_allowed',
        redistributionStatus: 'not_authorized',
      };
    })
    .sort((left, right) =>
      compareText(left.contextGroupId, right.contextGroupId),
    );

  const contextGroupByRecord = new Map<
    string,
    (typeof contextGroups)[number]
  >();
  for (const group of contextGroups)
    for (const sourceRecordId of group.sourceRecordIds)
      contextGroupByRecord.set(sourceRecordId, group);

  const promptGroups = [...promptGroupsMap.entries()]
    .map(([promptComparison, groupRows]) => {
      const sourceValues = uniqueSorted(
        groupRows.map((row) => row.sourcePromptCandidate!.source),
      );
      const promptGroupIds = uniqueSorted(
        groupRows.map((row) => row.grouping.promptGroupId!),
      );
      if (promptGroupIds.length !== 1)
        throw new Error(
          `prompt comparison has multiple group IDs: ${promptComparison}`,
        );
      const acceptedReferences = uniqueSorted(
        groupRows.map((row) => row.sourceTargetCandidate.source),
      );
      return {
        schemaVersion: 1,
        promptGroupId: promptGroupIds[0],
        task: 'L0_internal_dictionary_prompt_reconstruction',
        inputText: `<lexeme> ${sourceValues[0]}`,
        sourcePromptValues: sourceValues,
        sourcePromptComparison: promptComparison,
        sourceRecordIds: uniqueSorted(
          groupRows.map((row) => row.sourceRecordId),
        ),
        acceptedReferences,
        referenceScope: 'internal_closed_set_source_reconstruction',
        ambiguityStatus:
          acceptedReferences.length > 1
            ? 'unconditioned_prompt_reference_set'
            : 'single_unconditioned_reference',
        semanticTranslationAccepted: false,
        trainingEligibility: 'not_allowed',
        redistributionStatus: 'not_authorized',
      };
    })
    .sort((left, right) =>
      compareText(left.sourcePromptComparison, right.sourcePromptComparison),
    );

  const promptGroupByRecord = new Map<string, (typeof promptGroups)[number]>();
  for (const group of promptGroups)
    for (const sourceRecordId of group.sourceRecordIds)
      promptGroupByRecord.set(sourceRecordId, group);

  const dispositions = currentRecords.map((row) => {
    const contextGroup = contextGroupByRecord.get(row.sourceRecordId);
    const promptGroup = promptGroupByRecord.get(row.sourceRecordId);
    if (!contextGroup || !promptGroup)
      throw new Error(
        `record lacks reconstruction group: ${row.sourceRecordId}`,
      );
    return {
      schemaVersion: 1,
      dispositionId: stableId(
        'wbv-reconstruction-reference-disposition',
        row.sourceRecordId,
      ),
      sourceRecordId: row.sourceRecordId,
      sourceRecordSha256: row.sourceRecordSha256,
      entryCandidateId: row.entryCandidateId,
      senseCandidateId: row.senseCandidateId,
      formCandidateId: row.formCandidateId,
      sourcePrompt: row.sourcePromptCandidate!.source,
      sourceDefinition: row.sourcePromptCandidate!.definitionSource,
      sourceTarget: row.sourceTargetCandidate.source,
      contextGroupId: contextGroup.contextGroupId,
      promptGroupId: promptGroup.promptGroupId,
      referenceMembershipStatus:
        'accepted_for_internal_source_reconstruction_only',
      semanticTranslationStatus: 'unadjudicated',
      lexicalIdentityStatus: 'unadjudicated_source_record',
      partOfSpeechStatus: 'not_provided_by_source',
      benchmarkEligibility: {
        sourceContextReconstruction: true,
        unconditionedPromptReconstruction: true,
        sentenceTranslation: false,
      },
      trainingEligibility: 'not_allowed',
      redistributionStatus: 'not_authorized',
      hostedTransferStatus: 'not_authorized',
      claimLimit:
        'This disposition accepts the exact published form only as a member of an internal source-reconstruction reference set; it does not accept a semantic translation, sense relation, training row, or release right.',
    };
  });

  const multiTargetContextGroups = contextGroups.filter(
    (row) => row.acceptedReferences.length > 1,
  );
  const multiTargetPromptGroups = promptGroups.filter(
    (row) => row.acceptedReferences.length > 1,
  );
  const actualCounts = {
    current_source_records: currentRecords.length,
    current_target_surfaces: uniqueSorted(
      currentRecords.map((row) => row.sourceTargetCandidate.source),
    ).length,
    context_groups: contextGroups.length,
    multi_target_context_groups: multiTargetContextGroups.length,
    rows_in_multi_target_context_groups: multiTargetContextGroups.reduce(
      (total, row) => total + row.sourceRecordIds.length,
      0,
    ),
    prompt_groups: promptGroups.length,
    multi_target_prompt_groups: multiTargetPromptGroups.length,
  };
  for (const [key, expected] of Object.entries(contract.expected_counts)) {
    const actual = actualCounts[key as keyof typeof actualCounts];
    if (actual !== expected)
      throw new Error(
        `expected count mismatch for ${key}: ${actual} != ${expected}`,
      );
  }

  return {
    dispositions,
    contextGroups,
    promptGroups,
    report: {
      ...actualCounts,
      acceptedInternalReferenceMemberships: dispositions.length,
      acceptedSemanticTranslations: 0,
      acceptedTrainingRows: 0,
      publicBenchmarkRows: 0,
      sourceRightsState: {
        training_use: source.training_use,
        redistribution: source.redistribution,
        derived_weights: source.derived_weights,
        hosted_transfer: source.hosted_transfer,
      },
    },
  };
}
