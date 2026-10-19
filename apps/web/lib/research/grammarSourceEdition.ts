import { createHash } from 'node:crypto';
import { z } from 'zod';

const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const KeySchema = z.string().regex(/^[a-z0-9][a-z0-9.-]*$/);

const SourceSpanSchema = z.object({
  line_start: z.number().int().positive(),
  line_end: z.number().int().positive(),
});

const ClaimSpecSchema = z.object({
  claim_key: KeySchema,
  topic: z.string().min(1),
  subtopic: z.string().min(1),
  statement: z.string().min(1),
  evidence_spans: z.array(SourceSpanSchema).min(1),
  evidence_class: z.literal('explicit_curriculum_statement'),
  scope_conditions: z.array(z.string()),
  limitations: z.array(z.string()).min(1),
});

const ExampleSpecSchema = z.object({
  example_key: KeySchema,
  claim_keys: z.array(KeySchema).min(1),
  target_text: z.string().min(1),
  english_text: z.string().min(1).nullable(),
  evidence_spans: z.array(SourceSpanSchema).min(1),
  unit: z.enum(['form_set', 'phrase', 'sentence', 'sentence_set']),
  translation_alignment: z.enum([
    'explicit_source_parenthetical',
    'explicit_source_list_mapping',
    'wajarri_only_illustration',
  ]),
  limitations: z.array(z.string()).min(1),
});

const ParadigmSpecSchema = z.object({
  paradigm_key: KeySchema,
  claim_keys: z.array(KeySchema).min(1),
  label: z.string().min(1),
  evidence_spans: z.array(SourceSpanSchema).min(1),
  cells: z
    .array(
      z.object({
        slot: z.string().min(1),
        surface: z.string().min(1),
        meaning: z.string().min(1).nullable(),
        condition: z.string().min(1).nullable(),
      }),
    )
    .min(1),
  limitations: z.array(z.string()).min(1),
});

const ReviewSpecSchema = z.object({
  review_key: KeySchema,
  review_kind: z.string().min(1),
  question: z.string().min(1),
  linked_claim_keys: z.array(KeySchema),
  linked_example_keys: z.array(KeySchema),
  evidence_required: z.array(z.string()).min(1),
  priority: z.enum(['critical', 'high', 'medium', 'low']),
});

export const GrammarSourceEditionContractSchema = z.object({
  schema_version: z.literal(1),
  edition_id: KeySchema,
  parent_edition_id: KeySchema,
  created_at_utc: z.string().datetime(),
  status: z.literal('source_verified_candidates'),
  scope: z.object({
    language: z.string().min(1),
    iso_639_3: z.string().length(3),
    glottocode: z.string().min(1),
    variety: z.string().min(1),
    orthography: z.string().min(1),
  }),
  source: z.object({
    source_id: z.string().min(1),
    path: z.string().min(1),
    sha256: Sha256Schema,
    declared_page_count: z.number().int().positive(),
    page_footer_pattern: z.string().min(1),
    expected_observed_footer_pages: z.array(z.number().int().positive()).min(1),
    trailing_page_range: z.tuple([
      z.number().int().positive(),
      z.number().int().positive(),
    ]),
    source_rendering: z.string().min(1),
    training_use: z.literal('not_allowed'),
  }),
  parent_manifest: z.object({
    path: z.string().min(1),
    sha256: Sha256Schema,
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
  release_status: z.literal('not_released'),
  claims: z.array(ClaimSpecSchema),
  examples: z.array(ExampleSpecSchema),
  paradigms: z.array(ParadigmSpecSchema),
  review_items: z.array(ReviewSpecSchema),
});

export type GrammarSourceEditionContract = z.infer<
  typeof GrammarSourceEditionContractSchema
>;

export interface SourcePageIndexRow {
  pageIndexId: string;
  sourceId: string;
  pageNumbers: number[];
  pagePrecision: 'exact' | 'unresolved_page_range';
  sourceLineStart: number;
  sourceLineEnd: number;
  footerLine: number | null;
  sourceSpanSha256: string;
}

interface ResolvedSpan {
  sourceLineStart: number;
  sourceLineEnd: number;
  pageNumbers: number[];
  pagePrecision: SourcePageIndexRow['pagePrecision'];
  sourceSpanSha256: string;
}

export interface GrammarSourceEditionLedgers {
  pages: SourcePageIndexRow[];
  claims: Array<Record<string, unknown>>;
  examples: Array<Record<string, unknown>>;
  paradigms: Array<Record<string, unknown>>;
  reviewQueue: Array<Record<string, unknown>>;
  sourceLineCount: number;
}

function sha256Text(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function uniqueKeys(values: string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw new Error(`duplicate ${label}: ${value}`);
    seen.add(value);
  }
}

function sourceLines(sourceText: string): string[] {
  const normalized = sourceText.replace(/\r\n?/gu, '\n');
  const lines = normalized.split('\n');
  if (lines.at(-1) === '') lines.pop();
  return lines;
}

function spanText(lines: string[], start: number, end: number): string {
  if (start > end) throw new Error(`invalid source span ${start}-${end}`);
  if (start < 1 || end > lines.length)
    throw new Error(`source span ${start}-${end} is outside 1-${lines.length}`);
  return lines.slice(start - 1, end).join('\n');
}

function normalizedContainmentText(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ').trim();
}

export function buildSourcePageIndex(
  sourceText: string,
  contract: GrammarSourceEditionContract,
): SourcePageIndexRow[] {
  const lines = sourceLines(sourceText);
  const footerPattern = new RegExp(contract.source.page_footer_pattern, 'u');
  const markers: Array<{ page: number; line: number }> = [];

  lines.forEach((line, index) => {
    const match = footerPattern.exec(line);
    if (!match) return;
    const page = Number.parseInt(match[1] ?? '', 10);
    if (!Number.isInteger(page))
      throw new Error(
        `page footer did not capture a page number at line ${index + 1}`,
      );
    markers.push({ page, line: index + 1 });
  });

  const observedPages = markers.map((marker) => marker.page);
  if (
    JSON.stringify(observedPages) !==
    JSON.stringify(contract.source.expected_observed_footer_pages)
  ) {
    throw new Error(
      `observed footer pages ${JSON.stringify(observedPages)} do not match contract`,
    );
  }

  const pages: SourcePageIndexRow[] = [];
  let start = 1;
  for (const marker of markers) {
    const text = spanText(lines, start, marker.line);
    pages.push({
      pageIndexId: `${contract.source.source_id}:page:${marker.page}`,
      sourceId: contract.source.source_id,
      pageNumbers: [marker.page],
      pagePrecision: 'exact',
      sourceLineStart: start,
      sourceLineEnd: marker.line,
      footerLine: marker.line,
      sourceSpanSha256: sha256Text(text),
    });
    start = marker.line + 1;
  }

  if (start <= lines.length) {
    const [firstPage, lastPage] = contract.source.trailing_page_range;
    if (
      firstPage > lastPage ||
      lastPage !== contract.source.declared_page_count
    )
      throw new Error('invalid trailing page range');
    pages.push({
      pageIndexId: `${contract.source.source_id}:pages:${firstPage}-${lastPage}`,
      sourceId: contract.source.source_id,
      pageNumbers: Array.from(
        { length: lastPage - firstPage + 1 },
        (_, index) => firstPage + index,
      ),
      pagePrecision: 'unresolved_page_range',
      sourceLineStart: start,
      sourceLineEnd: lines.length,
      footerLine: null,
      sourceSpanSha256: sha256Text(spanText(lines, start, lines.length)),
    });
  }

  const representedPages = new Set(pages.flatMap((page) => page.pageNumbers));
  if (representedPages.size !== contract.source.declared_page_count)
    throw new Error(
      `page index represents ${representedPages.size} pages, expected ${contract.source.declared_page_count}`,
    );
  return pages;
}

function resolveEvidenceSpans(
  lines: string[],
  pages: SourcePageIndexRow[],
  spans: Array<{ line_start: number; line_end: number }>,
): ResolvedSpan[] {
  return spans.map((span) => {
    const page = pages.find(
      (candidate) =>
        span.line_start >= candidate.sourceLineStart &&
        span.line_end <= candidate.sourceLineEnd,
    );
    if (!page)
      throw new Error(
        `evidence span ${span.line_start}-${span.line_end} crosses or falls outside page boundaries`,
      );
    const text = spanText(lines, span.line_start, span.line_end);
    return {
      sourceLineStart: span.line_start,
      sourceLineEnd: span.line_end,
      pageNumbers: page.pageNumbers,
      pagePrecision: page.pagePrecision,
      sourceSpanSha256: sha256Text(text),
    };
  });
}

function combinedEvidenceText(
  lines: string[],
  spans: Array<{ line_start: number; line_end: number }>,
): string {
  return spans
    .map((span) => spanText(lines, span.line_start, span.line_end))
    .join('\n');
}

export function buildGrammarSourceEdition(
  sourceText: string,
  contractValue: unknown,
): GrammarSourceEditionLedgers {
  const contract = GrammarSourceEditionContractSchema.parse(contractValue);
  const sourceSha256 = sha256Text(sourceText);
  if (sourceSha256 !== contract.source.sha256)
    throw new Error(
      `source hash mismatch: ${sourceSha256} != ${contract.source.sha256}`,
    );

  uniqueKeys(
    contract.claims.map((claim) => claim.claim_key),
    'claim_key',
  );
  uniqueKeys(
    contract.examples.map((example) => example.example_key),
    'example_key',
  );
  uniqueKeys(
    contract.paradigms.map((paradigm) => paradigm.paradigm_key),
    'paradigm_key',
  );
  uniqueKeys(
    contract.review_items.map((item) => item.review_key),
    'review_key',
  );

  const lines = sourceLines(sourceText);
  const pages = buildSourcePageIndex(sourceText, contract);
  const claimKeys = new Set(contract.claims.map((claim) => claim.claim_key));
  const exampleKeys = new Set(
    contract.examples.map((example) => example.example_key),
  );

  const assertClaimKeys = (keys: string[], label: string) => {
    for (const key of keys)
      if (!claimKeys.has(key))
        throw new Error(`${label} references unknown claim ${key}`);
  };

  const claims = contract.claims.map((claim) => ({
    schemaVersion: 1,
    claimId: `${contract.edition_id}:claim:${claim.claim_key}`,
    claimKey: claim.claim_key,
    topic: claim.topic,
    subtopic: claim.subtopic,
    statement: claim.statement,
    sourceId: contract.source.source_id,
    sourceSha256: contract.source.sha256,
    evidenceSpans: resolveEvidenceSpans(lines, pages, claim.evidence_spans),
    evidenceClass: claim.evidence_class,
    sourceRendering: contract.source.source_rendering,
    scopeConditions: claim.scope_conditions,
    limitations: claim.limitations,
    evidenceStatus: 'source_span_verified',
    reviewStatus: 'candidate_requires_independent_confirmation',
    acceptanceStatus: 'not_accepted',
    trainingEligibility: contract.source.training_use,
  }));

  const examples = contract.examples.map((example) => {
    assertClaimKeys(example.claim_keys, `example ${example.example_key}`);
    const evidenceText = normalizedContainmentText(
      combinedEvidenceText(lines, example.evidence_spans),
    );
    for (const [label, value] of [
      ['target_text', example.target_text],
      ['english_text', example.english_text],
    ] as const) {
      if (value && !evidenceText.includes(normalizedContainmentText(value)))
        throw new Error(
          `example ${example.example_key} ${label} is absent from its evidence span`,
        );
    }
    return {
      schemaVersion: 1,
      exampleId: `${contract.edition_id}:example:${example.example_key}`,
      exampleKey: example.example_key,
      claimKeys: example.claim_keys,
      targetText: example.target_text,
      englishText: example.english_text,
      unit: example.unit,
      translationAlignment: example.translation_alignment,
      sourceId: contract.source.source_id,
      sourceSha256: contract.source.sha256,
      evidenceSpans: resolveEvidenceSpans(lines, pages, example.evidence_spans),
      transcriptionStatus: 'verified_against_source_rendering',
      segmentationStatus: 'not_segmented',
      morphemeGlossStatus: 'not_glossed',
      naturalnessEvidence: 'curriculum_model_not_natural_corpus',
      limitations: example.limitations,
      acceptanceStatus: 'not_accepted',
      trainingEligibility: contract.source.training_use,
    };
  });

  const paradigms = contract.paradigms.map((paradigm) => {
    assertClaimKeys(paradigm.claim_keys, `paradigm ${paradigm.paradigm_key}`);
    const evidenceText = normalizedContainmentText(
      combinedEvidenceText(lines, paradigm.evidence_spans),
    );
    for (const cell of paradigm.cells) {
      if (!evidenceText.includes(normalizedContainmentText(cell.surface)))
        throw new Error(
          `paradigm ${paradigm.paradigm_key} surface ${cell.surface} is absent from its evidence span`,
        );
    }
    return {
      schemaVersion: 1,
      paradigmId: `${contract.edition_id}:paradigm:${paradigm.paradigm_key}`,
      paradigmKey: paradigm.paradigm_key,
      claimKeys: paradigm.claim_keys,
      label: paradigm.label,
      cells: paradigm.cells,
      sourceId: contract.source.source_id,
      sourceSha256: contract.source.sha256,
      evidenceSpans: resolveEvidenceSpans(
        lines,
        pages,
        paradigm.evidence_spans,
      ),
      analysisStatus: 'source_structured_candidate',
      limitations: paradigm.limitations,
      acceptanceStatus: 'not_accepted',
      trainingEligibility: contract.source.training_use,
    };
  });

  const reviewQueue = contract.review_items.map((item) => {
    assertClaimKeys(item.linked_claim_keys, `review item ${item.review_key}`);
    for (const key of item.linked_example_keys)
      if (!exampleKeys.has(key))
        throw new Error(
          `review item ${item.review_key} references unknown example ${key}`,
        );
    return {
      schemaVersion: 1,
      reviewItemId: `${contract.edition_id}:review:${item.review_key}`,
      reviewKey: item.review_key,
      reviewKind: item.review_kind,
      question: item.question,
      linkedClaimKeys: item.linked_claim_keys,
      linkedExampleKeys: item.linked_example_keys,
      evidenceRequired: item.evidence_required,
      priority: item.priority,
      status: 'pending',
    };
  });

  return {
    pages,
    claims,
    examples,
    paradigms,
    reviewQueue,
    sourceLineCount: lines.length,
  };
}
