import { createHash } from 'node:crypto';
import { posix } from 'node:path';
import { load } from 'cheerio';
import { z } from 'zod';
import { normalizeComparison } from './dictionarySourceCensus';

const CDX_HEADER = [
  'timestamp',
  'original',
  'statuscode',
  'mimetype',
  'digest',
  'length',
] as const;

const DictionaryRowSchema = z
  .object({
    Wajarri: z.string().min(1),
    English: z.string().min(1),
    description: z.string(),
  })
  .passthrough();

export interface GeraldtonCdxRecord {
  timestamp: string;
  originalUrl: string;
  statusCode: 200;
  mimeType: string;
  cdxDigestSha1Base32: string;
  cdxLength: number;
}

export interface GeraldtonArchiveAsset extends GeraldtonCdxRecord {
  assetId: string;
  replayUrl: string;
  archiveRelativePath: string;
  assetKind:
    | 'audio'
    | 'document'
    | 'html'
    | 'image'
    | 'script'
    | 'stylesheet'
    | 'other';
}

export interface GeraldtonAdoptionRow {
  sourceRecordId: string;
  snapshotId: string;
  captureTimestamp: string;
  sourceListUrl: string;
  sourceListPath: string;
  sourceListSha256: string;
  sourceItemNumber: number;
  sourceItemHref: string;
  headwordSource: string;
  headwordComparison: string;
  englishSource: string;
  englishComparison: string;
  categorySource: string;
  categoryComparison: string;
  linguisticStatus: 'source_candidate';
  trainingUse: 'not_allowed';
}

export interface GeraldtonCrosswalkRow {
  sourceRecordId: string;
  snapshotId: string;
  sourceItemNumber: number;
  headwordSource: string;
  englishSource: string;
  categorySource: string;
  sourceSurfaceTokenCount: number;
  sourceUnitKind: 'single_surface_form' | 'multiword_expression';
  currentCandidates: Array<{
    sourceRecordId: string;
    sourceOrdinal: number;
    entryCandidateId: string;
    headwordSource: string;
    englishSource: string;
    descriptionSource: string;
    exactEnglishField: boolean;
    englishTokenJaccard: number;
  }>;
  reviewCandidates: Array<{
    sourceRecordId: string;
    sourceOrdinal: number;
    entryCandidateId: string;
    headwordSource: string;
    englishSource: string;
    descriptionSource: string;
    exactHeadword: boolean;
    headwordTrigramJaccard: number;
    englishTokenJaccard: number;
    combinedReviewScore: number;
  }>;
  relationStatus:
    | 'exact_headword_and_english_candidate'
    | 'exact_headword_gloss_review'
    | 'no_exact_headword_review';
  automaticMergeAllowed: false;
  trainingUse: 'not_allowed';
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function assetKind(mimeType: string): GeraldtonArchiveAsset['assetKind'] {
  if (mimeType === 'audio/mpeg') return 'audio';
  if (mimeType === 'application/pdf') return 'document';
  if (mimeType === 'text/html') return 'html';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType === 'application/javascript') return 'script';
  if (mimeType === 'text/css') return 'stylesheet';
  return 'other';
}

function localAssetPath(record: GeraldtonCdxRecord): string {
  const parsed = new URL(record.originalUrl);
  if (
    parsed.protocol !== 'http:' ||
    parsed.hostname !== 'geraldton-goes-wajarri.org' ||
    parsed.port
  )
    throw new Error(
      `unexpected Geraldton Goes Wajarri origin: ${record.originalUrl}`,
    );
  if (parsed.hash)
    throw new Error(
      `URL fragment has no archive policy: ${record.originalUrl}`,
    );

  let relativePath = parsed.pathname.replace(/^\/+/, '');
  if (!relativePath || relativePath.endsWith('/')) relativePath += 'index.html';
  let extension = posix.extname(relativePath);
  if (record.mimeType === 'text/html' && extension === '.php') {
    relativePath = `${relativePath.slice(0, -extension.length)}.html`;
    extension = '.html';
  }
  if (parsed.search) {
    const queryIdentity = sha256(parsed.search).slice(0, 16);
    if (extension)
      relativePath = `${relativePath.slice(0, -extension.length)}__q-${queryIdentity}${extension}`;
    else relativePath = `${relativePath}__q-${queryIdentity}`;
  }
  const normalized = posix.normalize(relativePath);
  if (
    normalized === '..' ||
    normalized.startsWith('../') ||
    posix.isAbsolute(normalized)
  )
    throw new Error(`unsafe local path for ${record.originalUrl}`);
  return `archive/${normalized}`;
}

function unique(values: string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw new Error(`duplicate ${label}: ${value}`);
    seen.add(value);
  }
}

export function parseGeraldtonCdxExport(input: unknown): GeraldtonCdxRecord[] {
  const rows = z.array(z.array(z.string())).min(2).parse(input);
  const header = rows[0];
  if (
    header.length !== CDX_HEADER.length ||
    header.some((value, index) => value !== CDX_HEADER[index])
  )
    throw new Error(`unexpected CDX header: ${JSON.stringify(header)}`);
  const records = rows.slice(1).map((row, index): GeraldtonCdxRecord => {
    if (row.length !== CDX_HEADER.length)
      throw new Error(`CDX row ${index + 2} has ${row.length} fields`);
    const [timestamp, originalUrl, statusCode, mimeType, digest, length] = row;
    if (!/^\d{14}$/u.test(timestamp))
      throw new Error(`invalid capture timestamp at row ${index + 2}`);
    if (statusCode !== '200') throw new Error(`non-200 CDX row ${index + 2}`);
    if (!/^[A-Z2-7]{32}$/u.test(digest))
      throw new Error(`invalid CDX digest at row ${index + 2}`);
    if (!/^\d+$/u.test(length))
      throw new Error(`invalid CDX length at row ${index + 2}`);
    const record: GeraldtonCdxRecord = {
      timestamp,
      originalUrl,
      statusCode: 200,
      mimeType,
      cdxDigestSha1Base32: digest,
      cdxLength: Number(length),
    };
    localAssetPath(record);
    return record;
  });
  unique(
    records.map((record) => record.originalUrl),
    'original URL',
  );
  unique(records.map(localAssetPath), 'local archive path');
  return records;
}

export function buildGeraldtonArchiveAssets(
  records: GeraldtonCdxRecord[],
): GeraldtonArchiveAsset[] {
  return records
    .map(
      (record): GeraldtonArchiveAsset => ({
        ...record,
        assetId: `wbv-ggw-wayback-${sha256(record.originalUrl).slice(0, 24)}`,
        replayUrl: `https://web.archive.org/web/${record.timestamp}id_/${record.originalUrl}`,
        archiveRelativePath: localAssetPath(record),
        assetKind: assetKind(record.mimeType),
      }),
    )
    .sort((left, right) => left.originalUrl.localeCompare(right.originalUrl));
}

function collapsedText(value: string): string {
  return value
    .replace(/\u00a0/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

export function parseGeraldtonAdoptionList(input: {
  html: string;
  snapshotId: string;
  captureTimestamp: string;
  sourceListUrl: string;
  sourceListPath: string;
  sourceListSha256: string;
}): GeraldtonAdoptionRow[] {
  const $ = load(input.html);
  const rows: GeraldtonAdoptionRow[] = [];
  $('table.thread tr').each((_index, element) => {
    const cells = $(element).find('td.thread');
    if (cells.length !== 3) return;
    const sourceItemHref = $(cells[0]).find('a').first().attr('href');
    if (!sourceItemHref) return;
    const itemUrl = new URL(sourceItemHref, input.sourceListUrl);
    const sourceItemNumber = Number(itemUrl.searchParams.get('nr'));
    const headwordSource = collapsedText($(cells[0]).text());
    const englishSource = collapsedText($(cells[1]).text());
    const categorySource = collapsedText($(cells[2]).text());
    if (!Number.isInteger(sourceItemNumber) || sourceItemNumber <= 0)
      throw new Error(`invalid source item number in ${sourceItemHref}`);
    if (!headwordSource || !englishSource || !categorySource)
      throw new Error(`contentless adoption row ${sourceItemNumber}`);
    rows.push({
      sourceRecordId: `wbv-ggw-${input.captureTimestamp.slice(0, 8)}-${sourceItemNumber
        .toString()
        .padStart(4, '0')}`,
      snapshotId: input.snapshotId,
      captureTimestamp: input.captureTimestamp,
      sourceListUrl: input.sourceListUrl,
      sourceListPath: input.sourceListPath,
      sourceListSha256: input.sourceListSha256,
      sourceItemNumber,
      sourceItemHref,
      headwordSource,
      headwordComparison: normalizeComparison(headwordSource),
      englishSource,
      englishComparison: normalizeComparison(englishSource),
      categorySource,
      categoryComparison: normalizeComparison(categorySource),
      linguisticStatus: 'source_candidate',
      trainingUse: 'not_allowed',
    });
  });
  if (rows.length === 0)
    throw new Error(`no adoption rows found in ${input.snapshotId}`);
  unique(
    rows.map((row) => row.sourceRecordId),
    `${input.snapshotId} source record ID`,
  );
  unique(
    rows.map((row) => String(row.sourceItemNumber)),
    `${input.snapshotId} source item number`,
  );
  return rows;
}

function lexicalTokens(value: string): Set<string> {
  return new Set(
    normalizeComparison(value).match(/[\p{L}\p{M}\p{N}]+/gu) ?? [],
  );
}

function lexicalTokenCount(value: string): number {
  return normalizeComparison(value).split(/\s+/u).filter(Boolean).length;
}

const graphemeSegmenter = new Intl.Segmenter('und', {
  granularity: 'grapheme',
});

function graphemeTrigrams(value: string): Set<string> {
  const graphemes = Array.from(
    graphemeSegmenter.segment(normalizeComparison(value)),
    (segment) => segment.segment,
  );
  if (graphemes.length === 0) return new Set();
  const padded = ['^', '^', ...graphemes, '$', '$'];
  const result = new Set<string>();
  for (let index = 0; index <= padded.length - 3; index += 1)
    result.add(padded.slice(index, index + 3).join(''));
  return result;
}

function jaccard(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 && right.size === 0) return 1;
  if (left.size === 0 || right.size === 0) return 0;
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection += 1;
  return intersection / (left.size + right.size - intersection);
}

export function crosswalkGeraldtonAdoptionRows(
  sourceRows: GeraldtonAdoptionRow[],
  dictionaryInput: unknown,
): GeraldtonCrosswalkRow[] {
  const dictionary = z.array(DictionaryRowSchema).min(1).parse(dictionaryInput);
  const currentByHeadword = new Map<
    string,
    Array<(typeof dictionary)[number] & { sourceOrdinal: number }>
  >();
  dictionary.forEach((row, index) => {
    const key = normalizeComparison(row.Wajarri);
    const candidates = currentByHeadword.get(key) ?? [];
    candidates.push({ ...row, sourceOrdinal: index + 1 });
    currentByHeadword.set(key, candidates);
  });
  const preparedDictionary = dictionary.map((candidate, index) => {
    const sourceOrdinal = index + 1;
    const sourceRecordId = `wbv-src-local-${sourceOrdinal.toString().padStart(6, '0')}`;
    return {
      candidate,
      sourceOrdinal,
      sourceRecordId,
      headwordComparison: normalizeComparison(candidate.Wajarri),
      headwordTrigrams: graphemeTrigrams(candidate.Wajarri),
      englishTokens: lexicalTokens(
        `${candidate.English} ${candidate.description}`,
      ),
    };
  });

  return sourceRows.map((source): GeraldtonCrosswalkRow => {
    const sourceEnglishTokens = lexicalTokens(source.englishSource);
    const sourceHeadwordTrigrams = graphemeTrigrams(source.headwordSource);
    const sourceSurfaceTokenCount = lexicalTokenCount(source.headwordSource);
    const currentCandidates = (
      currentByHeadword.get(source.headwordComparison) ?? []
    ).map((candidate) => {
      const sourceRecordId = `wbv-src-local-${candidate.sourceOrdinal.toString().padStart(6, '0')}`;
      const exactEnglishField = [candidate.English, candidate.description]
        .map(normalizeComparison)
        .includes(source.englishComparison);
      const comparisonText = `${candidate.English} ${candidate.description}`;
      return {
        sourceRecordId,
        sourceOrdinal: candidate.sourceOrdinal,
        entryCandidateId: `${sourceRecordId}-entry-candidate`,
        headwordSource: candidate.Wajarri,
        englishSource: candidate.English,
        descriptionSource: candidate.description,
        exactEnglishField,
        englishTokenJaccard: Number(
          jaccard(sourceEnglishTokens, lexicalTokens(comparisonText)).toFixed(
            6,
          ),
        ),
      };
    });
    const reviewCandidates = preparedDictionary
      .map((prepared) => {
        const headwordTrigramJaccard = jaccard(
          sourceHeadwordTrigrams,
          prepared.headwordTrigrams,
        );
        const englishTokenJaccard = jaccard(
          sourceEnglishTokens,
          prepared.englishTokens,
        );
        return {
          sourceRecordId: prepared.sourceRecordId,
          sourceOrdinal: prepared.sourceOrdinal,
          entryCandidateId: `${prepared.sourceRecordId}-entry-candidate`,
          headwordSource: prepared.candidate.Wajarri,
          englishSource: prepared.candidate.English,
          descriptionSource: prepared.candidate.description,
          exactHeadword:
            source.headwordComparison === prepared.headwordComparison,
          headwordTrigramJaccard: Number(headwordTrigramJaccard.toFixed(6)),
          englishTokenJaccard: Number(englishTokenJaccard.toFixed(6)),
          combinedReviewScore: Number(
            (headwordTrigramJaccard * 0.8 + englishTokenJaccard * 0.2).toFixed(
              6,
            ),
          ),
        };
      })
      .sort(
        (left, right) =>
          Number(right.exactHeadword) - Number(left.exactHeadword) ||
          right.combinedReviewScore - left.combinedReviewScore ||
          right.headwordTrigramJaccard - left.headwordTrigramJaccard ||
          left.sourceRecordId.localeCompare(right.sourceRecordId),
      )
      .slice(0, 5);
    const relationStatus = currentCandidates.some(
      (candidate) => candidate.exactEnglishField,
    )
      ? 'exact_headword_and_english_candidate'
      : currentCandidates.length > 0
        ? 'exact_headword_gloss_review'
        : 'no_exact_headword_review';
    return {
      sourceRecordId: source.sourceRecordId,
      snapshotId: source.snapshotId,
      sourceItemNumber: source.sourceItemNumber,
      headwordSource: source.headwordSource,
      englishSource: source.englishSource,
      categorySource: source.categorySource,
      sourceSurfaceTokenCount,
      sourceUnitKind:
        sourceSurfaceTokenCount === 1
          ? 'single_surface_form'
          : 'multiword_expression',
      currentCandidates,
      reviewCandidates,
      relationStatus,
      automaticMergeAllowed: false,
      trainingUse: 'not_allowed',
    };
  });
}
