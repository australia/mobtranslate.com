import { createHash } from 'node:crypto';
import { z } from 'zod';

const ArtifactReferenceSchema = z.object({
  path: z.string().min(1),
  sha256: z.string().regex(/^[0-9a-f]{64}$/u),
});

const SourceTextSchema = z.object({
  source_id: z.string().min(1),
  title: z.string().min(1),
  artifact: ArtifactReferenceSchema,
  expected_lines: z.number().int().positive(),
  training_use: z.literal('not_allowed'),
});

const LineSpanSchema = z.object({
  span_id: z.string().min(1),
  source_id: z.string().min(1),
  role: z.enum([
    'wajarri',
    'english',
    'attribution',
    'descriptive_grammar',
  ]),
  line_start: z.number().int().positive(),
  line_end: z.number().int().positive(),
  exact_lines: z.array(z.string()).min(1),
});

const EvidenceUnitSchema = z.object({
  evidence_unit_id: z.string().min(1),
  source_id: z.string().min(1),
  span_ids: z.array(z.string().min(1)).min(1),
  wajarri_text: z.string().min(1),
  english_text: z.string().min(1),
  alignment_scope: z.enum([
    'direct_same_line',
    'adjacent_line_or_passage',
    'document_level',
    'inline_gloss',
  ]),
  direct_pair_status: z.enum([
    'source_explicit_pair',
    'source_explicit_passage_pair',
    'not_line_aligned',
    'source_inline_gloss',
  ]),
  speaker_or_author_status: z.string().min(1),
  source_family: z.string().min(1),
  segmentation_status: z.literal('not_inferred'),
  training_eligibility: z.literal('not_allowed'),
  synthetic_eligibility: z.literal('not_allowed_from_this_source'),
  claim_limit: z.string().min(1),
});

const JsonPrimitiveSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

const ExternalRecordSchema = z.object({
  evidence_record_id: z.string().min(1),
  artifact: ArtifactReferenceSchema,
  match_field: z.string().min(1),
  match_value: JsonPrimitiveSchema,
  expected_fields: z.record(z.string(), JsonPrimitiveSchema),
  evidence_role: z.string().min(1),
  training_interpretation: z.string().min(1),
});

const ConstructionCandidateSchema = z.object({
  candidate_id: z.string().min(1),
  label: z.string().min(1),
  candidate_kind: z.enum([
    'fixed_utterance_corroboration',
    'bounded_name_slot',
    'predicative_clause_frame',
    'identity_clause_frame',
    'document_translation_only',
    'inline_lexical_usage',
  ]),
  evidence_unit_ids: z.array(z.string().min(1)).min(1),
  external_evidence_record_ids: z.array(z.string().min(1)),
  support_span_ids: z.array(z.string().min(1)),
  candidate_status: z.enum([
    'accepted_source_scoped_fixed_pair',
    'source_supported_bounded_candidate',
    'source_scoped_evidence_only',
  ]),
  source_independence_status: z.enum([
    'not_assumed',
    'partly_related_or_unresolved',
  ]),
  proposed_english_pattern: z.string().min(1).nullable(),
  proposed_wajarri_pattern: z.string().min(1).nullable(),
  synthetic_template_status: z.enum([
    'not_a_productive_template',
    'blocked_pending_rights_and_productivity_review',
    'blocked_pending_morphosyntax_and_slot_compatibility',
    'blocked_document_level_alignment',
    'blocked_inline_gloss_only',
  ]),
  required_before_generation: z.array(z.string().min(1)).min(1),
  claim_limit: z.string().min(1),
});

export const PublicParallelWitnessReviewContractSchema = z.object({
  schema_version: z.literal(1),
  review_id: z.string().min(1),
  created_at_utc: z.string().datetime(),
  output_root: z.string().min(1),
  source_texts: z.array(SourceTextSchema).min(1),
  line_spans: z.array(LineSpanSchema).min(1),
  evidence_units: z.array(EvidenceUnitSchema).min(1),
  external_records: z.array(ExternalRecordSchema),
  construction_candidates: z.array(ConstructionCandidateSchema).min(1),
  expected_counts: z.object({
    source_texts: z.number().int().positive(),
    line_spans: z.number().int().positive(),
    evidence_units: z.number().int().positive(),
    external_records: z.number().int().nonnegative(),
    construction_candidates: z.number().int().positive(),
    accepted_source_scoped_fixed_pairs: z.number().int().nonnegative(),
    productive_synthetic_templates: z.literal(0),
    direct_training_rows: z.literal(0),
    controlled_synthetic_sentence_pairs: z.literal(0),
  }),
  review_policy: z.object({
    source_text: z.literal('exact_line_and_hash_verification'),
    document_alignment: z.literal('never_silently_split'),
    source_independence: z.literal('never_inferred_from_publication_count'),
    synthetic_generation: z.literal(
      'blocked_without_accepted_productive_grammar_slots_and_allowed_use',
    ),
    generated_output_is_evidence: z.literal(false),
  }),
});

export type PublicParallelWitnessReviewContract = z.infer<
  typeof PublicParallelWitnessReviewContractSchema
>;

interface LocatedSpan {
  schemaVersion: 1;
  spanId: string;
  sourceId: string;
  role: z.infer<typeof LineSpanSchema>['role'];
  lineStart: number;
  lineEnd: number;
  exactLines: string[];
  sourceSpanSha256: string;
}

interface LocatedExternalRecord {
  schemaVersion: 1;
  evidenceRecordId: string;
  artifact: z.infer<typeof ArtifactReferenceSchema>;
  sourceLine: number;
  sourceRowSha256: string;
  matchedRecord: Record<string, unknown>;
  evidenceRole: string;
  trainingInterpretation: string;
}

export interface PublicParallelWitnessReviewResult {
  locatedSpans: LocatedSpan[];
  evidenceUnits: Array<
    z.infer<typeof EvidenceUnitSchema> & {
      schemaVersion: 1;
      spanSha256s: string[];
    }
  >;
  externalCorroborations: LocatedExternalRecord[];
  constructionCandidates: Array<
    z.infer<typeof ConstructionCandidateSchema> & { schemaVersion: 1 }
  >;
  counts: z.infer<
    typeof PublicParallelWitnessReviewContractSchema
  >['expected_counts'];
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function assertUnique(values: string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw new Error(`duplicate ${label}: ${value}`);
    seen.add(value);
  }
}

function sourceLines(text: string): string[] {
  const normalized = text.replace(/\r\n?/gu, '\n');
  return normalized.endsWith('\n')
    ? normalized.slice(0, -1).split('\n')
    : normalized.split('\n');
}

function primitiveEqual(left: unknown, right: unknown): boolean {
  return left === right;
}

export function buildPublicParallelWitnessReview(input: {
  contractValue: unknown;
  sourceTextById: ReadonlyMap<string, string>;
  externalRowsByPath: ReadonlyMap<string, unknown[]>;
}): PublicParallelWitnessReviewResult {
  const contract = PublicParallelWitnessReviewContractSchema.parse(
    input.contractValue,
  );
  assertUnique(
    contract.source_texts.map((source) => source.source_id),
    'source-text ID',
  );
  assertUnique(
    contract.line_spans.map((span) => span.span_id),
    'line-span ID',
  );
  assertUnique(
    contract.evidence_units.map((unit) => unit.evidence_unit_id),
    'evidence-unit ID',
  );
  assertUnique(
    contract.external_records.map((record) => record.evidence_record_id),
    'external-evidence-record ID',
  );
  assertUnique(
    contract.construction_candidates.map((candidate) => candidate.candidate_id),
    'construction-candidate ID',
  );

  const linesBySource = new Map<string, string[]>();
  for (const source of contract.source_texts) {
    const text = input.sourceTextById.get(source.source_id);
    if (text === undefined)
      throw new Error(`missing source text: ${source.source_id}`);
    const lines = sourceLines(text);
    if (lines.length !== source.expected_lines)
      throw new Error(
        `line-count mismatch for ${source.source_id}: ${lines.length} != ${source.expected_lines}`,
      );
    linesBySource.set(source.source_id, lines);
  }

  const locatedSpans = contract.line_spans.map((span): LocatedSpan => {
    const lines = linesBySource.get(span.source_id);
    if (!lines) throw new Error(`unknown span source: ${span.source_id}`);
    if (span.line_end < span.line_start)
      throw new Error(`reversed line span: ${span.span_id}`);
    const observed = lines.slice(span.line_start - 1, span.line_end);
    if (
      observed.length !== span.exact_lines.length ||
      observed.some((line, index) => line !== span.exact_lines[index])
    )
      throw new Error(`exact-line mismatch for ${span.span_id}`);
    return {
      schemaVersion: 1,
      spanId: span.span_id,
      sourceId: span.source_id,
      role: span.role,
      lineStart: span.line_start,
      lineEnd: span.line_end,
      exactLines: span.exact_lines,
      sourceSpanSha256: sha256(`${span.exact_lines.join('\n')}\n`),
    };
  });
  const spanById = new Map(locatedSpans.map((span) => [span.spanId, span]));

  const evidenceUnits = contract.evidence_units.map((unit) => {
    const spans = unit.span_ids.map((spanId) => {
      const span = spanById.get(spanId);
      if (!span) throw new Error(`unknown unit span: ${spanId}`);
      if (span.sourceId !== unit.source_id)
        throw new Error(`cross-source span on unit ${unit.evidence_unit_id}`);
      return span;
    });
    const evidenceText = spans.flatMap((span) => span.exactLines).join('\n');
    if (!evidenceText.includes(unit.wajarri_text))
      throw new Error(
        `Wajarri text is not exact source content for ${unit.evidence_unit_id}`,
      );
    if (!evidenceText.includes(unit.english_text))
      throw new Error(
        `English text is not exact source content for ${unit.evidence_unit_id}`,
      );
    if (
      unit.alignment_scope === 'document_level' &&
      unit.direct_pair_status !== 'not_line_aligned'
    )
      throw new Error(
        `document-level unit is misclassified as aligned: ${unit.evidence_unit_id}`,
      );
    return {
      schemaVersion: 1 as const,
      ...unit,
      spanSha256s: spans.map((span) => span.sourceSpanSha256),
    };
  });

  const externalCorroborations = contract.external_records.map(
    (record): LocatedExternalRecord => {
      const rows = input.externalRowsByPath.get(record.artifact.path);
      if (!rows)
        throw new Error(`missing external rows: ${record.artifact.path}`);
      const matches = rows
        .map((row, index) => ({ row, sourceLine: index + 1 }))
        .filter(
          ({ row }) =>
            typeof row === 'object' &&
            row !== null &&
            primitiveEqual(
              (row as Record<string, unknown>)[record.match_field],
              record.match_value,
            ),
        );
      if (matches.length !== 1)
        throw new Error(
          `external record ${record.evidence_record_id} matched ${matches.length} rows`,
        );
      const matchedRecord = matches[0].row as Record<string, unknown>;
      for (const [field, expected] of Object.entries(record.expected_fields))
        if (!primitiveEqual(matchedRecord[field], expected))
          throw new Error(
            `external field mismatch for ${record.evidence_record_id}.${field}`,
          );
      const canonicalRow = `${JSON.stringify(
        Object.fromEntries(
          Object.entries(matchedRecord).sort(([left], [right]) =>
            left.localeCompare(right),
          ),
        ),
      )}\n`;
      return {
        schemaVersion: 1,
        evidenceRecordId: record.evidence_record_id,
        artifact: record.artifact,
        sourceLine: matches[0].sourceLine,
        sourceRowSha256: sha256(canonicalRow),
        matchedRecord,
        evidenceRole: record.evidence_role,
        trainingInterpretation: record.training_interpretation,
      };
    },
  );
  const externalIds = new Set(
    externalCorroborations.map((record) => record.evidenceRecordId),
  );
  const unitIds = new Set(evidenceUnits.map((unit) => unit.evidence_unit_id));

  const constructionCandidates = contract.construction_candidates.map(
    (candidate) => {
      for (const unitId of candidate.evidence_unit_ids)
        if (!unitIds.has(unitId))
          throw new Error(`unknown candidate evidence unit: ${unitId}`);
      for (const recordId of candidate.external_evidence_record_ids)
        if (!externalIds.has(recordId))
          throw new Error(`unknown candidate external record: ${recordId}`);
      for (const spanId of candidate.support_span_ids)
        if (!spanById.has(spanId))
          throw new Error(`unknown candidate support span: ${spanId}`);
      if (
        candidate.candidate_status === 'accepted_source_scoped_fixed_pair' &&
        candidate.synthetic_template_status !== 'not_a_productive_template'
      )
        throw new Error(
          `fixed pair cannot be promoted as a template: ${candidate.candidate_id}`,
        );
      return { schemaVersion: 1 as const, ...candidate };
    },
  );

  const counts = {
    source_texts: contract.source_texts.length,
    line_spans: locatedSpans.length,
    evidence_units: evidenceUnits.length,
    external_records: externalCorroborations.length,
    construction_candidates: constructionCandidates.length,
    accepted_source_scoped_fixed_pairs: constructionCandidates.filter(
      (candidate) =>
        candidate.candidate_status === 'accepted_source_scoped_fixed_pair',
    ).length,
    productive_synthetic_templates: 0 as const,
    direct_training_rows: 0 as const,
    controlled_synthetic_sentence_pairs: 0 as const,
  };
  for (const [field, expected] of Object.entries(contract.expected_counts)) {
    const observed = counts[field as keyof typeof counts];
    if (observed !== expected)
      throw new Error(`expected count mismatch for ${field}: ${observed} != ${expected}`);
  }

  return {
    locatedSpans,
    evidenceUnits,
    externalCorroborations,
    constructionCandidates,
    counts,
  };
}
