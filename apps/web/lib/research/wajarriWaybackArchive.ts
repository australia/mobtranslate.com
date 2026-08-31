import { createHash } from 'node:crypto';
import { basename, posix } from 'node:path';
import { z } from 'zod';

const CDX_HEADER = [
  'timestamp',
  'original',
  'statuscode',
  'mimetype',
  'digest',
  'length',
] as const;

const TimestampSchema = z.string().regex(/^\d{14}$/u);
const CdxDigestSchema = z.string().regex(/^[A-Z2-7]{32}$/u);
const PositiveIntegerStringSchema = z.string().regex(/^\d+$/u);
const DictionaryRowSchema = z
  .object({
    Wajarri: z.string().min(1),
    English: z.string().min(1),
    description: z.string(),
    sound: z.string().regex(/^Track\d+\.mp3$/u),
    image: z.string().min(1),
  })
  .passthrough();

export type WajarriArchiveAssetKind =
  | 'audio'
  | 'html'
  | 'image'
  | 'javascript'
  | 'json'
  | 'stylesheet'
  | 'other';

export interface WajarriCdxRecord {
  timestamp: string;
  originalUrl: string;
  statusCode: 200;
  mimeType: string;
  cdxDigestSha1Base32: string;
  cdxLength: number;
}

export interface WajarriArchiveAsset extends WajarriCdxRecord {
  assetId: string;
  assetKind: WajarriArchiveAssetKind;
  replayUrl: string;
  archiveRelativePath: string;
  dictionaryReferenceCount: number;
}

export interface WajarriDictionaryAudioMapRow {
  sourceRecordId: string;
  sourceOrdinal: number;
  entryCandidateId: string;
  mediaLinkId: string;
  headword: string;
  english: string;
  description: string;
  sourcePointer: string;
  assetId: string;
  originalUrl: string;
  replayUrl: string;
  archiveRelativePath: string;
  captureTimestamp: string;
  cdxDigestSha1Base32: string;
  resolutionStatus: 'wayback_capture_identified';
  linguisticStatus: 'candidate';
  trainingUse: 'not_allowed';
}

export interface WajarriDictionaryAudioCrosswalk {
  assets: WajarriArchiveAsset[];
  rows: WajarriDictionaryAudioMapRow[];
  missingPointers: string[];
  extraArchiveAudioPointers: string[];
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function classifyAsset(mimeType: string): WajarriArchiveAssetKind {
  if (mimeType === 'audio/mpeg') return 'audio';
  if (mimeType === 'text/html') return 'html';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType === 'application/javascript') return 'javascript';
  if (mimeType === 'application/json') return 'json';
  if (mimeType === 'text/css') return 'stylesheet';
  return 'other';
}

function archivePath(originalUrl: string): string {
  const parsed = new URL(originalUrl);
  if (
    parsed.protocol !== 'http:' ||
    parsed.hostname !== 'www.bundiyarra.com.au' ||
    (parsed.port !== '' && parsed.port !== '80')
  ) {
    throw new Error(`unexpected Wajarri app origin: ${originalUrl}`);
  }
  if (parsed.search || parsed.hash)
    throw new Error(
      `query strings and fragments require an explicit archive policy: ${originalUrl}`,
    );

  const prefix = '/wajarriApp';
  if (parsed.pathname !== prefix && !parsed.pathname.startsWith(`${prefix}/`))
    throw new Error(`URL is outside /wajarriApp: ${originalUrl}`);

  let relativePath = parsed.pathname.slice(prefix.length).replace(/^\/+/, '');
  if (relativePath === '' || relativePath.endsWith('/'))
    relativePath += 'index.html';
  const normalized = posix.normalize(relativePath);
  if (
    normalized === '.' ||
    normalized === '..' ||
    normalized.startsWith('../') ||
    posix.isAbsolute(normalized)
  ) {
    throw new Error(`unsafe archive path derived from ${originalUrl}`);
  }
  return `archive/${normalized}`;
}

function replayUrl(record: WajarriCdxRecord): string {
  return `https://web.archive.org/web/${record.timestamp}id_/${record.originalUrl}`;
}

function assertUnique(values: string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw new Error(`duplicate ${label}: ${value}`);
    seen.add(value);
  }
}

export function parseWajarriCdxExport(input: unknown): WajarriCdxRecord[] {
  const rows = z.array(z.array(z.string())).min(2).parse(input);
  const header = rows[0];
  if (
    header.length !== CDX_HEADER.length ||
    header.some((value, index) => value !== CDX_HEADER[index])
  ) {
    throw new Error(`unexpected CDX header: ${JSON.stringify(header)}`);
  }

  const records = rows.slice(1).map((row, index): WajarriCdxRecord => {
    if (row.length !== CDX_HEADER.length)
      throw new Error(
        `CDX row ${index + 2} has ${row.length} fields; expected ${CDX_HEADER.length}`,
      );
    const [timestamp, originalUrl, statusCode, mimeType, digest, length] = row;
    TimestampSchema.parse(timestamp);
    CdxDigestSchema.parse(digest);
    PositiveIntegerStringSchema.parse(length);
    if (statusCode !== '200')
      throw new Error(`CDX row ${index + 2} is not HTTP 200`);
    if (!mimeType) throw new Error(`CDX row ${index + 2} has no MIME type`);
    archivePath(originalUrl);
    return {
      timestamp,
      originalUrl,
      statusCode: 200,
      mimeType,
      cdxDigestSha1Base32: digest,
      cdxLength: Number(length),
    };
  });

  assertUnique(
    records.map((record) => record.originalUrl),
    'CDX original URL',
  );
  assertUnique(
    records.map((record) => archivePath(record.originalUrl)),
    'local archive path',
  );
  return records;
}

export function buildWajarriArchiveAssets(
  records: WajarriCdxRecord[],
): WajarriArchiveAsset[] {
  return records
    .map(
      (record): WajarriArchiveAsset => ({
        ...record,
        assetId: `wbv-app-wayback-${sha256(record.originalUrl).slice(0, 24)}`,
        assetKind: classifyAsset(record.mimeType),
        replayUrl: replayUrl(record),
        archiveRelativePath: archivePath(record.originalUrl),
        dictionaryReferenceCount: 0,
      }),
    )
    .sort((left, right) => left.originalUrl.localeCompare(right.originalUrl));
}

export function buildWajarriDictionaryAudioCrosswalk(
  assets: WajarriArchiveAsset[],
  dictionaryInput: unknown,
): WajarriDictionaryAudioCrosswalk {
  const dictionary = z.array(DictionaryRowSchema).min(1).parse(dictionaryInput);
  const audioByPointer = new Map<string, WajarriArchiveAsset>();
  for (const asset of assets.filter(
    (candidate) => candidate.assetKind === 'audio',
  )) {
    const pointer = basename(new URL(asset.originalUrl).pathname);
    if (audioByPointer.has(pointer))
      throw new Error(`duplicate archive audio pointer: ${pointer}`);
    audioByPointer.set(pointer, asset);
  }

  assertUnique(
    dictionary.map((row) => row.sound),
    'dictionary sound pointer',
  );

  const rows: WajarriDictionaryAudioMapRow[] = [];
  const missingPointers: string[] = [];
  const referenceCounts = new Map<string, number>();
  dictionary.forEach((row, index) => {
    const sourceOrdinal = index + 1;
    const asset = audioByPointer.get(row.sound);
    if (!asset) {
      missingPointers.push(row.sound);
      return;
    }
    referenceCounts.set(
      asset.assetId,
      (referenceCounts.get(asset.assetId) ?? 0) + 1,
    );
    const sourceRecordId = `wbv-src-local-${sourceOrdinal.toString().padStart(6, '0')}`;
    rows.push({
      sourceRecordId,
      sourceOrdinal,
      entryCandidateId: `${sourceRecordId}-entry-candidate`,
      mediaLinkId: `${sourceRecordId}-media-audio`,
      headword: row.Wajarri,
      english: row.English,
      description: row.description,
      sourcePointer: row.sound,
      assetId: asset.assetId,
      originalUrl: asset.originalUrl,
      replayUrl: asset.replayUrl,
      archiveRelativePath: asset.archiveRelativePath,
      captureTimestamp: asset.timestamp,
      cdxDigestSha1Base32: asset.cdxDigestSha1Base32,
      resolutionStatus: 'wayback_capture_identified',
      linguisticStatus: 'candidate',
      trainingUse: 'not_allowed',
    });
  });

  const referencedPointers = new Set(dictionary.map((row) => row.sound));
  const extraArchiveAudioPointers = [...audioByPointer.keys()]
    .filter((pointer) => !referencedPointers.has(pointer))
    .sort((left, right) => left.localeCompare(right));
  const annotatedAssets = assets.map((asset) => ({
    ...asset,
    dictionaryReferenceCount: referenceCounts.get(asset.assetId) ?? 0,
  }));
  return {
    assets: annotatedAssets,
    rows,
    missingPointers: missingPointers.sort((left, right) =>
      left.localeCompare(right),
    ),
    extraArchiveAudioPointers,
  };
}

export function sha1Base32(bytes: Buffer): string {
  const digest = createHash('sha1').update(bytes).digest();
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let accumulator = 0;
  let bitCount = 0;
  let output = '';
  for (const byte of digest) {
    accumulator = (accumulator << 8) | byte;
    bitCount += 8;
    while (bitCount >= 5) {
      bitCount -= 5;
      output += alphabet[(accumulator >>> bitCount) & 31];
      accumulator &= (1 << bitCount) - 1;
    }
  }
  if (bitCount > 0) output += alphabet[(accumulator << (5 - bitCount)) & 31];
  return output;
}
