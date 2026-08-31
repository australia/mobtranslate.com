import { createHash } from 'node:crypto';
import { z } from 'zod';
import { canonicalJson, normalizeComparison } from './dictionarySourceCensus';

const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const KeySchema = z.string().regex(/^[a-z0-9][a-z0-9.-]*$/);

export const PdfTsvLexiconContractSchema = z
  .object({
    schema_version: z.literal(1),
    inventory_id: KeySchema,
    created_at_utc: z.string().datetime(),
    language: z.object({
      code: z.string().min(1),
      name: z.string().min(1),
    }),
    source: z.object({
      source_id: z.string().min(1),
      source_pdf_path: z.string().min(1),
      source_pdf_sha256: Sha256Schema,
      tsv_path: z.string().min(1),
      tsv_sha256: Sha256Schema,
      extraction_command: z.string().min(1),
      first_tsv_page: z.number().int().positive(),
      last_tsv_page: z.number().int().positive(),
      first_printed_page: z.number().int().positive(),
      orthography_label: z.string().min(1),
      section_end_exclusive: z
        .object({
          tsv_page: z.number().int().positive(),
          exact_line_text: z.string().min(1),
        })
        .optional(),
    }),
    layout: z.object({
      body_top_min: z.number().nonnegative(),
      body_top_max: z.number().positive(),
      expected_columns: z.literal(2),
      minimum_column_gap_x: z.number().positive(),
      column_boundary_tolerance_x: z.number().nonnegative(),
      entry_start_tolerance_x: z.number().positive(),
      line_top_tolerance: z.number().positive(),
      no_space_gap_max: z.number().nonnegative(),
    }),
    output_directory: z.string().min(1),
    release_status: z.literal('not_released'),
  })
  .superRefine((contract, context) => {
    if (contract.source.last_tsv_page < contract.source.first_tsv_page)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['source', 'last_tsv_page'],
        message: 'last_tsv_page must not precede first_tsv_page',
      });
    if (contract.layout.body_top_max <= contract.layout.body_top_min)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['layout', 'body_top_max'],
        message: 'body_top_max must exceed body_top_min',
      });
    if (
      contract.source.section_end_exclusive &&
      (contract.source.section_end_exclusive.tsv_page <
        contract.source.first_tsv_page ||
        contract.source.section_end_exclusive.tsv_page >
          contract.source.last_tsv_page)
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['source', 'section_end_exclusive', 'tsv_page'],
        message: 'section boundary page must be inside the selected TSV range',
      });
  });

export type PdfTsvLexiconContract = z.infer<typeof PdfTsvLexiconContractSchema>;

interface TsvWord {
  pageNumber: number;
  paragraphNumber: number;
  blockNumber: number;
  lineNumber: number;
  wordNumber: number;
  left: number;
  top: number;
  width: number;
  height: number;
  confidence: number;
  text: string;
}

interface TsvSourceLine {
  pageNumber: number;
  paragraphNumber: number;
  blockNumber: number;
  lineNumber: number;
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface PdfTsvLexiconLine {
  schemaVersion: 1;
  lineId: string;
  inventoryId: string;
  sourceId: string;
  sourcePdfSha256: string;
  tsvSha256: string;
  tsvPage: number;
  printedPage: number;
  column: 'left' | 'right';
  pageColumnLineOrdinal: number;
  columnStartX: number;
  sourceTop: number;
  sourceLeft: number;
  sourceRight: number;
  reconstructedText: string;
  tokens: Array<{
    text: string;
    left: number;
    top: number;
    width: number;
    height: number;
    paragraphNumber: number;
    blockNumber: number;
    lineNumber: number;
    wordNumber: number;
  }>;
}

export interface HistoricalLexiconCandidate {
  schemaVersion: 1;
  sourceRecordId: string;
  inventoryId: string;
  sourceId: string;
  sourcePdfSha256: string;
  tsvSha256: string;
  sourceOrdinal: number;
  sourceRecordSha256: string;
  headwordSource: string;
  headwordComparison: string;
  rawPartOfSpeech: string | null;
  glossSource: string;
  sourceText: string;
  sourceLineIds: string[];
  startAnchor: {
    tsvPage: number;
    printedPage: number;
    column: 'left' | 'right';
    sourceTop: number;
    sourceLeft: number;
  };
  endAnchor: {
    tsvPage: number;
    printedPage: number;
    column: 'left' | 'right';
    sourceTop: number;
    sourceRight: number;
  };
  orthography: string;
  extractionFlags: string[];
  lexicalIdentityStatus: 'unadjudicated_historical_source_record';
  modernOrthographyRelationStatus: 'unadjudicated';
  senseBoundaryStatus: 'unadjudicated';
  trainingEligibility: 'not_allowed';
  status: 'candidate';
}

export interface HistoricalLexiconReviewItem {
  schemaVersion: 1;
  reviewItemId: string;
  sourceRecordId: string;
  reviewKind: 'historical_lexicon_entry';
  evidenceAnchors: Array<{
    sourceId: string;
    sourcePdfSha256: string;
    printedPage: number;
    column: 'left' | 'right';
    sourceTop: number;
  }>;
  requiredDecisions: string[];
  extractionFlags: string[];
  status: 'pending';
}

export interface PdfTsvLexiconResult {
  lines: PdfTsvLexiconLine[];
  entries: HistoricalLexiconCandidate[];
  reviewQueue: HistoricalLexiconReviewItem[];
  report: {
    schemaVersion: 1;
    inventoryId: string;
    sourceId: string;
    sourcePdfSha256: string;
    tsvSha256: string;
    tsvBytes: number;
    tsvRows: number;
    wordRows: number;
    selectedWordRows: number;
    reconstructedLines: number;
    candidateEntries: number;
    candidateEntriesWithPartOfSpeech: number;
    candidateEntriesWithoutPartOfSpeech: number;
    candidateEntriesWithExtractionFlags: number;
    possibleHeadwordBoundaryErrors: number;
    possibleEmbeddedFontGlyphAmbiguities: number;
    entriesWithVariantDelimiter: number;
    entriesSpanningPages: number;
    orphanLines: number;
    firstPrintedPage: number;
    lastPrintedPage: number;
    leftColumnEntries: number;
    rightColumnEntries: number;
    entriesByPrintedPage: Record<string, number>;
    rawPartOfSpeechCounts: Record<string, number>;
    extractionFlagCounts: Record<string, number>;
    trainingEligibleRows: 0;
    claimLimit: string;
  };
}

function sha256(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex');
}

function parseFinite(value: string, field: string, row: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed))
    throw new Error(`invalid ${field} at TSV row ${row}: ${value}`);
  return parsed;
}

function parseTsvWords(tsvBytes: Buffer): {
  words: TsvWord[];
  sourceLines: TsvSourceLine[];
  tsvRows: number;
} {
  const text = tsvBytes.toString('utf8').replace(/\r\n?/gu, '\n');
  const rows = text.endsWith('\n')
    ? text.slice(0, -1).split('\n')
    : text.split('\n');
  const header = rows.shift();
  if (
    header !==
    'level\tpage_num\tpar_num\tblock_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext'
  )
    throw new Error('unexpected pdftotext TSV header');

  const words: TsvWord[] = [];
  const sourceLines: TsvSourceLine[] = [];
  rows.forEach((rowText, index) => {
    const rowNumber = index + 2;
    const fields = rowText.split('\t');
    if (fields.length !== 12)
      throw new Error(
        `expected 12 TSV fields at row ${rowNumber}, found ${fields.length}`,
      );
    if (fields[0] === '4') {
      sourceLines.push({
        pageNumber: parseFinite(fields[1] ?? '', 'page_num', rowNumber),
        paragraphNumber: parseFinite(fields[2] ?? '', 'par_num', rowNumber),
        blockNumber: parseFinite(fields[3] ?? '', 'block_num', rowNumber),
        lineNumber: parseFinite(fields[4] ?? '', 'line_num', rowNumber),
        left: parseFinite(fields[6] ?? '', 'left', rowNumber),
        top: parseFinite(fields[7] ?? '', 'top', rowNumber),
        width: parseFinite(fields[8] ?? '', 'width', rowNumber),
        height: parseFinite(fields[9] ?? '', 'height', rowNumber),
      });
      return;
    }
    if (fields[0] !== '5') return;
    const textValue = fields[11] ?? '';
    if (!textValue) throw new Error(`empty word text at TSV row ${rowNumber}`);
    words.push({
      pageNumber: parseFinite(fields[1] ?? '', 'page_num', rowNumber),
      paragraphNumber: parseFinite(fields[2] ?? '', 'par_num', rowNumber),
      blockNumber: parseFinite(fields[3] ?? '', 'block_num', rowNumber),
      lineNumber: parseFinite(fields[4] ?? '', 'line_num', rowNumber),
      wordNumber: parseFinite(fields[5] ?? '', 'word_num', rowNumber),
      left: parseFinite(fields[6] ?? '', 'left', rowNumber),
      top: parseFinite(fields[7] ?? '', 'top', rowNumber),
      width: parseFinite(fields[8] ?? '', 'width', rowNumber),
      height: parseFinite(fields[9] ?? '', 'height', rowNumber),
      confidence: parseFinite(fields[10] ?? '', 'conf', rowNumber),
      text: textValue,
    });
  });
  return { words, sourceLines, tsvRows: rows.length + 1 };
}

function reconstructText(words: TsvWord[], noSpaceGapMax: number): string {
  const sorted = [...words].sort((a, b) => a.left - b.left);
  let result = '';
  let previous: TsvWord | null = null;
  for (const word of sorted) {
    if (previous) {
      const gap = word.left - (previous.left + previous.width);
      if (gap > noSpaceGapMax) result += ' ';
    }
    result += word.text;
    previous = word;
  }
  return result.normalize('NFC').trim();
}

function clusterVisualLines(
  words: TsvWord[],
  sourceLines: TsvSourceLine[],
  contract: PdfTsvLexiconContract,
): PdfTsvLexiconLine[] {
  const selected = words.filter(
    (word) =>
      word.pageNumber >= contract.source.first_tsv_page &&
      word.pageNumber <= contract.source.last_tsv_page &&
      word.top >= contract.layout.body_top_min &&
      word.top <= contract.layout.body_top_max,
  );
  const lines: PdfTsvLexiconLine[] = [];
  for (
    let page = contract.source.first_tsv_page;
    page <= contract.source.last_tsv_page;
    page += 1
  ) {
    const pageWords = selected.filter((word) => word.pageNumber === page);
    const visualLineStarts = sourceLines
      .filter(
        (line) =>
          line.pageNumber === page &&
          line.top >= contract.layout.body_top_min &&
          line.top <= contract.layout.body_top_max,
      )
      .map((line) => line.left)
      .sort((a, b) => a - b);
    if (visualLineStarts.length < contract.layout.expected_columns)
      throw new Error(`page ${page} has too few visual lines for two columns`);
    let largestGap = Number.NEGATIVE_INFINITY;
    let rightColumnStart = Number.NaN;
    for (let index = 1; index < visualLineStarts.length; index += 1) {
      const previous = visualLineStarts[index - 1];
      const current = visualLineStarts[index];
      if (!previous || !current) continue;
      const gap = current - previous;
      if (gap > largestGap) {
        largestGap = gap;
        rightColumnStart = current;
      }
    }
    if (
      !Number.isFinite(rightColumnStart) ||
      largestGap < contract.layout.minimum_column_gap_x
    )
      throw new Error(
        `page ${page} has no two-column visual-line gap of at least ${contract.layout.minimum_column_gap_x}`,
      );
    const columnStarts = {
      left: Math.min(
        ...visualLineStarts.filter((left) => left < rightColumnStart),
      ),
      right: rightColumnStart,
    };
    const buckets = new Map<'left' | 'right', TsvWord[]>([
      ['left', []],
      ['right', []],
    ]);
    for (const word of pageWords) {
      const column =
        word.left <
        rightColumnStart - contract.layout.column_boundary_tolerance_x
          ? 'left'
          : 'right';
      buckets.get(column)?.push(word);
    }
    for (const column of ['left', 'right'] as const) {
      const bucket = [...(buckets.get(column) ?? [])].sort(
        (a, b) => a.top - b.top || a.left - b.left,
      );
      const clusters: TsvWord[][] = [];
      for (const word of bucket) {
        const cluster = clusters.at(-1);
        if (
          !cluster ||
          Math.abs(word.top - (cluster[0]?.top ?? word.top)) >
            contract.layout.line_top_tolerance
        )
          clusters.push([word]);
        else cluster.push(word);
      }

      clusters.forEach((cluster, index) => {
        const sorted = [...cluster].sort((a, b) => a.left - b.left);
        const first = sorted[0];
        const last = sorted.at(-1);
        if (!first || !last) throw new Error('empty visual-line cluster');
        const printedPage =
          contract.source.first_printed_page +
          (page - contract.source.first_tsv_page);
        lines.push({
          schemaVersion: 1,
          lineId: `${contract.inventory_id}:page:${printedPage}:${column}:line:${String(
            index + 1,
          ).padStart(3, '0')}`,
          inventoryId: contract.inventory_id,
          sourceId: contract.source.source_id,
          sourcePdfSha256: contract.source.source_pdf_sha256,
          tsvSha256: contract.source.tsv_sha256,
          tsvPage: page,
          printedPage,
          column,
          pageColumnLineOrdinal: index + 1,
          columnStartX: columnStarts[column],
          sourceTop: Math.min(...cluster.map((word) => word.top)),
          sourceLeft: first.left,
          sourceRight: Math.max(
            ...cluster.map((word) => word.left + word.width),
          ),
          reconstructedText: reconstructText(
            sorted,
            contract.layout.no_space_gap_max,
          ),
          tokens: sorted.map((word) => ({
            text: word.text,
            left: word.left,
            top: word.top,
            width: word.width,
            height: word.height,
            paragraphNumber: word.paragraphNumber,
            blockNumber: word.blockNumber,
            lineNumber: word.lineNumber,
            wordNumber: word.wordNumber,
          })),
        });
      });
    }
  }
  const boundary = contract.source.section_end_exclusive;
  if (!boundary) return lines;
  const boundaryLines = lines.filter(
    (line) =>
      line.tsvPage === boundary.tsv_page &&
      line.reconstructedText === boundary.exact_line_text,
  );
  if (boundaryLines.length !== 1)
    throw new Error(
      `expected exactly one section boundary '${boundary.exact_line_text}' on TSV page ${boundary.tsv_page}, found ${boundaryLines.length}`,
    );
  const boundaryTop = boundaryLines[0]?.sourceTop;
  if (boundaryTop === undefined) throw new Error('section boundary has no top');
  return lines.filter(
    (line) =>
      line.tsvPage < boundary.tsv_page ||
      (line.tsvPage === boundary.tsv_page && line.sourceTop < boundaryTop),
  );
}

function entryStart(
  line: PdfTsvLexiconLine,
  contract: PdfTsvLexiconContract,
): boolean {
  if (
    Math.abs(line.sourceLeft - line.columnStartX) >
    contract.layout.entry_start_tolerance_x
  )
    return false;
  const comma = line.reconstructedText.indexOf(',');
  return comma > 0;
}

function entryFlags(
  headword: string,
  rawPartOfSpeech: string | null,
  sourceLines: PdfTsvLexiconLine[],
): string[] {
  const flags = new Set<string>();
  if (!rawPartOfSpeech) flags.add('part_of_speech_not_structurally_extracted');
  if (
    /\u00ad/gu.test(sourceLines.map((line) => line.reconstructedText).join(' '))
  )
    flags.add('contains_discretionary_hyphen');
  if (/\s/gu.test(headword)) flags.add('headword_contains_space');
  if (/[~—]/gu.test(headword)) flags.add('headword_contains_variant_delimiter');
  if (/\bI\b|[a-z]I|I[a-z]/u.test(headword))
    flags.add('possible_embedded_font_glyph_ambiguity');
  if (new Set(sourceLines.map((line) => line.printedPage)).size > 1)
    flags.add('entry_spans_page_boundary');
  const firstLineText = sourceLines[0]?.reconstructedText ?? '';
  const firstComma = firstLineText.indexOf(',');
  const firstColon = firstLineText.indexOf(':');
  if (firstColon >= 0 && (firstComma < 0 || firstColon < firstComma))
    flags.add('possible_headword_boundary_error');
  return [...flags].sort();
}

function countValues(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of [...values].sort())
    counts[value] = (counts[value] ?? 0) + 1;
  return counts;
}

function buildEntry(
  sourceLines: PdfTsvLexiconLine[],
  sourceOrdinal: number,
  contract: PdfTsvLexiconContract,
): HistoricalLexiconCandidate {
  const first = sourceLines[0];
  const last = sourceLines.at(-1);
  if (!first || !last) throw new Error('cannot build entry without lines');
  const comma = first.reconstructedText.indexOf(',');
  if (comma <= 0)
    throw new Error(`entry line has no headword comma: ${first.lineId}`);
  const headwordSource = first.reconstructedText.slice(0, comma).trim();
  if (!headwordSource)
    throw new Error(`entry line has an empty headword: ${first.lineId}`);
  const afterComma = first.reconstructedText.slice(comma + 1).trim();
  const colon = afterComma.indexOf(':');
  const rawPartOfSpeech =
    colon > 0 ? afterComma.slice(0, colon).trim() || null : null;
  const firstGloss =
    colon > 0 ? afterComma.slice(colon + 1).trim() : afterComma;
  const continuation = sourceLines
    .slice(1)
    .map((line) => line.reconstructedText)
    .filter(Boolean);
  const glossSource = [firstGloss, ...continuation].filter(Boolean).join(' ');
  const sourceText = sourceLines
    .map((line) => line.reconstructedText)
    .join(' ');
  const sourceRecordId = `${contract.language.code}-douglas-1981-lex-${String(
    sourceOrdinal,
  ).padStart(4, '0')}`;
  const extractionFlags = entryFlags(
    headwordSource,
    rawPartOfSpeech,
    sourceLines,
  );
  const recordWithoutHash = {
    schemaVersion: 1 as const,
    sourceRecordId,
    inventoryId: contract.inventory_id,
    sourceId: contract.source.source_id,
    sourcePdfSha256: contract.source.source_pdf_sha256,
    tsvSha256: contract.source.tsv_sha256,
    sourceOrdinal,
    headwordSource,
    headwordComparison: normalizeComparison(headwordSource),
    rawPartOfSpeech,
    glossSource,
    sourceText,
    sourceLineIds: sourceLines.map((line) => line.lineId),
    startAnchor: {
      tsvPage: first.tsvPage,
      printedPage: first.printedPage,
      column: first.column,
      sourceTop: first.sourceTop,
      sourceLeft: first.sourceLeft,
    },
    endAnchor: {
      tsvPage: last.tsvPage,
      printedPage: last.printedPage,
      column: last.column,
      sourceTop: last.sourceTop,
      sourceRight: last.sourceRight,
    },
    orthography: contract.source.orthography_label,
    extractionFlags,
    lexicalIdentityStatus: 'unadjudicated_historical_source_record' as const,
    modernOrthographyRelationStatus: 'unadjudicated' as const,
    senseBoundaryStatus: 'unadjudicated' as const,
    trainingEligibility: 'not_allowed' as const,
    status: 'candidate' as const,
  };
  return {
    ...recordWithoutHash,
    sourceRecordSha256: sha256(canonicalJson(recordWithoutHash)),
  };
}

export function buildPdfTsvLexicon(
  tsvBytes: Buffer,
  contractValue: unknown,
): PdfTsvLexiconResult {
  const contract = PdfTsvLexiconContractSchema.parse(contractValue);
  const tsvSha256 = sha256(tsvBytes);
  if (tsvSha256 !== contract.source.tsv_sha256)
    throw new Error(
      `TSV hash mismatch: ${tsvSha256} != ${contract.source.tsv_sha256}`,
    );
  const parsed = parseTsvWords(tsvBytes);
  const lines = clusterVisualLines(parsed.words, parsed.sourceLines, contract);
  const selectedWordRows = lines.reduce(
    (total, line) => total + line.tokens.length,
    0,
  );

  const entries: HistoricalLexiconCandidate[] = [];
  const orphanLines: PdfTsvLexiconLine[] = [];
  let pending: PdfTsvLexiconLine[] = [];
  const flush = (): void => {
    if (pending.length === 0) return;
    entries.push(buildEntry(pending, entries.length + 1, contract));
    pending = [];
  };
  for (const line of lines) {
    if (entryStart(line, contract)) {
      flush();
      pending = [line];
    } else if (pending.length > 0) pending.push(line);
    else orphanLines.push(line);
  }
  flush();
  if (orphanLines.length > 0)
    throw new Error(
      `found ${orphanLines.length} body lines before the first detected entry: ${orphanLines
        .slice(0, 3)
        .map((line) => line.lineId)
        .join(', ')}`,
    );
  if (entries.length === 0) throw new Error('no lexical entries detected');

  const reviewQueue: HistoricalLexiconReviewItem[] = entries.map((entry) => ({
    schemaVersion: 1,
    reviewItemId: `${entry.sourceRecordId}-review`,
    sourceRecordId: entry.sourceRecordId,
    reviewKind: 'historical_lexicon_entry',
    evidenceAnchors: [
      {
        sourceId: entry.sourceId,
        sourcePdfSha256: entry.sourcePdfSha256,
        printedPage: entry.startAnchor.printedPage,
        column: entry.startAnchor.column,
        sourceTop: entry.startAnchor.sourceTop,
      },
    ],
    requiredDecisions: [
      'verify transcription against the archived source page',
      'identify one headword or source-listed variant set without silently splitting it',
      'record the relation to the current orthography using evidence',
      'adjudicate lexical identity and homophony against current dictionary entries',
      'adjudicate the source part of speech and sense boundary',
      'record variety, borrowing, and usage notes when the source supplies them',
      'retain training eligibility as not_allowed unless a separate rights decision changes it',
    ],
    extractionFlags: entry.extractionFlags,
    status: 'pending',
  }));
  const withPartOfSpeech = entries.filter(
    (entry) => entry.rawPartOfSpeech !== null,
  ).length;
  const printedPages = lines.map((line) => line.printedPage);

  return {
    lines,
    entries,
    reviewQueue,
    report: {
      schemaVersion: 1,
      inventoryId: contract.inventory_id,
      sourceId: contract.source.source_id,
      sourcePdfSha256: contract.source.source_pdf_sha256,
      tsvSha256: contract.source.tsv_sha256,
      tsvBytes: tsvBytes.length,
      tsvRows: parsed.tsvRows,
      wordRows: parsed.words.length,
      selectedWordRows,
      reconstructedLines: lines.length,
      candidateEntries: entries.length,
      candidateEntriesWithPartOfSpeech: withPartOfSpeech,
      candidateEntriesWithoutPartOfSpeech: entries.length - withPartOfSpeech,
      candidateEntriesWithExtractionFlags: entries.filter(
        (entry) => entry.extractionFlags.length > 0,
      ).length,
      possibleHeadwordBoundaryErrors: entries.filter((entry) =>
        entry.extractionFlags.includes('possible_headword_boundary_error'),
      ).length,
      possibleEmbeddedFontGlyphAmbiguities: entries.filter((entry) =>
        entry.extractionFlags.includes(
          'possible_embedded_font_glyph_ambiguity',
        ),
      ).length,
      entriesWithVariantDelimiter: entries.filter((entry) =>
        entry.extractionFlags.includes('headword_contains_variant_delimiter'),
      ).length,
      entriesSpanningPages: entries.filter(
        (entry) =>
          entry.startAnchor.printedPage !== entry.endAnchor.printedPage,
      ).length,
      orphanLines: 0,
      firstPrintedPage: Math.min(...printedPages),
      lastPrintedPage: Math.max(...printedPages),
      leftColumnEntries: entries.filter(
        (entry) => entry.startAnchor.column === 'left',
      ).length,
      rightColumnEntries: entries.filter(
        (entry) => entry.startAnchor.column === 'right',
      ).length,
      entriesByPrintedPage: countValues(
        entries.map((entry) => String(entry.startAnchor.printedPage)),
      ),
      rawPartOfSpeechCounts: countValues(
        entries.flatMap((entry) =>
          entry.rawPartOfSpeech ? [entry.rawPartOfSpeech] : [],
        ),
      ),
      extractionFlagCounts: countValues(
        entries.flatMap((entry) => entry.extractionFlags),
      ),
      trainingEligibleRows: 0,
      claimLimit:
        'These are coordinate-reconstructed candidates from a historical documentary vocabulary. No transcription, spelling correspondence, lexical identity, sense, variety, part of speech, rights, or training eligibility has been accepted.',
    },
  };
}
