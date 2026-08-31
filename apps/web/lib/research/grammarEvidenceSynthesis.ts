import { createHash } from 'node:crypto';
import { z } from 'zod';

const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const KeySchema = z.string().regex(/^[a-z0-9][a-z0-9.-]*$/);

const SourceBaseSchema = z.object({
  source_id: z.string().min(1),
  path: z.string().min(1),
  sha256: Sha256Schema,
  authority_tier: z.enum([
    'current_descriptive_summary',
    'historical_descriptive_grammar',
  ]),
  training_use: z.literal('not_allowed'),
});

const FormFeedSourceSchema = SourceBaseSchema.extend({
  source_kind: z.literal('form_feed_text'),
  page_index: z.object({
    manifest_path: z.string().min(1),
    manifest_sha256: Sha256Schema,
    pages_path: z.string().min(1),
    pages_sha256: Sha256Schema,
  }),
});

const JsonSourceSchema = SourceBaseSchema.extend({
  source_kind: z.literal('json_document'),
});

const EvidenceSourceSchema = z.discriminatedUnion('source_kind', [
  FormFeedSourceSchema,
  JsonSourceSchema,
]);

const PageLinesPositionSchema = z.object({
  kind: z.literal('page_lines'),
  chapter_page_ordinal: z.number().int().positive(),
  line_start: z.number().int().positive(),
  line_end: z.number().int().positive(),
});

const JsonPointerPositionSchema = z.object({
  kind: z.literal('json_pointer'),
  pointer: z.string().startsWith('/'),
});

const AssertionSchema = z.object({
  assertion_key: KeySchema,
  source_id: z.string().min(1),
  topic: z.string().min(1),
  subtopic: z.string().min(1),
  proposition: z.string().min(1),
  evidence_positions: z
    .array(
      z.discriminatedUnion('kind', [
        PageLinesPositionSchema,
        JsonPointerPositionSchema,
      ]),
    )
    .min(1),
  source_analysis_type: z.enum([
    'author_descriptive_analysis',
    'author_summary',
    'reported_speaker_or_dialect_observation',
  ]),
  temporal_scope: z.string().min(1),
  variety_scope: z.string().min(1),
  orthography_scope: z.string().min(1),
  limitations: z.array(z.string().min(1)).min(1),
});

const SynthesisSchema = z.object({
  synthesis_key: KeySchema,
  topic: z.string().min(1),
  conclusion: z.string().min(1),
  assertion_keys: z.array(KeySchema),
  inherited_claim_keys: z.array(KeySchema),
  relation: z.enum([
    'corroborated',
    'compatible_scope_difference',
    'direct_conflict',
    'analysis_change_candidate',
    'orthography_crosswalk_required',
  ]),
  evidence_grade: z.enum([
    'multi_source_convergent',
    'single_current_summary',
    'historical_source_only',
    'unresolved_conflict',
  ]),
  acceptance_status: z.enum([
    'accepted_for_analysis',
    'candidate',
    'unresolved_conflict',
  ]),
  implications: z.array(z.string().min(1)).min(1),
  limitations: z.array(z.string().min(1)).min(1),
});

const ReviewItemSchema = z.object({
  review_key: KeySchema,
  question: z.string().min(1),
  synthesis_keys: z.array(KeySchema).min(1),
  evidence_required: z.array(z.string().min(1)).min(1),
  priority: z.enum(['critical', 'high', 'medium', 'low']),
});

export const GrammarEvidenceSynthesisContractSchema = z.object({
  schema_version: z.literal(1),
  edition_id: KeySchema,
  parent_edition_id: KeySchema,
  created_at_utc: z.string().datetime(),
  status: z.literal('cross_source_reconciliation'),
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
  source_ledger: z.object({
    path: z.string().min(1),
    sha256: Sha256Schema,
  }),
  change_ledger: z.object({
    path: z.string().min(1),
    sha256: Sha256Schema,
    accepted_change_ids: z.array(KeySchema),
  }),
  current_pointer_path: z.string().min(1),
  supersedes_pointer_sha256: Sha256Schema,
  sources: z.array(EvidenceSourceSchema).min(1),
  assertions: z.array(AssertionSchema).min(1),
  syntheses: z.array(SynthesisSchema).min(1),
  review_items: z.array(ReviewItemSchema),
  release_status: z.literal('not_released'),
});

export type GrammarEvidenceSynthesisContract = z.infer<
  typeof GrammarEvidenceSynthesisContractSchema
>;

interface PageIndexRow {
  pageIndexId: string;
  sourceId: string;
  sourceSha256: string;
  chapterPageOrdinal: number;
  sourcePdfPage: number;
  printedPage: number;
  pageSha256: string;
  pageLineCount: number;
}

export interface LoadedEvidenceSource {
  sourceBytes: Buffer;
  pageIndexRows?: PageIndexRow[];
}

export interface GrammarEvidenceSynthesisResult {
  assertions: Array<Record<string, unknown>>;
  syntheses: Array<Record<string, unknown>>;
  conflicts: Array<Record<string, unknown>>;
  reviewQueue: Array<Record<string, unknown>>;
  acceptedForAnalysisCount: number;
}

function sha256(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex');
}

function uniqueKeys(values: string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw new Error(`duplicate ${label}: ${value}`);
    seen.add(value);
  }
}

function splitFormFeedPages(sourceBytes: Buffer): Buffer[] {
  const pages: Buffer[] = [];
  let start = 0;
  for (let offset = 0; offset < sourceBytes.length; offset += 1) {
    if (sourceBytes[offset] !== 0x0c) continue;
    pages.push(sourceBytes.subarray(start, offset));
    start = offset + 1;
  }
  if (start !== sourceBytes.length)
    throw new Error('form-feed source does not end at a page delimiter');
  return pages;
}

function pageLines(pageBytes: Buffer): string[] {
  const lines = pageBytes.toString('utf8').replace(/\r\n?/gu, '\n').split('\n');
  if (lines.at(-1) === '') lines.pop();
  return lines;
}

function decodeJsonPointerSegment(segment: string): string {
  return segment.replace(/~1/gu, '/').replace(/~0/gu, '~');
}

function resolveJsonPointer(document: unknown, pointer: string): unknown {
  if (pointer === '') return document;
  let value = document;
  for (const rawSegment of pointer.slice(1).split('/')) {
    const segment = decodeJsonPointerSegment(rawSegment);
    if (Array.isArray(value)) {
      if (!/^\d+$/u.test(segment))
        throw new Error(
          `JSON pointer array segment is not numeric: ${segment}`,
        );
      value = value[Number.parseInt(segment, 10)];
      continue;
    }
    if (value === null || typeof value !== 'object' || !(segment in value))
      throw new Error(`JSON pointer does not resolve: ${pointer}`);
    value = (value as Record<string, unknown>)[segment];
  }
  return value;
}

function resolvePageEvidence(
  sourceId: string,
  source: LoadedEvidenceSource,
  position: z.infer<typeof PageLinesPositionSchema>,
): Record<string, unknown> {
  if (!source.pageIndexRows)
    throw new Error(`source ${sourceId} has no page index`);
  const pageRow = source.pageIndexRows.find(
    (row) => row.chapterPageOrdinal === position.chapter_page_ordinal,
  );
  if (!pageRow)
    throw new Error(
      `source ${sourceId} has no chapter page ${position.chapter_page_ordinal}`,
    );
  const pages = splitFormFeedPages(source.sourceBytes);
  const pageBytes = pages[position.chapter_page_ordinal - 1];
  if (!pageBytes) throw new Error('indexed page bytes are absent');
  if (sha256(pageBytes) !== pageRow.pageSha256)
    throw new Error(`page hash mismatch for ${pageRow.pageIndexId}`);
  const lines = pageLines(pageBytes);
  if (
    position.line_start > position.line_end ||
    position.line_start < 1 ||
    position.line_end > lines.length
  )
    throw new Error(
      `source ${sourceId} page ${position.chapter_page_ordinal} span ${position.line_start}-${position.line_end} is outside 1-${lines.length}`,
    );
  const spanText = lines
    .slice(position.line_start - 1, position.line_end)
    .join('\n');
  return {
    kind: position.kind,
    chapterPageOrdinal: position.chapter_page_ordinal,
    sourcePdfPage: pageRow.sourcePdfPage,
    printedPage: pageRow.printedPage,
    pageSha256: pageRow.pageSha256,
    pageLineStart: position.line_start,
    pageLineEnd: position.line_end,
    sourceSpanSha256: sha256(spanText),
  };
}

function resolveJsonEvidence(
  sourceId: string,
  source: LoadedEvidenceSource,
  position: z.infer<typeof JsonPointerPositionSchema>,
): Record<string, unknown> {
  const document = JSON.parse(source.sourceBytes.toString('utf8')) as unknown;
  const value = resolveJsonPointer(document, position.pointer);
  if (typeof value !== 'string' || value.length === 0)
    throw new Error(
      `source ${sourceId} JSON pointer must resolve to a nonempty string: ${position.pointer}`,
    );
  return {
    kind: position.kind,
    jsonPointer: position.pointer,
    sourceValueSha256: sha256(value),
  };
}

export function buildGrammarEvidenceSynthesis(
  contractValue: unknown,
  loadedSources: Map<string, LoadedEvidenceSource>,
  inheritedClaimKeys: Set<string>,
): GrammarEvidenceSynthesisResult {
  const contract = GrammarEvidenceSynthesisContractSchema.parse(contractValue);
  uniqueKeys(
    contract.sources.map((source) => source.source_id),
    'source_id',
  );
  uniqueKeys(
    contract.assertions.map((assertion) => assertion.assertion_key),
    'assertion_key',
  );
  uniqueKeys(
    contract.syntheses.map((synthesis) => synthesis.synthesis_key),
    'synthesis_key',
  );
  uniqueKeys(
    contract.review_items.map((item) => item.review_key),
    'review_key',
  );

  const sourceSpecs = new Map(
    contract.sources.map((source) => [source.source_id, source]),
  );
  for (const sourceSpec of contract.sources) {
    const loaded = loadedSources.get(sourceSpec.source_id);
    if (!loaded)
      throw new Error(`source bytes are absent: ${sourceSpec.source_id}`);
    const actualHash = sha256(loaded.sourceBytes);
    if (actualHash !== sourceSpec.sha256)
      throw new Error(
        `source hash mismatch for ${sourceSpec.source_id}: ${actualHash} != ${sourceSpec.sha256}`,
      );
    if (sourceSpec.source_kind === 'form_feed_text') {
      if (!loaded.pageIndexRows)
        throw new Error(`page index is absent: ${sourceSpec.source_id}`);
      if (loaded.pageIndexRows.length === 0)
        throw new Error(`page index is empty: ${sourceSpec.source_id}`);
      for (const row of loaded.pageIndexRows) {
        if (
          row.sourceId !== sourceSpec.source_id ||
          row.sourceSha256 !== sourceSpec.sha256
        )
          throw new Error(`page index identity mismatch: ${row.pageIndexId}`);
      }
    }
  }

  const assertions = contract.assertions.map((assertion) => {
    const sourceSpec = sourceSpecs.get(assertion.source_id);
    const loaded = loadedSources.get(assertion.source_id);
    if (!sourceSpec || !loaded)
      throw new Error(
        `assertion ${assertion.assertion_key} references unknown source ${assertion.source_id}`,
      );
    const evidenceAnchors = assertion.evidence_positions.map((position) => {
      if (position.kind === 'page_lines') {
        if (sourceSpec.source_kind !== 'form_feed_text')
          throw new Error(
            `assertion ${assertion.assertion_key} uses page lines on a non-page source`,
          );
        return resolvePageEvidence(assertion.source_id, loaded, position);
      }
      if (sourceSpec.source_kind !== 'json_document')
        throw new Error(
          `assertion ${assertion.assertion_key} uses a JSON pointer on a non-JSON source`,
        );
      return resolveJsonEvidence(assertion.source_id, loaded, position);
    });
    return {
      schemaVersion: 1,
      assertionId: `${contract.edition_id}:assertion:${assertion.assertion_key}`,
      assertionKey: assertion.assertion_key,
      sourceId: assertion.source_id,
      sourceSha256: sourceSpec.sha256,
      sourceAuthorityTier: sourceSpec.authority_tier,
      topic: assertion.topic,
      subtopic: assertion.subtopic,
      proposition: assertion.proposition,
      evidenceAnchors,
      sourceAnalysisType: assertion.source_analysis_type,
      temporalScope: assertion.temporal_scope,
      varietyScope: assertion.variety_scope,
      orthographyScope: assertion.orthography_scope,
      limitations: assertion.limitations,
      assertionStatus: 'source_anchored',
      linguisticAcceptanceStatus: 'not_independently_accepted',
      trainingEligibility: sourceSpec.training_use,
    };
  });
  const assertionByKey = new Map(
    assertions.map((assertion) => [assertion.assertionKey, assertion]),
  );

  const syntheses = contract.syntheses.map((synthesis) => {
    if (
      synthesis.assertion_keys.length + synthesis.inherited_claim_keys.length <
      1
    )
      throw new Error(`synthesis ${synthesis.synthesis_key} has no evidence`);
    for (const key of synthesis.assertion_keys)
      if (!assertionByKey.has(key))
        throw new Error(
          `synthesis ${synthesis.synthesis_key} references unknown assertion ${key}`,
        );
    for (const key of synthesis.inherited_claim_keys)
      if (!inheritedClaimKeys.has(key))
        throw new Error(
          `synthesis ${synthesis.synthesis_key} references unknown inherited claim ${key}`,
        );

    const distinctSources = new Set(
      synthesis.assertion_keys.map((key) => assertionByKey.get(key)?.sourceId),
    );
    const evidenceFamilies =
      distinctSources.size +
      (synthesis.inherited_claim_keys.length > 0 ? 1 : 0);
    if (
      synthesis.relation === 'direct_conflict' &&
      synthesis.acceptance_status !== 'unresolved_conflict'
    )
      throw new Error(
        `direct conflict ${synthesis.synthesis_key} must remain unresolved`,
      );
    if (synthesis.acceptance_status === 'accepted_for_analysis') {
      if (
        synthesis.relation !== 'corroborated' ||
        synthesis.evidence_grade !== 'multi_source_convergent' ||
        evidenceFamilies < 2
      )
        throw new Error(
          `accepted synthesis ${synthesis.synthesis_key} lacks multi-source corroboration`,
        );
    }
    return {
      schemaVersion: 1,
      synthesisId: `${contract.edition_id}:synthesis:${synthesis.synthesis_key}`,
      synthesisKey: synthesis.synthesis_key,
      topic: synthesis.topic,
      conclusion: synthesis.conclusion,
      assertionKeys: synthesis.assertion_keys,
      inheritedClaimKeys: synthesis.inherited_claim_keys,
      relation: synthesis.relation,
      evidenceGrade: synthesis.evidence_grade,
      acceptanceStatus: synthesis.acceptance_status,
      implications: synthesis.implications,
      limitations: synthesis.limitations,
      trainingEligibility: 'not_allowed',
    };
  });
  const synthesisKeys = new Set(
    syntheses.map((synthesis) => synthesis.synthesisKey),
  );
  const reviewQueue = contract.review_items.map((item) => {
    for (const key of item.synthesis_keys)
      if (!synthesisKeys.has(key))
        throw new Error(
          `review item ${item.review_key} references unknown synthesis ${key}`,
        );
    return {
      schemaVersion: 1,
      reviewItemId: `${contract.edition_id}:review:${item.review_key}`,
      reviewKey: item.review_key,
      question: item.question,
      synthesisKeys: item.synthesis_keys,
      evidenceRequired: item.evidence_required,
      priority: item.priority,
      status: 'pending',
    };
  });

  return {
    assertions,
    syntheses,
    conflicts: syntheses.filter(
      (synthesis) => synthesis.acceptanceStatus === 'unresolved_conflict',
    ),
    reviewQueue,
    acceptedForAnalysisCount: syntheses.filter(
      (synthesis) => synthesis.acceptanceStatus === 'accepted_for_analysis',
    ).length,
  };
}
