import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { canonicalJson } from '../lib/research/dictionarySourceCensus';
import {
  parseExtractedPdfPages,
  PdfSourceFidelityContractSchema,
  rankPdfPages,
  sha1Base32,
  sha256Bytes,
  sourceSpanText,
  tokenRecall,
  type EvidenceSpan,
  type ExtractedPdfPage,
  type SourceCandidateRecord,
  type SourceFidelityCrosswalkRow,
} from '../lib/research/pdfSourceFidelity';

interface SourcePageIndexRecord {
  pageIndexId: string;
  pageNumbers: number[];
  pagePrecision: string;
  sourceLineStart: number;
  sourceLineEnd: number;
  sourceSpanSha256: string;
}

interface SourcePageAlignment {
  schemaVersion: 1;
  inventoryId: string;
  pageIndexId: string;
  sourceRenderingPages: number[];
  sourceLineStart: number;
  sourceLineEnd: number;
  sourceSpanSha256: string;
  matchedPhysicalPage: number;
  matchedPrintedPage: number | null;
  pdfPageTextSha256: string;
  renderPath: string;
  renderSha256: string;
  multisetTokenRecall: number;
  uniqueTokenRecall: number;
  bestPageMargin: number;
  pageMetadataDiscrepancy: 'none' | 'declared_page_differs_from_printed_page';
  pageDeltaDeclaredToPrinted: number | null;
}

function flagValue(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? null) : null;
}

function resolveWithin(root: string, relativePath: string): string {
  if (path.isAbsolute(relativePath))
    throw new Error(`path must be relative to the program root: ${relativePath}`);
  const resolved = path.resolve(root, relativePath);
  const relative = path.relative(root, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative))
    throw new Error(`path escapes the program root: ${relativePath}`);
  return resolved;
}

function readVerified(
  root: string,
  relativePath: string,
  expectedSha256: string,
): Buffer {
  const bytes = readFileSync(resolveWithin(root, relativePath));
  const actualSha256 = sha256Bytes(bytes);
  if (actualSha256 !== expectedSha256)
    throw new Error(
      `hash mismatch for ${relativePath}: expected ${expectedSha256}, found ${actualSha256}`,
    );
  return bytes;
}

function parseJsonLines(bytes: Buffer, relativePath: string): unknown[] {
  const text = bytes.toString('utf8');
  if (!text.endsWith('\n'))
    throw new Error(`JSONL must end with a newline: ${relativePath}`);
  return text
    .split('\n')
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line) as unknown;
      } catch (error) {
        throw new Error(
          `invalid JSON at ${relativePath}:${index + 1}: ${String(error)}`,
        );
      }
    });
}

function asEvidenceSpan(value: unknown, recordId: string): EvidenceSpan {
  if (!value || typeof value !== 'object')
    throw new Error(`invalid evidence span on ${recordId}`);
  const span = value as Record<string, unknown>;
  const pageNumbers = span.pageNumbers;
  if (
    !Array.isArray(pageNumbers) ||
    pageNumbers.length === 0 ||
    !pageNumbers.every((page) => Number.isInteger(page) && Number(page) > 0) ||
    typeof span.pagePrecision !== 'string' ||
    !Number.isInteger(span.sourceLineStart) ||
    !Number.isInteger(span.sourceLineEnd) ||
    typeof span.sourceSpanSha256 !== 'string' ||
    !/^[0-9a-f]{64}$/.test(span.sourceSpanSha256)
  )
    throw new Error(`malformed evidence span on ${recordId}`);
  return {
    pageNumbers: pageNumbers.map(Number),
    pagePrecision: span.pagePrecision,
    sourceLineStart: Number(span.sourceLineStart),
    sourceLineEnd: Number(span.sourceLineEnd),
    sourceSpanSha256: span.sourceSpanSha256,
  };
}

function asCandidateRecord(
  value: unknown,
  recordIdField: string,
  component: string,
): { recordId: string; record: SourceCandidateRecord } {
  if (!value || typeof value !== 'object')
    throw new Error(`invalid ${component} record`);
  const record = value as Record<string, unknown>;
  const recordId = record[recordIdField];
  if (typeof recordId !== 'string' || !recordId)
    throw new Error(`${component} record has no ${recordIdField}`);
  if (
    typeof record.acceptanceStatus !== 'string' ||
    typeof record.trainingEligibility !== 'string' ||
    !Array.isArray(record.evidenceSpans) ||
    record.evidenceSpans.length === 0
  )
    throw new Error(`malformed candidate record: ${recordId}`);
  return {
    recordId,
    record: {
      ...record,
      acceptanceStatus: record.acceptanceStatus,
      trainingEligibility: record.trainingEligibility,
      evidenceSpans: record.evidenceSpans.map((span) =>
        asEvidenceSpan(span, recordId),
      ),
    },
  };
}

function asSourcePageIndexRecord(value: unknown): SourcePageIndexRecord {
  if (!value || typeof value !== 'object')
    throw new Error('invalid source page-index record');
  const record = value as Record<string, unknown>;
  if (typeof record.pageIndexId !== 'string' || !record.pageIndexId)
    throw new Error('source page-index record has no pageIndexId');
  const span = asEvidenceSpan(record, record.pageIndexId);
  return {
    pageIndexId: record.pageIndexId,
    ...span,
  };
}

function renderPath(template: string, physicalPage: number): string {
  return template.replace('{page:02}', String(physicalPage).padStart(2, '0'));
}

function jsonLines(rows: unknown[]): string {
  return `${rows.map((row) => canonicalJson(row)).join('\n')}\n`;
}

function writeImmutable(filePath: string, content: string): void {
  if (existsSync(filePath)) {
    const existing = readFileSync(filePath, 'utf8');
    if (existing !== content)
      throw new Error(`refusing to rewrite immutable artifact: ${filePath}`);
    return;
  }
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, { encoding: 'utf8', mode: 0o664 });
}

function minimum(values: number[]): number {
  return values.length ? Number(Math.min(...values).toFixed(6)) : 0;
}

function sortedUnique(values: number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b);
}

function increment(counter: Record<string, number>, key: string): void {
  counter[key] = (counter[key] ?? 0) + 1;
}

function sourceLines(text: string): string[] {
  const lines = text.split(/\r?\n/);
  if (lines.at(-1) === '') lines.pop();
  return lines;
}

function assertCdxIdentity(
  cdxBytes: Buffer,
  expectedOriginalUrl: string,
  expectedTimestamp: string,
  expectedDigest: string,
): void {
  const document = JSON.parse(cdxBytes.toString('utf8')) as unknown;
  if (!Array.isArray(document) || document.length !== 2)
    throw new Error('Wayback CDX response must contain one header and one row');
  const [header, row] = document;
  if (!Array.isArray(header) || !Array.isArray(row))
    throw new Error('Wayback CDX response is not tabular');
  const value = (column: string): unknown => row[header.indexOf(column)];
  if (
    value('timestamp') !== expectedTimestamp ||
    value('original') !== expectedOriginalUrl ||
    value('mimetype') !== 'application/pdf' ||
    value('statuscode') !== '200' ||
    value('digest') !== expectedDigest
  )
    throw new Error('Wayback CDX row does not match the contracted PDF identity');
}

function pageByPhysical(
  pages: ExtractedPdfPage[],
  physicalPage: number,
): ExtractedPdfPage {
  const page = pages.find((candidate) => candidate.physicalPage === physicalPage);
  if (!page) throw new Error(`missing extracted PDF page ${physicalPage}`);
  return page;
}

async function main(): Promise<void> {
  const rootArgument = flagValue('--program-root');
  const contractRelativePath = flagValue('--contract');
  if (!rootArgument || !contractRelativePath)
    throw new Error(
      'usage: tsx scripts/build-pdf-source-fidelity-inventory.ts --program-root PATH --contract RELATIVE_PATH [--write]',
    );

  const programRoot = path.resolve(rootArgument);
  const contractBytes = readFileSync(
    resolveWithin(programRoot, contractRelativePath),
  );
  const contract = PdfSourceFidelityContractSchema.parse(
    JSON.parse(contractBytes.toString('utf8')),
  );
  const sourceRenderingBytes = readVerified(
    programRoot,
    contract.source_rendering.path,
    contract.source_rendering.sha256,
  );
  const renderingLines = sourceLines(sourceRenderingBytes.toString('utf8'));
  if (renderingLines.length !== contract.source_rendering.line_count)
    throw new Error(
      `source rendering line count mismatch: expected ${contract.source_rendering.line_count}, found ${renderingLines.length}`,
    );
  const pageIndexContract = contract.source_rendering.page_index;
  const pageIndexBytes = readVerified(
    programRoot,
    pageIndexContract.path,
    pageIndexContract.sha256,
  );
  const sourcePageIndex = parseJsonLines(pageIndexBytes, pageIndexContract.path).map(
    asSourcePageIndexRecord,
  );
  if (sourcePageIndex.length !== pageIndexContract.rows)
    throw new Error(
      `source page-index row count mismatch: expected ${pageIndexContract.rows}, found ${sourcePageIndex.length}`,
    );
  const exactSourcePageIndex = new Map<number, SourcePageIndexRecord>();
  for (const row of sourcePageIndex) {
    const spanText = sourceSpanText(renderingLines, row);
    if (sha256Bytes(spanText) !== row.sourceSpanSha256)
      throw new Error(`source page-index span hash mismatch: ${row.pageIndexId}`);
    if (row.pagePrecision !== 'exact' || row.pageNumbers.length !== 1) continue;
    const page = row.pageNumbers[0];
    if (exactSourcePageIndex.has(page))
      throw new Error(`duplicate exact source page-index row for page ${page}`);
    exactSourcePageIndex.set(page, row);
  }

  const cdxBytes = readVerified(
    programRoot,
    contract.original_pdf.wayback_cdx_path,
    contract.original_pdf.wayback_cdx_sha256,
  );
  assertCdxIdentity(
    cdxBytes,
    contract.original_pdf.original_url,
    contract.original_pdf.wayback_capture_timestamp,
    contract.original_pdf.wayback_digest_sha1_base32,
  );
  const pdfBytes = readVerified(
    programRoot,
    contract.original_pdf.pdf_path,
    contract.original_pdf.pdf_sha256,
  );
  if (pdfBytes.length !== contract.original_pdf.pdf_bytes)
    throw new Error(
      `PDF byte count mismatch: expected ${contract.original_pdf.pdf_bytes}, found ${pdfBytes.length}`,
    );
  const pdfSha1Base32 = sha1Base32(pdfBytes);
  if (pdfSha1Base32 !== contract.original_pdf.wayback_digest_sha1_base32)
    throw new Error(
      `PDF SHA-1 Base32 mismatch: expected ${contract.original_pdf.wayback_digest_sha1_base32}, found ${pdfSha1Base32}`,
    );
  const extractedTextBytes = readVerified(
    programRoot,
    contract.original_pdf.extracted_text_path,
    contract.original_pdf.extracted_text_sha256,
  );
  const pages = parseExtractedPdfPages(
    extractedTextBytes.toString('utf8'),
    contract.original_pdf.pdf_page_count,
  );

  const renderHashes = new Map<number, { path: string; sha256: string }>();
  for (const physicalPage of [...contract.original_pdf.render_physical_pages].sort(
    (a, b) => a - b,
  )) {
    const filename = renderPath(
      contract.original_pdf.render_filename_template,
      physicalPage,
    );
    const relativePath = `${contract.original_pdf.render_directory}/${filename}`;
    const bytes = readFileSync(resolveWithin(programRoot, relativePath));
    renderHashes.set(physicalPage, {
      path: relativePath,
      sha256: sha256Bytes(bytes),
    });
  }

  const sourcePageAlignmentCache = new Map<number, SourcePageAlignment>();
  const alignSourceRenderingPage = (declaredPage: number): SourcePageAlignment => {
    const cached = sourcePageAlignmentCache.get(declaredPage);
    if (cached) return cached;
    const indexRecord = exactSourcePageIndex.get(declaredPage);
    if (!indexRecord)
      throw new Error(
        `no exact source page-index row for declared page ${declaredPage}`,
      );
    const contextText = sourceSpanText(renderingLines, indexRecord);
    const rankedPages = rankPdfPages(contextText, pages);
    const best = rankedPages[0];
    const second = rankedPages[1];
    if (!best || !second)
      throw new Error(`not enough PDF pages to align source page ${declaredPage}`);
    const bestPageMargin = Number(
      (best.combinedScore - second.combinedScore).toFixed(6),
    );
    if (
      best.multisetTokenRecall <
        contract.match_policy.minimum_multiset_token_recall ||
      best.uniqueTokenRecall < contract.match_policy.minimum_unique_token_recall ||
      bestPageMargin < contract.match_policy.minimum_best_page_margin
    )
      throw new Error(
        `weak full-page PDF alignment for declared page ${declaredPage}: ` +
          JSON.stringify({ best, second, bestPageMargin }),
      );
    const pdfPage = pageByPhysical(pages, best.physicalPage);
    const render = renderHashes.get(best.physicalPage);
    if (!render)
      throw new Error(
        `no contracted rendering for aligned physical page ${best.physicalPage}`,
      );
    const declaredPageMatches = pdfPage.printedPage === declaredPage;
    const alignment: SourcePageAlignment = {
      schemaVersion: 1,
      inventoryId: contract.inventory_id,
      pageIndexId: indexRecord.pageIndexId,
      sourceRenderingPages: indexRecord.pageNumbers,
      sourceLineStart: indexRecord.sourceLineStart,
      sourceLineEnd: indexRecord.sourceLineEnd,
      sourceSpanSha256: indexRecord.sourceSpanSha256,
      matchedPhysicalPage: pdfPage.physicalPage,
      matchedPrintedPage: pdfPage.printedPage,
      pdfPageTextSha256: pdfPage.textSha256,
      renderPath: render.path,
      renderSha256: render.sha256,
      multisetTokenRecall: best.multisetTokenRecall,
      uniqueTokenRecall: best.uniqueTokenRecall,
      bestPageMargin,
      pageMetadataDiscrepancy: declaredPageMatches
        ? 'none'
        : 'declared_page_differs_from_printed_page',
      pageDeltaDeclaredToPrinted:
        pdfPage.printedPage === null ? null : declaredPage - pdfPage.printedPage,
    };
    sourcePageAlignmentCache.set(declaredPage, alignment);
    return alignment;
  };

  const crosswalk: SourceFidelityCrosswalkRow[] = [];
  const componentCounts: Record<string, number> = {};
  let spanCount = 0;
  for (const component of ['claims', 'examples', 'paradigms'] as const) {
    const componentContract = contract.components[component];
    const componentBytes = readVerified(
      programRoot,
      componentContract.path,
      componentContract.sha256,
    );
    const rawRecords = parseJsonLines(componentBytes, componentContract.path);
    if (rawRecords.length !== componentContract.rows)
      throw new Error(
        `${component} row count mismatch: expected ${componentContract.rows}, found ${rawRecords.length}`,
      );
    componentCounts[component] = rawRecords.length;
    for (const rawRecord of rawRecords) {
      const { recordId, record } = asCandidateRecord(
        rawRecord,
        componentContract.record_id_field,
        component,
      );
      if (
        record.acceptanceStatus !==
          contract.required_candidate_state.acceptance_status ||
        record.trainingEligibility !==
          contract.required_candidate_state.training_eligibility
      )
        throw new Error(`candidate state changed before source review: ${recordId}`);

      const spanVerifications = record.evidenceSpans.map((span, spanIndex) => {
        spanCount += 1;
        const spanText = sourceSpanText(renderingLines, span);
        const actualSpanSha256 = sha256Bytes(spanText);
        if (actualSpanSha256 !== span.sourceSpanSha256)
          throw new Error(
            `source span hash mismatch for ${recordId} span ${spanIndex}`,
          );
        const rankedPages = rankPdfPages(spanText, pages);
        const directBest = rankedPages[0];
        const directSecond = rankedPages[1];
        if (!directBest || !directSecond)
          throw new Error(`not enough PDF pages to rank ${recordId}`);
        const evidenceTokenCount = tokenRecall(spanText, '').evidenceTokens;
        const directBestPhysicalPages = rankedPages
          .filter(
            (candidate) =>
              Math.abs(candidate.combinedScore - directBest.combinedScore) < 0.000001,
          )
          .map((candidate) => candidate.physicalPage)
          .sort((a, b) => a - b);
        const contextAlignment =
          span.pageNumbers.length === 1 &&
          exactSourcePageIndex.has(span.pageNumbers[0])
            ? alignSourceRenderingPage(span.pageNumbers[0])
            : null;
        const directBestPageMargin = Number(
          (directBest.combinedScore - directSecond.combinedScore).toFixed(6),
        );
        if (
          !contextAlignment &&
          directBestPageMargin < contract.match_policy.minimum_best_page_margin
        )
          throw new Error(
            `ambiguous direct PDF page match without page context for ${recordId} span ${spanIndex}`,
          );
        const matchedPhysicalPage =
          contextAlignment?.matchedPhysicalPage ?? directBest.physicalPage;
        const page = pageByPhysical(pages, matchedPhysicalPage);
        const selectedRecall = tokenRecall(spanText, page.text);
        const bestPageMargin =
          contextAlignment?.bestPageMargin ?? directBestPageMargin;
        if (
          evidenceTokenCount < contract.match_policy.minimum_evidence_tokens ||
          selectedRecall.multiset <
            contract.match_policy.minimum_multiset_token_recall ||
          selectedRecall.unique < contract.match_policy.minimum_unique_token_recall
        )
          throw new Error(
            `weak PDF text support for ${recordId} span ${spanIndex}: ` +
              JSON.stringify({
                evidenceTokenCount,
                selectedRecall,
                contextAlignment,
                directBest,
                directSecond,
              }),
          );
        const render = renderHashes.get(page.physicalPage);
        if (!render)
          throw new Error(
            `no contracted page rendering for matched physical page ${page.physicalPage}`,
          );
        const declaredPageMatches =
          page.printedPage !== null && span.pageNumbers.includes(page.printedPage);
        const pageDelta =
          span.pageNumbers.length === 1 && page.printedPage !== null
            ? span.pageNumbers[0] - page.printedPage
            : null;
        return {
          spanIndex,
          sourceLineStart: span.sourceLineStart,
          sourceLineEnd: span.sourceLineEnd,
          sourceSpanSha256: span.sourceSpanSha256,
          sourceSpanHashVerified: true,
          declaredSourceRenderingPages: span.pageNumbers,
          matchedPhysicalPage: page.physicalPage,
          matchedPrintedPage: page.printedPage,
          pdfPageTextSha256: page.textSha256,
          renderPath: render.path,
          renderSha256: render.sha256,
          multisetTokenRecall: selectedRecall.multiset,
          uniqueTokenRecall: selectedRecall.unique,
          bestPageMargin,
          pageAlignmentMethod: contextAlignment
            ? ('source_rendering_full_page_context' as const)
            : ('direct_span_match' as const),
          directBestPhysicalPages,
          pageMetadataDiscrepancy: declaredPageMatches
            ? ('none' as const)
            : ('declared_page_differs_from_printed_page' as const),
          pageDeltaDeclaredToPrinted: pageDelta,
        };
      });

      const matchedPhysicalPages = sortedUnique(
        spanVerifications.map((span) => span.matchedPhysicalPage),
      );
      const matchedPrintedPages = sortedUnique(
        spanVerifications
          .map((span) => span.matchedPrintedPage)
          .filter((page): page is number => page !== null),
      );
      const matchedText = matchedPhysicalPages
        .map((page) => pageByPhysical(pages, page).text)
        .join('\n');
      const targetTextTokenRecall =
        typeof record.targetText === 'string'
          ? tokenRecall(record.targetText, matchedText).multiset
          : null;
      const englishTextTokenRecall =
        typeof record.englishText === 'string'
          ? tokenRecall(record.englishText, matchedText).multiset
          : null;
      const paradigmSurfaces = Array.isArray(record.cells)
        ? record.cells
            .map((cell) =>
              cell && typeof cell === 'object'
                ? (cell as Record<string, unknown>).surface
                : null,
            )
            .filter((surface): surface is string => typeof surface === 'string')
            .join(' ')
        : '';
      const paradigmSurfaceTokenRecall = paradigmSurfaces
        ? tokenRecall(paradigmSurfaces, matchedText).multiset
        : null;
      for (const [label, score] of [
        ['target text', targetTextTokenRecall],
        ['English text', englishTextTokenRecall],
        ['paradigm surfaces', paradigmSurfaceTokenRecall],
      ] as const) {
        if (
          score !== null &&
          score < contract.match_policy.minimum_anchor_token_recall
        )
          throw new Error(`${label} anchor failed for ${recordId}: ${score}`);
      }
      const hasPageCorrection = spanVerifications.some(
        (span) => span.pageMetadataDiscrepancy !== 'none',
      );
      crosswalk.push({
        schemaVersion: 1,
        inventoryId: contract.inventory_id,
        component,
        recordId,
        sourceRenderingId: contract.source_rendering.source_id,
        sourceRenderingSha256: contract.source_rendering.sha256,
        originalPdfSourceId: contract.original_pdf.source_id,
        originalPdfSha256: contract.original_pdf.pdf_sha256,
        spanVerifications,
        matchedPhysicalPages,
        matchedPrintedPages,
        targetTextTokenRecall,
        englishTextTokenRecall,
        paradigmSurfaceTokenRecall,
        pageMetadataDiscrepancy: hasPageCorrection
          ? 'one_or_more_declared_pages_differ'
          : 'none',
        sourceFidelityStatus: hasPageCorrection
          ? 'original_pdf_text_verified_with_page_correction'
          : 'original_pdf_text_verified',
        acceptanceStatus: record.acceptanceStatus,
        trainingEligibility: record.trainingEligibility,
        linguisticAcceptanceChanged: false,
      });
    }
  }
  crosswalk.sort(
    (a, b) =>
      a.component.localeCompare(b.component) || a.recordId.localeCompare(b.recordId),
  );
  const sourcePageAlignments = [...sourcePageAlignmentCache.values()].sort(
    (a, b) => a.sourceRenderingPages[0] - b.sourceRenderingPages[0],
  );

  const pageMap = pages.map((page) => {
    const render = renderHashes.get(page.physicalPage) ?? null;
    return {
      schemaVersion: 1,
      inventoryId: contract.inventory_id,
      originalPdfSourceId: contract.original_pdf.source_id,
      physicalPage: page.physicalPage,
      printedPage: page.printedPage,
      pdfPageTextSha256: page.textSha256,
      renderPath: render?.path ?? null,
      renderSha256: render?.sha256 ?? null,
      renderDpi: render ? contract.original_pdf.render_dpi : null,
    };
  });

  const spanRows = crosswalk.flatMap((row) => row.spanVerifications);
  const pageDeltaDistribution: Record<string, number> = {};
  const matchedPageDistribution: Record<string, number> = {};
  for (const span of spanRows) {
    increment(
      pageDeltaDistribution,
      span.pageDeltaDeclaredToPrinted === null
        ? 'not_single_page'
        : String(span.pageDeltaDeclaredToPrinted),
    );
    increment(
      matchedPageDistribution,
      `physical_${span.matchedPhysicalPage}_printed_${span.matchedPrintedPage ?? 'none'}`,
    );
  }
  const recordPageCorrections = crosswalk.filter(
    (row) => row.pageMetadataDiscrepancy !== 'none',
  ).length;
  const report = {
    schema_version: 1,
    report_id: contract.inventory_id,
    created_at_utc: contract.created_at_utc,
    language: contract.language,
    identities: {
      source_rendering: contract.source_rendering,
      original_pdf: {
        source_id: contract.original_pdf.source_id,
        original_url: contract.original_pdf.original_url,
        wayback_capture_timestamp:
          contract.original_pdf.wayback_capture_timestamp,
        wayback_digest_sha1_base32:
          contract.original_pdf.wayback_digest_sha1_base32,
        pdf_path: contract.original_pdf.pdf_path,
        pdf_sha256: contract.original_pdf.pdf_sha256,
        pdf_bytes: contract.original_pdf.pdf_bytes,
        pdf_page_count: contract.original_pdf.pdf_page_count,
        extracted_text_path: contract.original_pdf.extracted_text_path,
        extracted_text_sha256: contract.original_pdf.extracted_text_sha256,
      },
    },
    counts: {
      candidate_records: crosswalk.length,
      candidate_claims: componentCounts.claims ?? 0,
      candidate_examples: componentCounts.examples ?? 0,
      candidate_paradigms: componentCounts.paradigms ?? 0,
      evidence_spans: spanCount,
      source_span_hashes_verified: spanRows.filter(
        (span) => span.sourceSpanHashVerified,
      ).length,
      records_verified_against_original_pdf: crosswalk.length,
      records_with_page_metadata_correction: recordPageCorrections,
      source_rendering_pages_aligned: sourcePageAlignments.length,
      accepted_records: 0,
      training_eligible_records: 0,
    },
    quality: {
      minimum_multiset_token_recall: minimum(
        spanRows.map((span) => span.multisetTokenRecall),
      ),
      minimum_unique_token_recall: minimum(
        spanRows.map((span) => span.uniqueTokenRecall),
      ),
      minimum_best_page_margin: minimum(
        spanRows.map((span) => span.bestPageMargin),
      ),
      minimum_source_page_context_multiset_token_recall: minimum(
        sourcePageAlignments.map((page) => page.multisetTokenRecall),
      ),
      minimum_source_page_context_unique_token_recall: minimum(
        sourcePageAlignments.map((page) => page.uniqueTokenRecall),
      ),
      minimum_source_page_context_margin: minimum(
        sourcePageAlignments.map((page) => page.bestPageMargin),
      ),
      minimum_example_target_token_recall: minimum(
        crosswalk
          .map((row) => row.targetTextTokenRecall)
          .filter((score): score is number => score !== null),
      ),
      minimum_example_english_token_recall: minimum(
        crosswalk
          .map((row) => row.englishTextTokenRecall)
          .filter((score): score is number => score !== null),
      ),
      minimum_paradigm_surface_token_recall: minimum(
        crosswalk
          .map((row) => row.paradigmSurfaceTokenRecall)
          .filter((score): score is number => score !== null),
      ),
      page_delta_declared_to_printed_distribution: pageDeltaDistribution,
      matched_page_distribution: matchedPageDistribution,
    },
    findings: [
      'The archived PDF bytes match the Wayback CDX SHA-1 digest and independently preserve the curriculum source.',
      'Every candidate source span is textually supported on one deterministically identified original-PDF page.',
      'The rendering-derived page metadata is corrected by the original PDF physical and printed page map; this is a provenance correction, not linguistic acceptance.',
      'All claims, examples, and paradigms remain unaccepted and ineligible for benchmark, synthetic-data, training, hosted-transfer, or release use.',
    ],
    decision: {
      source_fidelity: 'verified_with_page_metadata_corrections',
      linguistic_acceptance_changed: false,
      model_or_synthetic_evidence_used: false,
      training_authorized: false,
      benchmark_reference_authorized: false,
    },
    rights: contract.rights,
    claim_limit: contract.claim_limit,
  };

  const outputDirectory = `analysis/inventories/${contract.inventory_id}`;
  const crosswalkContent = jsonLines(crosswalk);
  const pageMapContent = jsonLines(pageMap);
  const sourcePageAlignmentContent = jsonLines(sourcePageAlignments);
  const reportContent = `${JSON.stringify(report, null, 2)}\n`;
  const manifest = {
    schema_version: 1,
    inventory_id: contract.inventory_id,
    created_at_utc: contract.created_at_utc,
    status: 'source_fidelity_verified_with_page_metadata_corrections',
    contract: {
      path: contractRelativePath,
      sha256: sha256Bytes(contractBytes),
    },
    source_rendering: contract.source_rendering,
    original_pdf: {
      source_id: contract.original_pdf.source_id,
      pdf_path: contract.original_pdf.pdf_path,
      pdf_sha256: contract.original_pdf.pdf_sha256,
      wayback_cdx_path: contract.original_pdf.wayback_cdx_path,
      wayback_cdx_sha256: contract.original_pdf.wayback_cdx_sha256,
      wayback_capture_timestamp: contract.original_pdf.wayback_capture_timestamp,
      wayback_digest_sha1_base32:
        contract.original_pdf.wayback_digest_sha1_base32,
      extracted_text_path: contract.original_pdf.extracted_text_path,
      extracted_text_sha256: contract.original_pdf.extracted_text_sha256,
      extraction_command: contract.original_pdf.extraction_command,
    },
    components: {
      crosswalk: {
        path: `${outputDirectory}/record-crosswalk.jsonl`,
        sha256: sha256Bytes(crosswalkContent),
        rows: crosswalk.length,
      },
      page_map: {
        path: `${outputDirectory}/page-map.jsonl`,
        sha256: sha256Bytes(pageMapContent),
        rows: pageMap.length,
      },
      source_page_alignment: {
        path: `${outputDirectory}/source-page-alignment.jsonl`,
        sha256: sha256Bytes(sourcePageAlignmentContent),
        rows: sourcePageAlignments.length,
      },
      report: {
        path: `${outputDirectory}/REPORT.json`,
        sha256: sha256Bytes(reportContent),
      },
    },
    counts: report.counts,
    rights: contract.rights,
    claim_limit: contract.claim_limit,
  };
  const manifestContent = `${JSON.stringify(manifest, null, 2)}\n`;

  if (process.argv.includes('--write')) {
    const outputRoot = resolveWithin(programRoot, outputDirectory);
    writeImmutable(path.join(outputRoot, 'record-crosswalk.jsonl'), crosswalkContent);
    writeImmutable(path.join(outputRoot, 'page-map.jsonl'), pageMapContent);
    writeImmutable(
      path.join(outputRoot, 'source-page-alignment.jsonl'),
      sourcePageAlignmentContent,
    );
    writeImmutable(path.join(outputRoot, 'REPORT.json'), reportContent);
    writeImmutable(path.join(outputRoot, 'MANIFEST.json'), manifestContent);
  }

  console.log(
    JSON.stringify(
      {
        mode: process.argv.includes('--write') ? 'written' : 'validated_only',
        inventoryId: contract.inventory_id,
        outputDirectory,
        manifestSha256: sha256Bytes(manifestContent),
        components: manifest.components,
        counts: report.counts,
        quality: report.quality,
        decision: report.decision,
      },
      null,
      2,
    ),
  );
}

main();
