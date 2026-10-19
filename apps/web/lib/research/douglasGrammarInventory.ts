import { createHash } from 'node:crypto';
import { z } from 'zod';

const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const KeySchema = z.string().regex(/^[a-z0-9][a-z0-9.-]*$/);

const PageSpanSchema = z
  .object({
    chapter_page_ordinal: z.number().int().positive(),
    line_start: z.number().int().positive(),
    line_end: z.number().int().positive(),
  })
  .refine((span) => span.line_start <= span.line_end, {
    message: 'page span line_start must not exceed line_end',
  });

const TableBlockSchema = z.object({
  block_key: KeySchema,
  label: z.string().min(1),
  table_kind: z.enum([
    'noun_case_paradigm',
    'free_pronoun_paradigm',
    'regular_verb_paradigm',
    'irregular_verb_paradigm',
    'bound_pronoun_paradigm',
    'interrogative_paradigm',
  ]),
  evidence_span: PageSpanSchema,
  intended_analysis: z.string().min(1),
  limitations: z.array(z.string().min(1)).min(1),
});

const MorphotacticStatementSchema = z.object({
  statement_key: KeySchema,
  topic: z.string().min(1),
  proposition: z.string().min(1),
  evidence_spans: z.array(PageSpanSchema).min(1),
  source_analysis_type: z.literal('author_descriptive_analysis'),
  limitations: z.array(z.string().min(1)).min(1),
});

const CuratedExampleSchema = z.object({
  example_number: z.number().int().positive(),
  phenomenon_tags: z.array(KeySchema).min(1),
  selection_rationale: z.string().min(1),
  limitations: z.array(z.string().min(1)).min(1),
});

export const DouglasGrammarInventoryContractSchema = z.object({
  schema_version: z.literal(1),
  inventory_id: KeySchema,
  created_at_utc: z.string().datetime(),
  status: z.literal('source_preserving_ocr_inventory'),
  scope: z.object({
    language: z.string().min(1),
    iso_639_3: z.string().length(3),
    variety: z.string().min(1),
    orthography: z.string().min(1),
  }),
  source: z.object({
    source_id: z.string().min(1),
    path: z.string().min(1),
    sha256: Sha256Schema,
    source_rendering: z.string().min(1),
    training_use: z.literal('not_allowed'),
    page_index: z.object({
      manifest_path: z.string().min(1),
      manifest_sha256: Sha256Schema,
      pages_path: z.string().min(1),
      pages_sha256: Sha256Schema,
    }),
  }),
  source_ledger: z.object({
    path: z.string().min(1),
    sha256: Sha256Schema,
  }),
  numbered_examples: z
    .object({
      expected_first_number: z.number().int().positive(),
      expected_last_number: z.number().int().positive(),
      expected_occurrence_count: z.number().int().positive(),
      expected_duplicate_numbers: z.array(z.number().int().positive()),
      block_boundary_policy: z.literal(
        'next_numbered_example_or_source_page_end',
      ),
    })
    .refine((spec) => spec.expected_first_number <= spec.expected_last_number, {
      message: 'expected example number range is reversed',
    }),
  table_blocks: z.array(TableBlockSchema).min(1),
  morphotactic_statements: z.array(MorphotacticStatementSchema).min(1),
  curated_examples: z.array(CuratedExampleSchema),
  output_directory: z.string().min(1),
  release_status: z.literal('not_released'),
});

export type DouglasGrammarInventoryContract = z.infer<
  typeof DouglasGrammarInventoryContractSchema
>;

export interface DouglasPageIndexRow {
  pageIndexId: string;
  sourceId: string;
  sourceSha256: string;
  chapterPageOrdinal: number;
  sourcePdfPage: number;
  printedPage: number;
  pageSha256: string;
  pageLineCount: number;
}

interface VerifiedPage {
  row: DouglasPageIndexRow;
  bytes: Buffer;
  lines: string[];
}

interface ResolvedPageSpan {
  chapterPageOrdinal: number;
  sourcePdfPage: number;
  printedPage: number;
  pageSha256: string;
  lineStart: number;
  lineEnd: number;
  sourceSpanSha256: string;
  sourceText: string;
}

interface OcrDiagnostics {
  digitOneCount: number;
  interiorWhitespaceSequenceCount: number;
  replacementCharacterCount: number;
  tildeCount: number;
}

export interface DouglasGrammarInventoryResult {
  tableBlocks: Array<Record<string, unknown>>;
  morphotacticStatements: Array<Record<string, unknown>>;
  numberedExamples: Array<Record<string, unknown>>;
  curatedExamples: Array<Record<string, unknown>>;
  numberedExampleOccurrenceCount: number;
  duplicateExampleNumbers: number[];
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

function sourceLines(pageBytes: Buffer): string[] {
  const lines = pageBytes.toString('utf8').replace(/\r\n?/gu, '\n').split('\n');
  if (lines.at(-1) === '') lines.pop();
  return lines;
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

function verifyPages(
  sourceBytes: Buffer,
  pageIndexRows: DouglasPageIndexRow[],
  sourceId: string,
  sourceSha256: string,
): VerifiedPage[] {
  const pageBytes = splitFormFeedPages(sourceBytes);
  if (pageBytes.length !== pageIndexRows.length)
    throw new Error(
      `source has ${pageBytes.length} pages but index has ${pageIndexRows.length}`,
    );

  return pageBytes.map((bytes, index) => {
    const row = pageIndexRows[index];
    if (!row) throw new Error(`page index row ${index + 1} is absent`);
    if (
      row.chapterPageOrdinal !== index + 1 ||
      row.sourceId !== sourceId ||
      row.sourceSha256 !== sourceSha256
    )
      throw new Error(`page index identity mismatch: ${row.pageIndexId}`);
    if (sha256(bytes) !== row.pageSha256)
      throw new Error(`page hash mismatch: ${row.pageIndexId}`);
    const lines = sourceLines(bytes);
    if (lines.length !== row.pageLineCount)
      throw new Error(`page line count mismatch: ${row.pageIndexId}`);
    return { row, bytes, lines };
  });
}

function resolveSpan(
  pages: VerifiedPage[],
  span: z.infer<typeof PageSpanSchema>,
): ResolvedPageSpan {
  const page = pages[span.chapter_page_ordinal - 1];
  if (!page)
    throw new Error(`source page ${span.chapter_page_ordinal} is absent`);
  if (span.line_end > page.lines.length)
    throw new Error(
      `page ${span.chapter_page_ordinal} span ${span.line_start}-${span.line_end} is outside 1-${page.lines.length}`,
    );
  const sourceText = page.lines
    .slice(span.line_start - 1, span.line_end)
    .join('\n');
  return {
    chapterPageOrdinal: span.chapter_page_ordinal,
    sourcePdfPage: page.row.sourcePdfPage,
    printedPage: page.row.printedPage,
    pageSha256: page.row.pageSha256,
    lineStart: span.line_start,
    lineEnd: span.line_end,
    sourceSpanSha256: sha256(sourceText),
    sourceText,
  };
}

function countMatches(value: string, pattern: RegExp): number {
  return Array.from(value.matchAll(pattern)).length;
}

function ocrDiagnostics(value: string): OcrDiagnostics {
  return {
    digitOneCount: countMatches(value, /1/gu),
    interiorWhitespaceSequenceCount: countMatches(
      value,
      /\b(?:[A-Za-z0-9]\s+){2,}[A-Za-z0-9]\b/gu,
    ),
    replacementCharacterCount: countMatches(value, /\uFFFD/gu),
    tildeCount: countMatches(value, /~/gu),
  };
}

function numberedExampleAtLine(
  line: string,
  first: number,
  last: number,
): number | null {
  const match = /^\s*\(\s*([0-9][0-9 ]*)\s*\)/u.exec(line);
  if (!match) return null;
  const digits = (match[1] ?? '').replace(/\s+/gu, '');
  const value = Number.parseInt(digits, 10);
  return Number.isInteger(value) && value >= first && value <= last
    ? value
    : null;
}

function extractNumberedExamples(
  pages: VerifiedPage[],
  contract: DouglasGrammarInventoryContract,
): {
  rows: Array<Record<string, unknown>>;
  occurrenceCount: number;
  duplicateNumbers: number[];
} {
  const { expected_first_number: first, expected_last_number: last } =
    contract.numbered_examples;
  const occurrences = new Map<number, ResolvedPageSpan[]>();

  for (const page of pages) {
    const starts = page.lines
      .map((line, index) => ({
        exampleNumber: numberedExampleAtLine(line, first, last),
        lineIndex: index,
      }))
      .filter(
        (
          candidate,
        ): candidate is { exampleNumber: number; lineIndex: number } =>
          candidate.exampleNumber !== null,
      );

    starts.forEach((start, index) => {
      const next = starts[index + 1];
      let lineEnd = next ? next.lineIndex : page.lines.length;
      while (lineEnd > start.lineIndex + 1) {
        const candidate = page.lines[lineEnd - 1];
        if (candidate?.trim()) break;
        lineEnd -= 1;
      }
      const span = resolveSpan(pages, {
        chapter_page_ordinal: page.row.chapterPageOrdinal,
        line_start: start.lineIndex + 1,
        line_end: lineEnd,
      });
      const existing = occurrences.get(start.exampleNumber) ?? [];
      existing.push(span);
      occurrences.set(start.exampleNumber, existing);
    });
  }

  const missing: number[] = [];
  for (let number = first; number <= last; number += 1)
    if (!occurrences.has(number)) missing.push(number);
  if (missing.length > 0)
    throw new Error(`numbered examples are missing: ${missing.join(',')}`);

  const unexpected = Array.from(occurrences.keys()).filter(
    (number) => number < first || number > last,
  );
  if (unexpected.length > 0)
    throw new Error(`unexpected example numbers: ${unexpected.join(',')}`);

  const duplicateNumbers = Array.from(occurrences.entries())
    .filter(([, spans]) => spans.length > 1)
    .map(([number]) => number)
    .sort((left, right) => left - right);
  const expectedDuplicates = [
    ...contract.numbered_examples.expected_duplicate_numbers,
  ].sort((left, right) => left - right);
  if (JSON.stringify(duplicateNumbers) !== JSON.stringify(expectedDuplicates))
    throw new Error(
      `duplicate example numbers ${JSON.stringify(duplicateNumbers)} do not match contract ${JSON.stringify(expectedDuplicates)}`,
    );

  const occurrenceCount = Array.from(occurrences.values()).reduce(
    (count, spans) => count + spans.length,
    0,
  );
  if (occurrenceCount !== contract.numbered_examples.expected_occurrence_count)
    throw new Error(
      `found ${occurrenceCount} numbered-example occurrences, expected ${contract.numbered_examples.expected_occurrence_count}`,
    );

  const rows = Array.from(occurrences.entries())
    .sort(([left], [right]) => left - right)
    .map(([exampleNumber, spans]) => ({
      schemaVersion: 1,
      exampleId: `${contract.inventory_id}:numbered-example:${exampleNumber}`,
      exampleNumber,
      occurrences: spans.map((span, index) => ({
        occurrenceIndex: index + 1,
        ...span,
        ocrDiagnostics: ocrDiagnostics(span.sourceText),
      })),
      occurrenceCount: spans.length,
      blockBoundaryPolicy: contract.numbered_examples.block_boundary_policy,
      blockBoundaryPrecision: 'coarse_source_layout_block',
      transcriptionStatus: 'raw_ocr_candidate',
      segmentationStatus: 'unresolved',
      morphemeGlossStatus: 'unresolved',
      translationAlignmentStatus: 'unresolved',
      acceptanceStatus: 'not_accepted',
      trainingEligibility: contract.source.training_use,
      limitations: [
        'The block ends at the next numbered example or the source-page boundary and may contain adjacent prose or headings.',
        'OCR spacing and character substitutions are preserved; no form is silently modernized or corrected.',
      ],
    }));

  return { rows, occurrenceCount, duplicateNumbers };
}

export function buildDouglasGrammarInventory(
  sourceBytes: Buffer,
  pageIndexRows: DouglasPageIndexRow[],
  contractValue: unknown,
): DouglasGrammarInventoryResult {
  const contract = DouglasGrammarInventoryContractSchema.parse(contractValue);
  const sourceSha256 = sha256(sourceBytes);
  if (sourceSha256 !== contract.source.sha256)
    throw new Error(
      `source hash mismatch: ${sourceSha256} != ${contract.source.sha256}`,
    );

  uniqueKeys(
    contract.table_blocks.map((block) => block.block_key),
    'table block key',
  );
  uniqueKeys(
    contract.morphotactic_statements.map(
      (statement) => statement.statement_key,
    ),
    'morphotactic statement key',
  );
  uniqueKeys(
    contract.curated_examples.map((example) =>
      example.example_number.toString(),
    ),
    'curated example number',
  );

  const pages = verifyPages(
    sourceBytes,
    pageIndexRows,
    contract.source.source_id,
    contract.source.sha256,
  );
  const tableBlocks = contract.table_blocks.map((block) => {
    const evidenceSpan = resolveSpan(pages, block.evidence_span);
    return {
      schemaVersion: 1,
      tableBlockId: `${contract.inventory_id}:table:${block.block_key}`,
      tableBlockKey: block.block_key,
      label: block.label,
      tableKind: block.table_kind,
      intendedAnalysis: block.intended_analysis,
      sourceId: contract.source.source_id,
      sourceSha256: contract.source.sha256,
      sourceRendering: contract.source.source_rendering,
      evidenceSpan,
      ocrDiagnostics: ocrDiagnostics(evidenceSpan.sourceText),
      transcriptionStatus: 'source_rendering_preserved_unparsed',
      cellResolutionStatus: 'unresolved',
      acceptanceStatus: 'not_accepted',
      trainingEligibility: contract.source.training_use,
      limitations: block.limitations,
    };
  });

  const morphotacticStatements = contract.morphotactic_statements.map(
    (statement) => ({
      schemaVersion: 1,
      statementId: `${contract.inventory_id}:statement:${statement.statement_key}`,
      statementKey: statement.statement_key,
      topic: statement.topic,
      analystProposition: statement.proposition,
      sourceAnalysisType: statement.source_analysis_type,
      sourceId: contract.source.source_id,
      sourceSha256: contract.source.sha256,
      sourceRendering: contract.source.source_rendering,
      evidenceSpans: statement.evidence_spans.map((span) =>
        resolveSpan(pages, span),
      ),
      propositionStatus: 'source_anchored_candidate',
      independentConfirmationStatus: 'not_confirmed',
      acceptanceStatus: 'not_accepted',
      trainingEligibility: contract.source.training_use,
      limitations: statement.limitations,
    }),
  );

  const numbered = extractNumberedExamples(pages, contract);
  const exampleByNumber = new Map(
    numbered.rows.map((row) => [row.exampleNumber as number, row]),
  );
  const curatedExamples = contract.curated_examples.map((spec) => {
    const example = exampleByNumber.get(spec.example_number);
    if (!example)
      throw new Error(
        `curated example ${spec.example_number} is absent from the numbered inventory`,
      );
    return {
      schemaVersion: 1,
      curatedExampleId: `${contract.inventory_id}:curated-example:${spec.example_number}`,
      exampleNumber: spec.example_number,
      phenomenonTags: spec.phenomenon_tags,
      selectionRationale: spec.selection_rationale,
      sourceOccurrences: example.occurrences,
      sourceId: contract.source.source_id,
      sourceSha256: contract.source.sha256,
      transcriptionStatus: 'raw_ocr_candidate',
      reviewStatus: 'requires_source_image_and_independent_analysis',
      acceptanceStatus: 'not_accepted',
      trainingEligibility: contract.source.training_use,
      limitations: spec.limitations,
    };
  });

  return {
    tableBlocks,
    morphotacticStatements,
    numberedExamples: numbered.rows,
    curatedExamples,
    numberedExampleOccurrenceCount: numbered.occurrenceCount,
    duplicateExampleNumbers: numbered.duplicateNumbers,
  };
}
