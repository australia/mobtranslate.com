import { createHash } from 'node:crypto';
import { z } from 'zod';
import { canonicalJson } from './dictionarySourceCensus';

const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/u);
const IdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u);

export const SyntheticReviewArtifactReferenceSchema = z.object({
  path: z.string().min(1),
  sha256: Sha256Schema,
  rows: z.number().int().nonnegative().optional(),
});

const EvidenceComponentSchema = SyntheticReviewArtifactReferenceSchema.extend({
  component_id: IdSchema,
  record_id_field: z.string().min(1),
  source_cluster_id: IdSchema,
  rows: z.number().int().nonnegative(),
});

const SourceReviewArtifactSchema =
  SyntheticReviewArtifactReferenceSchema.extend({
    artifact_id: IdSchema,
    review_scope: z.string().min(1),
  });

const ClosedCandidateStateSchema = z.object({
  acceptance_status: z.literal('accepted_for_pre_census_candidate_generation'),
  synthetic_eligibility: z.literal('candidate_only_pending_failure_census'),
  training_eligibility: z.literal('not_allowed'),
  benchmark_eligibility: z.literal('not_allowed'),
  controlled_corpus_issued: z.literal(false),
});

const SlotContractSchema = z.object({
  slot_name: IdSchema,
  role: z.string().min(1),
  allowed_slot_classes: z.array(IdSchema).min(1),
  required_grammatical_features: z.record(z.string(), z.string()).default({}),
});

const ConstructionFamilySchema = ClosedCandidateStateSchema.extend({
  construction_id: IdSchema,
  task_id: IdSchema,
  construction_family: IdSchema,
  source_pattern: z.string().min(1),
  target_pattern: z.string().min(1),
  predicate_and_valency_frame: z.string().min(1),
  participant_configuration: z.string().min(1),
  polarity_tam_and_mood: z.string().min(1),
  sentence_length_and_clause_depth: z.string().min(1),
  slots: z.array(SlotContractSchema).min(1),
  evidence_record_ids: z.array(IdSchema).min(2),
  source_cluster_ids: z.array(IdSchema).min(2),
  limitations: z.array(z.string().min(1)).min(1),
});

const LexicalRealizationSchema = ClosedCandidateStateSchema.extend({
  realization_id: IdSchema,
  entry_candidate_id: IdSchema,
  sense_candidate_id: IdSchema,
  form_candidate_id: IdSchema,
  english_surface: z.string().min(1),
  english_surface_evidence: z.object({
    sense_field: z.enum(['translationSource', 'definitionSource']),
    source_value: z.string().min(1),
    relation: z.literal('exact'),
  }),
  target_surface: z.string().min(1),
  part_of_speech: z.string().min(1),
  morphology_status: z.literal('full_published_surface_no_generation'),
  slot_classes: z.array(IdSchema).min(1),
  grammatical_features: z.record(z.string(), z.string()).default({}),
  source_ids: z.array(IdSchema).min(1),
  source_record_ids: z.array(IdSchema).min(1),
  source_cluster_ids: z.array(IdSchema).min(1),
  evidence_record_ids: z.array(IdSchema).default([]),
  limitations: z.array(z.string().min(1)).min(1),
});

const BindingSchema = ClosedCandidateStateSchema.extend({
  binding_id: IdSchema,
  construction_id: IdSchema,
  bindings: z.record(IdSchema, IdSchema),
  semantic_compatibility_status: z.literal(
    'accepted_for_pre_census_candidate_preview',
  ),
  semantic_compatibility_rationale: z.string().min(1),
  evidence_record_ids: z.array(IdSchema).default([]),
  source_cluster_ids: z.array(IdSchema).min(1),
  limitations: z.array(z.string().min(1)).min(1),
});

export const SyntheticConstructionReviewContractSchema = z.object({
  schema_version: z.literal(1),
  review_id: IdSchema,
  created_at_utc: z.string().datetime(),
  status: z.literal('pre_census_linguistic_candidate_review'),
  output_root: z.string().min(1),
  scope: z.object({
    language: z.string().min(1),
    iso_639_3: z.string().length(3),
    variety: z.string().min(1),
    orthography: z.string().min(1),
  }),
  source_ledger: SyntheticReviewArtifactReferenceSchema,
  dictionary_context: z.object({
    edition_id: IdSchema,
    manifest: SyntheticReviewArtifactReferenceSchema,
    entry_component_key: IdSchema,
    sense_component_key: IdSchema,
    form_component_key: IdSchema,
  }),
  grammar_context: z.object({
    edition_id: IdSchema,
    manifest: SyntheticReviewArtifactReferenceSchema,
  }),
  evidence_components: z.array(EvidenceComponentSchema).min(2),
  source_review_artifacts: z.array(SourceReviewArtifactSchema).default([]),
  construction_families: z.array(ConstructionFamilySchema).min(1),
  lexical_realizations: z.array(LexicalRealizationSchema).min(1),
  explicit_bindings: z.array(BindingSchema).min(1),
  policy: z.object({
    automatic_cartesian_expansion: z.literal(false),
    generated_pairs_are_linguistic_evidence: z.literal(false),
    model_output_is_linguistic_evidence: z.literal(false),
    census_required_before_coverage_commission: z.literal(true),
    living_book_child_editions_required_before_controlled_issuance:
      z.literal(true),
    training_approval_separate: z.literal(true),
  }),
  expected_counts: z.object({
    construction_families: z.number().int().positive(),
    lexical_realizations: z.number().int().positive(),
    explicit_bindings: z.number().int().positive(),
    candidate_pair_previews: z.number().int().positive(),
    controlled_corpus_rows: z.literal(0),
    training_eligible_rows: z.literal(0),
  }),
  claim_limit: z.string().min(1),
});

export type SyntheticConstructionReviewContract = z.infer<
  typeof SyntheticConstructionReviewContractSchema
>;

export interface SyntheticConstructionReviewInput {
  contractValue: unknown;
  sourceLedgerRows: Array<Record<string, unknown>>;
  dictionaryManifestValue: unknown;
  dictionaryEntries: Array<Record<string, unknown>>;
  dictionarySenses: Array<Record<string, unknown>>;
  dictionaryForms: Array<Record<string, unknown>>;
  evidenceRowsByComponent: Map<string, Array<Record<string, unknown>>>;
}

export interface SyntheticCandidatePairPreview {
  schemaVersion: 1;
  reviewId: string;
  pairId: string;
  pairKind: 'pre_census_synthetic_candidate_preview';
  sourceText: string;
  targetText: string;
  taskId: string;
  constructionId: string;
  constructionFamily: string;
  bindingId: string;
  bindings: Record<string, string>;
  lexicalRealizationIds: string[];
  evidenceRecordIds: string[];
  sourceClusterIds: string[];
  acceptanceStatus: 'candidate_preview_only';
  syntheticEligibility: 'pending_failure_census_and_living_book_issuance';
  trainingEligibility: 'not_allowed';
  benchmarkEligibility: 'not_allowed';
  controlledCorpusIssued: false;
  modelOutputIsLinguisticEvidence: false;
  syntheticOutputIsLinguisticEvidence: false;
  limitations: string[];
}

export interface SyntheticConstructionReviewResult {
  constructionFamilies: Array<Record<string, unknown>>;
  lexicalRealizations: Array<Record<string, unknown>>;
  explicitBindings: Array<Record<string, unknown>>;
  candidatePairPreviews: SyntheticCandidatePairPreview[];
  evidenceIndex: Array<Record<string, unknown>>;
  validation: {
    constructionFamilies: number;
    lexicalRealizations: number;
    explicitBindings: number;
    candidatePairPreviews: number;
    evidenceRecords: number;
    controlledCorpusRows: 0;
    trainingEligibleRows: 0;
  };
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function stringField(
  value: Record<string, unknown>,
  field: string,
  label: string,
): string {
  const result = value[field];
  if (typeof result !== 'string' || result.length === 0)
    throw new Error(`${label} lacks ${field}`);
  return result;
}

function assertUnique<T>(
  rows: T[],
  key: (_row: T) => string,
  label: string,
): void {
  const seen = new Set<string>();
  for (const row of rows) {
    const value = key(row);
    if (seen.has(value)) throw new Error(`duplicate ${label}: ${value}`);
    seen.add(value);
  }
}

function recordMap(
  rows: Array<Record<string, unknown>>,
  idField: string,
  label: string,
): Map<string, Record<string, unknown>> {
  const result = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    const id = stringField(row, idField, label);
    if (result.has(id)) throw new Error(`duplicate ${label}: ${id}`);
    result.set(id, row);
  }
  return result;
}

function placeholders(pattern: string): string[] {
  return [...pattern.matchAll(/\{([A-Za-z0-9._:-]+)\}/gu)].map(
    (match) => match[1],
  );
}

function render(
  pattern: string,
  values: Record<string, string>,
  label: string,
): string {
  const names = placeholders(pattern);
  const uniqueNames = new Set(names);
  if (names.length !== uniqueNames.size)
    throw new Error(`${label} repeats a placeholder`);
  if (uniqueNames.size !== Object.keys(values).length)
    throw new Error(`${label} placeholder count does not match bindings`);
  let output = pattern;
  for (const name of uniqueNames) {
    const value = values[name];
    if (!value) throw new Error(`${label} lacks binding for ${name}`);
    output = output.replace(`{${name}}`, value);
  }
  if (placeholders(output).length > 0)
    throw new Error(`${label} retained an unresolved placeholder`);
  return output;
}

function shortHash(value: unknown): string {
  return createHash('sha256')
    .update(canonicalJson(value))
    .digest('hex')
    .slice(0, 24);
}

function featureSubset(
  required: Record<string, string>,
  actual: Record<string, string>,
): boolean {
  return Object.entries(required).every(
    ([key, value]) => actual[key] === value,
  );
}

function assertExpectedCounts(
  contract: SyntheticConstructionReviewContract,
  result: SyntheticConstructionReviewResult,
): void {
  const observed = result.validation;
  const expected = contract.expected_counts;
  const comparisons: Array<[string, number, number]> = [
    [
      'construction_families',
      observed.constructionFamilies,
      expected.construction_families,
    ],
    [
      'lexical_realizations',
      observed.lexicalRealizations,
      expected.lexical_realizations,
    ],
    [
      'explicit_bindings',
      observed.explicitBindings,
      expected.explicit_bindings,
    ],
    [
      'candidate_pair_previews',
      observed.candidatePairPreviews,
      expected.candidate_pair_previews,
    ],
    [
      'controlled_corpus_rows',
      observed.controlledCorpusRows,
      expected.controlled_corpus_rows,
    ],
    [
      'training_eligible_rows',
      observed.trainingEligibleRows,
      expected.training_eligible_rows,
    ],
  ];
  for (const [label, actual, wanted] of comparisons)
    if (actual !== wanted)
      throw new Error(
        `expected count mismatch for ${label}: ${actual} != ${wanted}`,
      );
}

export function buildSyntheticConstructionReview(
  input: SyntheticConstructionReviewInput,
): SyntheticConstructionReviewResult {
  const contract = SyntheticConstructionReviewContractSchema.parse(
    input.contractValue,
  );
  const manifest = object(input.dictionaryManifestValue, 'dictionary manifest');
  if (manifest.edition_id !== contract.dictionary_context.edition_id)
    throw new Error('dictionary edition ID does not match its manifest');

  const sourceIds = new Set(
    input.sourceLedgerRows.map((row) =>
      stringField(row, 'source_id', 'source ledger row'),
    ),
  );
  if (sourceIds.size !== input.sourceLedgerRows.length)
    throw new Error('source ledger contains duplicate source IDs');

  const entries = recordMap(
    input.dictionaryEntries,
    'entryCandidateId',
    'dictionary entry',
  );
  const senses = recordMap(
    input.dictionarySenses,
    'senseCandidateId',
    'dictionary sense',
  );
  const forms = recordMap(
    input.dictionaryForms,
    'formCandidateId',
    'dictionary form',
  );

  const evidenceIndex = new Map<
    string,
    { componentId: string; sourceClusterId: string }
  >();
  for (const component of contract.evidence_components) {
    const rows = input.evidenceRowsByComponent.get(component.component_id);
    if (!rows)
      throw new Error(`missing evidence component: ${component.component_id}`);
    if (rows.length !== component.rows)
      throw new Error(
        `evidence row count mismatch for ${component.component_id}: ${rows.length} != ${component.rows}`,
      );
    for (const row of rows) {
      const recordId = stringField(
        row,
        component.record_id_field,
        component.component_id,
      );
      if (evidenceIndex.has(recordId))
        throw new Error(`duplicate evidence record ID: ${recordId}`);
      evidenceIndex.set(recordId, {
        componentId: component.component_id,
        sourceClusterId: component.source_cluster_id,
      });
    }
  }

  const constructions = [...contract.construction_families].sort(
    (left, right) => left.construction_id.localeCompare(right.construction_id),
  );
  const realizations = [...contract.lexical_realizations].sort((left, right) =>
    left.realization_id.localeCompare(right.realization_id),
  );
  const bindings = [...contract.explicit_bindings].sort((left, right) =>
    left.binding_id.localeCompare(right.binding_id),
  );
  assertUnique(constructions, (row) => row.construction_id, 'construction ID');
  assertUnique(realizations, (row) => row.realization_id, 'realization ID');
  assertUnique(bindings, (row) => row.binding_id, 'binding ID');

  const constructionById = new Map(
    constructions.map((row) => [row.construction_id, row]),
  );
  const realizationById = new Map(
    realizations.map((row) => [row.realization_id, row]),
  );

  for (const construction of constructions) {
    assertUnique(construction.slots, (slot) => slot.slot_name, 'slot name');
    const expectedSlots = construction.slots
      .map((slot) => slot.slot_name)
      .sort();
    const sourceSlots = [
      ...new Set(placeholders(construction.source_pattern)),
    ].sort();
    const targetSlots = [
      ...new Set(placeholders(construction.target_pattern)),
    ].sort();
    if (canonicalJson(sourceSlots) !== canonicalJson(expectedSlots))
      throw new Error(
        `${construction.construction_id} source slots do not match`,
      );
    if (canonicalJson(targetSlots) !== canonicalJson(expectedSlots))
      throw new Error(
        `${construction.construction_id} target slots do not match`,
      );
    const observedClusters = new Set<string>();
    for (const evidenceId of construction.evidence_record_ids) {
      const evidence = evidenceIndex.get(evidenceId);
      if (!evidence)
        throw new Error(
          `${construction.construction_id} references unknown evidence ${evidenceId}`,
        );
      observedClusters.add(evidence.sourceClusterId);
    }
    for (const clusterId of construction.source_cluster_ids)
      if (!observedClusters.has(clusterId))
        throw new Error(
          `${construction.construction_id} declares unsupported source cluster ${clusterId}`,
        );
    if (observedClusters.size < 2)
      throw new Error(
        `${construction.construction_id} lacks two evidence source clusters`,
      );
  }

  for (const realization of realizations) {
    const entry = entries.get(realization.entry_candidate_id);
    const sense = senses.get(realization.sense_candidate_id);
    const form = forms.get(realization.form_candidate_id);
    if (!entry || !sense || !form)
      throw new Error(`${realization.realization_id} lacks dictionary records`);
    if (sense.entryCandidateId !== realization.entry_candidate_id)
      throw new Error(
        `${realization.realization_id} sense belongs to another entry`,
      );
    if (form.entryCandidateId !== realization.entry_candidate_id)
      throw new Error(
        `${realization.realization_id} form belongs to another entry`,
      );
    if (form.surfaceSource !== realization.target_surface)
      throw new Error(
        `${realization.realization_id} changes the published surface`,
      );
    const englishSenseValue =
      sense[realization.english_surface_evidence.sense_field];
    if (
      englishSenseValue !== realization.english_surface_evidence.source_value ||
      realization.english_surface !==
        realization.english_surface_evidence.source_value
    )
      throw new Error(
        `${realization.realization_id} changes the published English sense surface`,
      );
    const dictionarySourceRecordIds = new Set(
      [entry.sourceRecordId, sense.sourceRecordId, form.sourceRecordId]
        .filter((value): value is string => typeof value === 'string')
        .concat(
          Array.isArray(form.sourceRecordIds)
            ? form.sourceRecordIds.filter(
                (value): value is string => typeof value === 'string',
              )
            : [],
        ),
    );
    for (const sourceRecordId of realization.source_record_ids)
      if (!dictionarySourceRecordIds.has(sourceRecordId))
        throw new Error(
          `${realization.realization_id} references unrelated source record ${sourceRecordId}`,
        );
    for (const sourceId of realization.source_ids)
      if (!sourceIds.has(sourceId))
        throw new Error(
          `${realization.realization_id} references unknown source ${sourceId}`,
        );
    for (const evidenceId of realization.evidence_record_ids)
      if (!evidenceIndex.has(evidenceId))
        throw new Error(
          `${realization.realization_id} references unknown evidence ${evidenceId}`,
        );
  }

  const pairPreviews: SyntheticCandidatePairPreview[] = [];
  for (const binding of bindings) {
    const construction = constructionById.get(binding.construction_id);
    if (!construction)
      throw new Error(`${binding.binding_id} references unknown construction`);
    const slotNames = construction.slots.map((slot) => slot.slot_name).sort();
    const bindingNames = Object.keys(binding.bindings).sort();
    if (canonicalJson(slotNames) !== canonicalJson(bindingNames))
      throw new Error(
        `${binding.binding_id} does not bind every slot exactly once`,
      );

    const sourceValues: Record<string, string> = {};
    const targetValues: Record<string, string> = {};
    const realizationIds: string[] = [];
    const sourceClusters = new Set([
      ...construction.source_cluster_ids,
      ...binding.source_cluster_ids,
    ]);
    const evidenceIds = new Set([
      ...construction.evidence_record_ids,
      ...binding.evidence_record_ids,
    ]);
    for (const slot of construction.slots) {
      const realizationId = binding.bindings[slot.slot_name];
      const realization = realizationById.get(realizationId);
      if (!realization)
        throw new Error(
          `${binding.binding_id} references unknown realization ${realizationId}`,
        );
      if (
        !realization.slot_classes.some((slotClass) =>
          slot.allowed_slot_classes.includes(slotClass),
        )
      )
        throw new Error(
          `${binding.binding_id} uses incompatible realization ${realizationId}`,
        );
      if (
        !featureSubset(
          slot.required_grammatical_features,
          realization.grammatical_features,
        )
      )
        throw new Error(
          `${binding.binding_id} lacks required features for ${slot.slot_name}`,
        );
      sourceValues[slot.slot_name] = realization.english_surface;
      targetValues[slot.slot_name] = realization.target_surface;
      realizationIds.push(realizationId);
      realization.source_cluster_ids.forEach((value) =>
        sourceClusters.add(value),
      );
      realization.evidence_record_ids.forEach((value) =>
        evidenceIds.add(value),
      );
    }
    for (const evidenceId of binding.evidence_record_ids)
      if (!evidenceIndex.has(evidenceId))
        throw new Error(
          `${binding.binding_id} references unknown evidence ${evidenceId}`,
        );
    const sourceText = render(
      construction.source_pattern,
      sourceValues,
      `${binding.binding_id} source pattern`,
    );
    const targetText = render(
      construction.target_pattern,
      targetValues,
      `${binding.binding_id} target pattern`,
    );
    const identity = {
      reviewId: contract.review_id,
      constructionId: construction.construction_id,
      bindingId: binding.binding_id,
      sourceText,
      targetText,
    };
    pairPreviews.push({
      schemaVersion: 1,
      reviewId: contract.review_id,
      pairId: `synthetic-preview:${shortHash(identity)}`,
      pairKind: 'pre_census_synthetic_candidate_preview',
      sourceText,
      targetText,
      taskId: construction.task_id,
      constructionId: construction.construction_id,
      constructionFamily: construction.construction_family,
      bindingId: binding.binding_id,
      bindings: { ...binding.bindings },
      lexicalRealizationIds: realizationIds.sort(),
      evidenceRecordIds: [...evidenceIds].sort(),
      sourceClusterIds: [...sourceClusters].sort(),
      acceptanceStatus: 'candidate_preview_only',
      syntheticEligibility: 'pending_failure_census_and_living_book_issuance',
      trainingEligibility: 'not_allowed',
      benchmarkEligibility: 'not_allowed',
      controlledCorpusIssued: false,
      modelOutputIsLinguisticEvidence: false,
      syntheticOutputIsLinguisticEvidence: false,
      limitations: [
        ...construction.limitations,
        ...binding.limitations,
        'This preview is not a controlled-corpus row until the failure census, living-book child editions, coverage commission, and separate training review pass.',
      ],
    });
  }
  assertUnique(pairPreviews, (row) => row.pairId, 'candidate pair ID');
  const duplicateText = new Set<string>();
  for (const row of pairPreviews) {
    const key = canonicalJson([row.sourceText, row.targetText]);
    if (duplicateText.has(key))
      throw new Error(`duplicate candidate text pair: ${row.sourceText}`);
    duplicateText.add(key);
  }

  const result: SyntheticConstructionReviewResult = {
    constructionFamilies: constructions,
    lexicalRealizations: realizations,
    explicitBindings: bindings,
    candidatePairPreviews: pairPreviews.sort((left, right) =>
      left.pairId.localeCompare(right.pairId),
    ),
    evidenceIndex: [...evidenceIndex.entries()]
      .map(([recordId, value]) => ({
        schemaVersion: 1,
        recordId,
        componentId: value.componentId,
        sourceClusterId: value.sourceClusterId,
      }))
      .sort((left, right) => left.recordId.localeCompare(right.recordId)),
    validation: {
      constructionFamilies: constructions.length,
      lexicalRealizations: realizations.length,
      explicitBindings: bindings.length,
      candidatePairPreviews: pairPreviews.length,
      evidenceRecords: evidenceIndex.size,
      controlledCorpusRows: 0,
      trainingEligibleRows: 0,
    },
  };
  assertExpectedCounts(contract, result);
  return result;
}
