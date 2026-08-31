import { createHash } from 'node:crypto';
import { z } from 'zod';

const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);

const ComponentSchema = z.object({
  path: z.string().min(1),
  sha256: Sha256Schema,
  rows: z.number().int().nonnegative(),
  record_id_field: z.string().min(1),
});

export const PdfSourceFidelityContractSchema = z.object({
  schema_version: z.literal(1),
  inventory_id: z.string().regex(/^[a-z0-9][a-z0-9.-]*$/),
  created_at_utc: z.string().datetime(),
  language: z.object({
    code: z.string().min(1),
    name: z.string().min(1),
  }),
  source_rendering: z.object({
    source_id: z.string().min(1),
    path: z.string().min(1),
    sha256: Sha256Schema,
    line_count: z.number().int().positive(),
    page_index: ComponentSchema,
  }),
  original_pdf: z.object({
    source_id: z.string().min(1),
    original_url: z.string().url(),
    wayback_capture_timestamp: z.string().regex(/^\d{14}$/),
    wayback_cdx_path: z.string().min(1),
    wayback_cdx_sha256: Sha256Schema,
    wayback_digest_sha1_base32: z.string().regex(/^[A-Z2-7]+$/),
    pdf_path: z.string().min(1),
    pdf_sha256: Sha256Schema,
    pdf_bytes: z.number().int().positive(),
    pdf_page_count: z.number().int().positive(),
    extracted_text_path: z.string().min(1),
    extracted_text_sha256: Sha256Schema,
    extraction_command: z.string().min(1),
    render_directory: z.string().min(1),
    render_filename_template: z.literal('physical-{page:02}.png'),
    render_physical_pages: z
      .array(z.number().int().positive())
      .nonempty()
      .refine((pages) => new Set(pages).size === pages.length),
    render_dpi: z.number().int().positive(),
  }),
  components: z.object({
    claims: ComponentSchema,
    examples: ComponentSchema,
    paradigms: ComponentSchema,
  }),
  match_policy: z.object({
    minimum_multiset_token_recall: z.number().min(0).max(1),
    minimum_unique_token_recall: z.number().min(0).max(1),
    minimum_best_page_margin: z.number().min(0).max(1),
    minimum_evidence_tokens: z.number().int().positive(),
    minimum_anchor_token_recall: z.number().min(0).max(1),
  }),
  required_candidate_state: z.object({
    acceptance_status: z.literal('not_accepted'),
    training_eligibility: z.literal('not_allowed'),
  }),
  rights: z.object({
    local_source_fidelity_review: z.literal('allowed'),
    training_use: z.literal('not_allowed'),
    benchmark_reference_use: z.literal('not_allowed'),
    hosted_transfer: z.literal('not_allowed'),
    redistribution: z.literal('not_allowed'),
  }),
  claim_limit: z.string().min(1),
});

export type PdfSourceFidelityContract = z.infer<
  typeof PdfSourceFidelityContractSchema
>;

export interface EvidenceSpan {
  pageNumbers: number[];
  pagePrecision: string;
  sourceLineStart: number;
  sourceLineEnd: number;
  sourceSpanSha256: string;
}

export interface SourceCandidateRecord {
  [key: string]: unknown;
  acceptanceStatus: string;
  evidenceSpans: EvidenceSpan[];
  trainingEligibility: string;
}

export interface ExtractedPdfPage {
  physicalPage: number;
  printedPage: number | null;
  text: string;
  textSha256: string;
}

export interface PageMatchScore {
  physicalPage: number;
  printedPage: number | null;
  multisetTokenRecall: number;
  uniqueTokenRecall: number;
  combinedScore: number;
}

export interface SourceFidelitySpanVerification {
  spanIndex: number;
  sourceLineStart: number;
  sourceLineEnd: number;
  sourceSpanSha256: string;
  sourceSpanHashVerified: boolean;
  declaredSourceRenderingPages: number[];
  matchedPhysicalPage: number;
  matchedPrintedPage: number | null;
  pdfPageTextSha256: string;
  renderPath: string;
  renderSha256: string;
  multisetTokenRecall: number;
  uniqueTokenRecall: number;
  bestPageMargin: number;
  pageAlignmentMethod:
    | 'source_rendering_full_page_context'
    | 'direct_span_match';
  directBestPhysicalPages: number[];
  pageMetadataDiscrepancy: 'none' | 'declared_page_differs_from_printed_page';
  pageDeltaDeclaredToPrinted: number | null;
}

export interface SourceFidelityCrosswalkRow {
  schemaVersion: 1;
  inventoryId: string;
  component: 'claims' | 'examples' | 'paradigms';
  recordId: string;
  sourceRenderingId: string;
  sourceRenderingSha256: string;
  originalPdfSourceId: string;
  originalPdfSha256: string;
  spanVerifications: SourceFidelitySpanVerification[];
  matchedPhysicalPages: number[];
  matchedPrintedPages: number[];
  targetTextTokenRecall: number | null;
  englishTextTokenRecall: number | null;
  paradigmSurfaceTokenRecall: number | null;
  pageMetadataDiscrepancy: 'none' | 'one_or_more_declared_pages_differ';
  sourceFidelityStatus:
    | 'original_pdf_text_verified'
    | 'original_pdf_text_verified_with_page_correction';
  acceptanceStatus: string;
  trainingEligibility: string;
  linguisticAcceptanceChanged: false;
}

function roundScore(value: number): number {
  return Number(value.toFixed(6));
}

export function sha256Bytes(bytes: string | Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function normalizeEvidenceText(value: string): string[] {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('en')
    .replace(/[’‘`]/g, "'")
    .replace(/[^\p{L}\p{N}']+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function tokenCounts(tokens: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
  return counts;
}

export function tokenRecall(
  evidence: string | string[],
  candidate: string | string[],
): { multiset: number; unique: number; evidenceTokens: number } {
  const evidenceTokens = Array.isArray(evidence)
    ? evidence
    : normalizeEvidenceText(evidence);
  const candidateTokens = Array.isArray(candidate)
    ? candidate
    : normalizeEvidenceText(candidate);
  if (evidenceTokens.length === 0)
    return { multiset: 0, unique: 0, evidenceTokens: 0 };
  const evidenceCounts = tokenCounts(evidenceTokens);
  const candidateCounts = tokenCounts(candidateTokens);
  let matched = 0;
  let matchedUnique = 0;
  for (const [token, expectedCount] of evidenceCounts.entries()) {
    const available = candidateCounts.get(token) ?? 0;
    matched += Math.min(expectedCount, available);
    if (available > 0) matchedUnique += 1;
  }
  return {
    multiset: roundScore(matched / evidenceTokens.length),
    unique: roundScore(matchedUnique / evidenceCounts.size),
    evidenceTokens: evidenceTokens.length,
  };
}

export function parseExtractedPdfPages(
  extractedText: string,
  expectedPageCount: number,
): ExtractedPdfPage[] {
  const segments = extractedText.split('\f');
  if (segments.at(-1)?.trim() === '') segments.pop();
  if (segments.length !== expectedPageCount)
    throw new Error(
      `PDF text page count mismatch: expected ${expectedPageCount}, found ${segments.length}`,
    );
  return segments.map((text, index) => {
    const printedMatches = [
      ...text.matchAll(/P\s*[–-]\s*10 Scope and Sequence\s+(\d+)/gu),
    ];
    const printedPage = printedMatches.length
      ? Number(printedMatches.at(-1)?.[1])
      : null;
    return {
      physicalPage: index + 1,
      printedPage,
      text,
      textSha256: sha256Bytes(text),
    };
  });
}

export function rankPdfPages(
  evidenceText: string,
  pages: ExtractedPdfPage[],
): PageMatchScore[] {
  const evidenceTokens = normalizeEvidenceText(evidenceText);
  return pages
    .map((page) => {
      const recall = tokenRecall(evidenceTokens, normalizeEvidenceText(page.text));
      return {
        physicalPage: page.physicalPage,
        printedPage: page.printedPage,
        multisetTokenRecall: recall.multiset,
        uniqueTokenRecall: recall.unique,
        combinedScore: roundScore(recall.multiset * 0.7 + recall.unique * 0.3),
      };
    })
    .sort(
      (a, b) =>
        b.combinedScore - a.combinedScore ||
        b.multisetTokenRecall - a.multisetTokenRecall ||
        a.physicalPage - b.physicalPage,
    );
}

export function sourceSpanText(
  sourceLines: string[],
  span: EvidenceSpan,
): string {
  if (
    span.sourceLineStart < 1 ||
    span.sourceLineEnd < span.sourceLineStart ||
    span.sourceLineEnd > sourceLines.length
  )
    throw new Error(
      `invalid source span ${span.sourceLineStart}-${span.sourceLineEnd} for ${sourceLines.length} lines`,
    );
  return sourceLines
    .slice(span.sourceLineStart - 1, span.sourceLineEnd)
    .join('\n');
}

export function sha1Base32(bytes: Buffer): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const digest = createHash('sha1').update(bytes).digest();
  let bits = 0;
  let value = 0;
  let encoded = '';
  for (const byte of digest) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      encoded += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) encoded += alphabet[(value << (5 - bits)) & 31];
  return encoded;
}
