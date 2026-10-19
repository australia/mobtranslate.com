import { createHash } from 'node:crypto';
import { z } from 'zod';

const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/u);
const KeySchema = z.string().regex(/^[a-z0-9][a-z0-9.-]*$/u);
const ComponentReferenceSchema = z.object({
  path: z.string().min(1),
  sha256: Sha256Schema,
  rows: z.number().int().nonnegative(),
});

const SuiteContractSchema = z.object({
  suite_key: KeySchema,
  role: z.enum(['regression', 'operational']),
  expected_rows: z.number().int().positive(),
  output_directory: z.string().min(1),
  sampling_unit: z.string().min(1),
});

export const LexicalReconstructionBenchmarkContractSchema = z.object({
  schema_version: z.literal(1),
  benchmark_release_id: KeySchema,
  created_at_utc: z.string().datetime(),
  language: z.object({
    name: z.string().min(1),
    iso_639_3: z.string().length(3),
    glottocode: z.string().min(1),
  }),
  dictionary_edition: z.object({
    edition_id: KeySchema,
    manifest_path: z.string().min(1),
    manifest_sha256: Sha256Schema,
  }),
  components: z.object({
    dispositions: ComponentReferenceSchema,
    context_groups: ComponentReferenceSchema,
    prompt_groups: ComponentReferenceSchema,
  }),
  suites: z.object({
    source_context: SuiteContractSchema,
    prompt_group: SuiteContractSchema,
  }),
  metric_contract: z.object({
    primary_metric: z.literal('ambiguity_aware_normalized_exact_match'),
    normalization: z.object({
      unicode: z.literal('NFKC'),
      case: z.literal('lowercase'),
      whitespace: z.literal('trim_and_collapse'),
      punctuation: z.literal('preserve'),
      whole_output_only: z.literal(true),
    }),
    secondary_metrics: z.array(z.string().min(1)).min(1),
    population_interpretation: z.string().min(1),
    failure_join_unit: z.literal('source_record_id'),
  }),
  policy: z.object({
    internal_only: z.literal(true),
    sealed: z.literal(false),
    semantic_translation_claim: z.literal(false),
    sentence_translation_authorization: z.literal(false),
    training_eligibility: z.literal(false),
    redistribution_authorized: z.literal(false),
    model_output_is_linguistic_evidence: z.literal(false),
  }),
  output_root: z.string().min(1),
  claim_limit: z.string().min(1),
});

export type LexicalReconstructionBenchmarkContract = z.infer<
  typeof LexicalReconstructionBenchmarkContractSchema
>;

const DispositionSchema = z
  .object({
    sourceRecordId: z.string().min(1),
    sourceTarget: z.string().min(1),
    contextGroupId: z.string().min(1),
    promptGroupId: z.string().min(1),
    referenceMembershipStatus: z.literal(
      'accepted_for_internal_source_reconstruction_only',
    ),
    semanticTranslationStatus: z.literal('unadjudicated'),
    benchmarkEligibility: z.object({
      sourceContextReconstruction: z.literal(true),
      unconditionedPromptReconstruction: z.literal(true),
      sentenceTranslation: z.literal(false),
    }),
    trainingEligibility: z.literal('not_allowed'),
    redistributionStatus: z.literal('not_authorized'),
  })
  .passthrough();

const ContextGroupSchema = z
  .object({
    contextGroupId: z.string().min(1),
    task: z.literal('L1_internal_source_context_reconstruction'),
    inputText: z.string().min(1),
    sourcePrompt: z.string().min(1),
    sourcePromptComparison: z.string().min(1),
    sourceDefinition: z.string().min(1),
    sourceRecordIds: z.array(z.string().min(1)).min(1),
    acceptedReferences: z.array(z.string().min(1)).min(1),
    referenceScope: z.literal('internal_closed_set_source_reconstruction'),
    ambiguityStatus: z.string().min(1),
    structuralStrata: z.array(z.string().min(1)).min(1),
    semanticTranslationAccepted: z.literal(false),
    trainingEligibility: z.literal('not_allowed'),
    redistributionStatus: z.literal('not_authorized'),
  })
  .passthrough();

const PromptGroupSchema = z
  .object({
    promptGroupId: z.string().min(1),
    task: z.literal('L0_internal_dictionary_prompt_reconstruction'),
    inputText: z.string().min(1),
    sourcePromptValues: z.array(z.string().min(1)).min(1),
    sourcePromptComparison: z.string().min(1),
    sourceRecordIds: z.array(z.string().min(1)).min(1),
    acceptedReferences: z.array(z.string().min(1)).min(1),
    referenceScope: z.literal('internal_closed_set_source_reconstruction'),
    ambiguityStatus: z.string().min(1),
    semanticTranslationAccepted: z.literal(false),
    trainingEligibility: z.literal('not_allowed'),
    redistributionStatus: z.literal('not_authorized'),
  })
  .passthrough();

interface BuildInput {
  contractValue: unknown;
  dispositions: unknown[];
  contextGroups: unknown[];
  promptGroups: unknown[];
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
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

function assertUnique(values: string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw new Error(`duplicate ${label}: ${value}`);
    seen.add(value);
  }
}

function sourceTokens(value: string): string[] {
  return value.trim().split(/\s+/u).filter(Boolean);
}

function graphemeCount(value: string): number {
  const segmenter = new Intl.Segmenter('und', { granularity: 'grapheme' });
  return [...segmenter.segment(value)].length;
}

function punctuationFeatures(value: string) {
  return {
    apostrophe: /['’]/u.test(value),
    comma: value.includes(','),
    hyphen: /[-‐‑‒–—]/u.test(value),
    parentheses: /[()]/u.test(value),
    period: value.includes('.'),
    semicolon: value.includes(';'),
    slash: value.includes('/'),
  };
}

function validateMemberships(
  dispositions: z.infer<typeof DispositionSchema>[],
  groups: Array<{
    sourceRecordIds: string[];
    acceptedReferences: string[];
  }>,
  groupId: (_row: z.infer<typeof DispositionSchema>) => string,
  groupKey: (_row: (typeof groups)[number]) => string,
  label: string,
): void {
  const groupById = new Map(groups.map((row) => [groupKey(row), row]));
  for (const disposition of dispositions) {
    const group = groupById.get(groupId(disposition));
    if (!group)
      throw new Error(
        `${label} group is absent for ${disposition.sourceRecordId}`,
      );
    if (!group.sourceRecordIds.includes(disposition.sourceRecordId))
      throw new Error(`${label} group omits ${disposition.sourceRecordId}`);
    if (!group.acceptedReferences.includes(disposition.sourceTarget))
      throw new Error(`${label} references omit ${disposition.sourceTarget}`);
  }
}

export function buildLexicalReconstructionBenchmark({
  contractValue,
  dispositions: dispositionValues,
  contextGroups: contextValues,
  promptGroups: promptValues,
}: BuildInput) {
  const contract =
    LexicalReconstructionBenchmarkContractSchema.parse(contractValue);
  const dispositions = z.array(DispositionSchema).parse(dispositionValues);
  const contextGroups = z.array(ContextGroupSchema).parse(contextValues);
  const promptGroups = z.array(PromptGroupSchema).parse(promptValues);

  assertUnique(
    dispositions.map((row) => row.sourceRecordId),
    'disposition source record ID',
  );
  assertUnique(
    contextGroups.map((row) => row.contextGroupId),
    'context group ID',
  );
  assertUnique(
    promptGroups.map((row) => row.promptGroupId),
    'prompt group ID',
  );
  validateMemberships(
    dispositions,
    contextGroups,
    (row) => row.contextGroupId,
    (row) => (row as z.infer<typeof ContextGroupSchema>).contextGroupId,
    'context',
  );
  validateMemberships(
    dispositions,
    promptGroups,
    (row) => row.promptGroupId,
    (row) => (row as z.infer<typeof PromptGroupSchema>).promptGroupId,
    'prompt',
  );

  const sourceRecordIds = uniqueSorted(
    dispositions.map((row) => row.sourceRecordId),
  );
  for (const [label, groups] of [
    ['context', contextGroups],
    ['prompt', promptGroups],
  ] as const) {
    const covered = uniqueSorted(groups.flatMap((row) => row.sourceRecordIds));
    if (covered.join('\0') !== sourceRecordIds.join('\0'))
      throw new Error(
        `${label} suite does not cover the disposition population`,
      );
  }

  const sharedClaimLimit =
    'Passing this row means the complete model output matches a recorded source form under the declared normalization. It does not establish a correct semantic translation, productive lexical generalization, sentence competence, training right, or public-release right.';
  const contextRows = contextGroups.map((group) => ({
    schemaVersion: 1,
    rowId: stableId('wbv-lexical-context-benchmark-row', group.contextGroupId),
    suiteKey: contract.suites.source_context.suite_key,
    task: group.task,
    inputText: group.inputText,
    sourcePrompt: group.sourcePrompt,
    sourceDefinition: group.sourceDefinition,
    acceptedReferences: group.acceptedReferences,
    referenceScope: group.referenceScope,
    ambiguityStatus: group.ambiguityStatus,
    sourceRecordIds: group.sourceRecordIds,
    analysisJoin: {
      sourceRecordIds: group.sourceRecordIds,
      contextGroupId: group.contextGroupId,
      promptGroupId: null,
      structuralStrata: group.structuralStrata,
    },
    surfaceFeatures: {
      promptTokenCount: sourceTokens(group.sourcePrompt).length,
      definitionTokenCount: sourceTokens(group.sourceDefinition).length,
      acceptedReferenceCount: group.acceptedReferences.length,
      acceptedReferenceTokenCounts: group.acceptedReferences.map(
        (value) => sourceTokens(value).length,
      ),
      acceptedReferenceGraphemeCounts:
        group.acceptedReferences.map(graphemeCount),
      promptPunctuation: punctuationFeatures(group.sourcePrompt),
      referencePunctuation: group.acceptedReferences.map(punctuationFeatures),
    },
    metricContract: contract.metric_contract,
    sealed: false,
    trainingEligibility: 'not_allowed',
    redistributionStatus: 'not_authorized',
    claimLimit: sharedClaimLimit,
  }));
  const promptRows = promptGroups.map((group) => ({
    schemaVersion: 1,
    rowId: stableId('wbv-lexical-prompt-benchmark-row', group.promptGroupId),
    suiteKey: contract.suites.prompt_group.suite_key,
    task: group.task,
    inputText: group.inputText,
    sourcePromptValues: group.sourcePromptValues,
    acceptedReferences: group.acceptedReferences,
    referenceScope: group.referenceScope,
    ambiguityStatus: group.ambiguityStatus,
    sourceRecordIds: group.sourceRecordIds,
    analysisJoin: {
      sourceRecordIds: group.sourceRecordIds,
      contextGroupId: null,
      promptGroupId: group.promptGroupId,
    },
    surfaceFeatures: {
      promptTokenCount: sourceTokens(group.sourcePromptValues[0]).length,
      acceptedReferenceCount: group.acceptedReferences.length,
      acceptedReferenceTokenCounts: group.acceptedReferences.map(
        (value) => sourceTokens(value).length,
      ),
      acceptedReferenceGraphemeCounts:
        group.acceptedReferences.map(graphemeCount),
      promptPunctuation: punctuationFeatures(group.sourcePromptValues[0]),
      referencePunctuation: group.acceptedReferences.map(punctuationFeatures),
    },
    metricContract: contract.metric_contract,
    sealed: false,
    trainingEligibility: 'not_allowed',
    redistributionStatus: 'not_authorized',
    claimLimit: sharedClaimLimit,
  }));

  if (contextRows.length !== contract.suites.source_context.expected_rows)
    throw new Error('source-context suite row count does not match contract');
  if (promptRows.length !== contract.suites.prompt_group.expected_rows)
    throw new Error('prompt-group suite row count does not match contract');
  assertUnique(
    contextRows.map((row) => row.rowId),
    'source-context benchmark row ID',
  );
  assertUnique(
    promptRows.map((row) => row.rowId),
    'prompt benchmark row ID',
  );

  return {
    contextRows,
    promptRows,
    report: {
      sourceRecordCoverage: sourceRecordIds.length,
      uniqueTargetSurfaceCoverage: uniqueSorted(
        dispositions.map((row) => row.sourceTarget),
      ).length,
      sourceContextRows: contextRows.length,
      sourceContextAmbiguousRows: contextRows.filter(
        (row) => row.acceptedReferences.length > 1,
      ).length,
      promptGroupRows: promptRows.length,
      promptGroupAmbiguousRows: promptRows.filter(
        (row) => row.acceptedReferences.length > 1,
      ).length,
      sealedRows: 0,
      semanticTranslationReferences: 0,
      trainingEligibleRows: 0,
      publicRows: 0,
    },
  };
}
