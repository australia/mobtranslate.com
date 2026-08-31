import { execFile as execFileCallback } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import {
  access,
  copyFile,
  mkdir,
  readFile,
  rename,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { basename, dirname, join, relative } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import {
  buildWajarriArchiveAssets,
  buildWajarriDictionaryAudioCrosswalk,
  parseWajarriCdxExport,
  sha1Base32,
  type WajarriArchiveAsset,
} from '../lib/research/wajarriWaybackArchive';

type Command = 'inventory' | 'download' | 'probe' | 'audit' | 'all';
type Scope = 'audio' | 'all';

interface CliOptions {
  command: Command;
  scope: Scope;
  concurrency: number;
  requestsPerSecond: number;
  limit: number | null;
}

interface DownloadRecord {
  assetId: string;
  assetKind: WajarriArchiveAsset['assetKind'];
  originalUrl: string;
  replayUrl: string;
  archiveRelativePath: string;
  captureTimestamp: string;
  sourceMimeType: string;
  responseContentType: string | null;
  cdxDigestSha1Base32: string;
  contentSha1Base32: string;
  contentSha256: string;
  fileSizeBytes: number;
  dictionaryReferenceCount: number;
  validationStatus: 'cdx_digest_verified';
}

interface AudioProbeRecord extends DownloadRecord {
  codecName: string;
  durationMs: number;
  durationSeconds: number;
  sampleRate: number;
  channels: number;
  decodeStatus: 'passed';
}

interface FfprobeResult {
  streams?: Array<{
    codec_name?: string;
    sample_rate?: string;
    channels?: number;
  }>;
  format?: { duration?: string };
}

const PROGRAM_ROOT =
  process.env.WAJARRI_PROGRAM_ROOT ??
  '/mnt/donto-data/donto-resources/research/language-programs/wajarri-v1';
const SOURCE_ROOT = join(
  PROGRAM_ROOT,
  'sources/raw/bundiyarra-wajarri-app-wayback-2016',
);
const CDX_PATH = join(SOURCE_ROOT, 'manifests/cdx-all-200-collapsed.json');
const DICTIONARY_PATH = join(
  PROGRAM_ROOT,
  'sources/raw/local-repository-20260722/dictionary.json',
);
const ASSET_INDEX_PATH = join(SOURCE_ROOT, 'manifests/assets.jsonl');
const CROSSWALK_PATH = join(
  SOURCE_ROOT,
  'manifests/dictionary-audio-crosswalk.jsonl',
);
const INVENTORY_REPORT_PATH = join(
  SOURCE_ROOT,
  'reports/inventory-report.json',
);
const DOWNLOAD_MANIFEST_PATH = join(SOURCE_ROOT, 'manifests/downloads.jsonl');
const DOWNLOAD_ERROR_PATH = join(
  SOURCE_ROOT,
  'manifests/download-errors.jsonl',
);
const AUDIO_PROBE_PATH = join(SOURCE_ROOT, 'manifests/audio-probes.jsonl');
const AUDIO_PROBE_ERROR_PATH = join(
  SOURCE_ROOT,
  'manifests/audio-probe-errors.jsonl',
);
const AUDIT_REPORT_PATH = join(SOURCE_ROOT, 'reports/audit-report.json');
const USER_AGENT =
  'MobTranslate-source-archiver/1.0 (+https://mobtranslate.com)';
const execFile = promisify(execFileCallback);

function parsePositiveNumber(value: string | undefined, flag: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0)
    throw new Error(`${flag} must be a positive number`);
  return parsed;
}

function parseOptions(argv: string[]): CliOptions {
  const command = (argv[0] ?? 'all') as Command;
  if (!['inventory', 'download', 'probe', 'audit', 'all'].includes(command))
    throw new Error(`unknown command '${command}'`);
  const options: CliOptions = {
    command,
    scope: 'all',
    concurrency: 6,
    requestsPerSecond: 5,
    limit: null,
  };
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--scope') {
      const scope = argv[++index];
      if (scope !== 'audio' && scope !== 'all')
        throw new Error('--scope must be audio or all');
      options.scope = scope;
    } else if (argument === '--concurrency') {
      options.concurrency = Math.floor(
        parsePositiveNumber(argv[++index], argument),
      );
    } else if (argument === '--requests-per-second') {
      options.requestsPerSecond = parsePositiveNumber(argv[++index], argument);
    } else if (argument === '--limit') {
      options.limit = Math.floor(parsePositiveNumber(argv[++index], argument));
    } else {
      throw new Error(`unknown option '${argument}'`);
    }
  }
  return options;
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function preserveExisting(path: string, bytes: Buffer): Promise<void> {
  const pathWithinSource = relative(SOURCE_ROOT, path);
  if (pathWithinSource.startsWith('..'))
    throw new Error(`refusing to preserve outside source root: ${path}`);
  const historyPath = join(
    SOURCE_ROOT,
    'history',
    dirname(pathWithinSource),
    `${basename(path)}.${new Date().toISOString().replace(/[:.]/gu, '-')}.${sha256(bytes).slice(0, 12)}`,
  );
  await mkdir(dirname(historyPath), { recursive: true });
  await copyFile(path, historyPath);
}

async function atomicWrite(
  path: string,
  contents: Buffer | string,
): Promise<void> {
  const next = Buffer.isBuffer(contents) ? contents : Buffer.from(contents);
  await mkdir(dirname(path), { recursive: true });
  if (await pathExists(path)) {
    const current = await readFile(path);
    if (current.equals(next)) return;
    await preserveExisting(path, current);
  }
  const temporaryPath = `${path}.part-${process.pid}`;
  await writeFile(temporaryPath, next, { flag: 'wx' });
  await rename(temporaryPath, path);
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await atomicWrite(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeJsonl(path: string, rows: unknown[]): Promise<void> {
  await atomicWrite(
    path,
    rows.length > 0
      ? `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`
      : '',
  );
}

async function readJsonl<T>(path: string): Promise<T[]> {
  return (await readFile(path, 'utf8'))
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

class RateLimiter {
  private nextStartAt = 0;
  private queue: Promise<void> = Promise.resolve();
  private readonly requestsPerSecond: number;

  constructor(requestsPerSecond: number) {
    this.requestsPerSecond = requestsPerSecond;
  }

  async wait(): Promise<void> {
    let release = () => undefined;
    const predecessor = this.queue;
    this.queue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await predecessor;
    const intervalMs = 1000 / this.requestsPerSecond;
    const waitMs = Math.max(0, this.nextStartAt - Date.now());
    if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
    this.nextStartAt = Date.now() + intervalMs;
    release();
  }
}

async function fetchWithRetry(
  url: string,
  limiter: RateLimiter,
  attempts = 6,
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await limiter.wait();
    try {
      const response = await fetch(url, {
        headers: { accept: '*/*', 'user-agent': USER_AGENT },
        redirect: 'follow',
        signal: AbortSignal.timeout(60_000),
      });
      if (response.ok) return response;
      lastError = new Error(`${response.status} ${response.statusText}`);
      if (response.status !== 429 && response.status < 500) throw lastError;
      const retryAfter = Number(response.headers.get('retry-after'));
      const delayMs = Number.isFinite(retryAfter)
        ? Math.min(retryAfter * 1000, 60_000)
        : Math.min(1000 * 2 ** attempt, 30_000);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    } catch (error) {
      lastError = error;
      if (attempt + 1 < attempts)
        await new Promise((resolve) =>
          setTimeout(
            resolve,
            Math.min(1000 * 2 ** attempt, 30_000) +
              Math.floor(Math.random() * 250),
          ),
        );
    }
  }
  throw new Error(`failed to fetch ${url} after ${attempts} attempts`, {
    cause: lastError,
  });
}

async function runWorkers<T>(
  values: T[],
  concurrency: number,
  worker: (_value: T, _index: number) => Promise<void>,
): Promise<void> {
  let nextIndex = 0;
  async function run(): Promise<void> {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= values.length) return;
      await worker(values[index], index);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, () => run()),
  );
}

function progress(
  label: string,
  completed: number,
  total: number,
  startedAt: number,
  note: string,
): void {
  const elapsedSeconds = Math.max((Date.now() - startedAt) / 1000, 0.001);
  const rate = completed / elapsedSeconds;
  const etaMinutes = rate > 0 ? (total - completed) / rate / 60 : 0;
  console.log(
    `${label}: ${completed}/${total} (${((completed / Math.max(total, 1)) * 100).toFixed(1)}%), ` +
      `${rate.toFixed(2)}/s, ETA ${etaMinutes.toFixed(1)}m, ${note}`,
  );
}

async function inventory(): Promise<{
  assets: WajarriArchiveAsset[];
  missingPointers: string[];
  extraArchiveAudioPointers: string[];
}> {
  const [cdxBytes, dictionaryBytes] = await Promise.all([
    readFile(CDX_PATH),
    readFile(DICTIONARY_PATH),
  ]);
  const records = parseWajarriCdxExport(
    JSON.parse(cdxBytes.toString('utf8')) as unknown,
  );
  const assets = buildWajarriArchiveAssets(records);
  const crosswalk = buildWajarriDictionaryAudioCrosswalk(
    assets,
    JSON.parse(dictionaryBytes.toString('utf8')) as unknown,
  );
  await writeJsonl(ASSET_INDEX_PATH, crosswalk.assets);
  await writeJsonl(CROSSWALK_PATH, crosswalk.rows);

  const countsByKind: Record<string, number> = {};
  for (const asset of crosswalk.assets)
    countsByKind[asset.assetKind] = (countsByKind[asset.assetKind] ?? 0) + 1;
  await writeJson(INVENTORY_REPORT_PATH, {
    schemaVersion: 1,
    archiveId: 'wbv-bundiyarra-wajarri-app-wayback-2016-v0.1.0',
    cdxPath: relative(PROGRAM_ROOT, CDX_PATH),
    cdxSha256: sha256(cdxBytes),
    dictionaryPath: relative(PROGRAM_ROOT, DICTIONARY_PATH),
    dictionarySha256: sha256(dictionaryBytes),
    assetCount: crosswalk.assets.length,
    countsByKind,
    cdxDeclaredBytes: crosswalk.assets.reduce(
      (sum, asset) => sum + asset.cdxLength,
      0,
    ),
    dictionaryRowCount:
      crosswalk.rows.length + crosswalk.missingPointers.length,
    resolvedDictionaryAudioCount: crosswalk.rows.length,
    missingDictionaryAudioCount: crosswalk.missingPointers.length,
    missingDictionaryAudioPointers: crosswalk.missingPointers,
    extraArchiveAudioCount: crosswalk.extraArchiveAudioPointers.length,
    extraArchiveAudioPointers: crosswalk.extraArchiveAudioPointers,
    sourceStatus: 'archived_source_inventory',
    linguisticStatus: 'candidate',
    trainingUse: 'not_allowed',
  });
  console.log(
    `Inventory: ${crosswalk.assets.length} assets; ${crosswalk.rows.length} dictionary audio pointers resolved; ` +
      `${crosswalk.missingPointers.length} missing; ${crosswalk.extraArchiveAudioPointers.length} extra audio files.`,
  );
  return {
    assets: crosswalk.assets,
    missingPointers: crosswalk.missingPointers,
    extraArchiveAudioPointers: crosswalk.extraArchiveAudioPointers,
  };
}

async function downloadAsset(
  asset: WajarriArchiveAsset,
  limiter: RateLimiter,
): Promise<{ record: DownloadRecord; fetched: boolean }> {
  const absolutePath = join(SOURCE_ROOT, asset.archiveRelativePath);
  let bytes: Buffer;
  let responseContentType: string | null = null;
  let fetched = false;
  if (await pathExists(absolutePath)) {
    bytes = await readFile(absolutePath);
  } else {
    const response = await fetchWithRetry(asset.replayUrl, limiter);
    if (!response.body)
      throw new Error(`empty response body for ${asset.replayUrl}`);
    await mkdir(dirname(absolutePath), { recursive: true });
    const temporaryPath = `${absolutePath}.part-${process.pid}`;
    try {
      await pipeline(
        Readable.fromWeb(response.body as never),
        createWriteStream(temporaryPath, { flags: 'wx' }),
      );
      bytes = await readFile(temporaryPath);
      if (bytes.length === 0)
        throw new Error(`empty downloaded file for ${asset.replayUrl}`);
      const digest = sha1Base32(bytes);
      if (digest !== asset.cdxDigestSha1Base32)
        throw new Error(
          `CDX digest mismatch for ${asset.originalUrl}: expected ${asset.cdxDigestSha1Base32}, got ${digest}`,
        );
      await rename(temporaryPath, absolutePath);
      fetched = true;
      responseContentType = response.headers.get('content-type');
    } catch (error) {
      await unlink(temporaryPath).catch(() => undefined);
      throw error;
    }
  }

  const contentSha1Base32 = sha1Base32(bytes);
  if (contentSha1Base32 !== asset.cdxDigestSha1Base32)
    throw new Error(
      `existing CDX digest mismatch for ${asset.originalUrl}: expected ${asset.cdxDigestSha1Base32}, got ${contentSha1Base32}`,
    );
  return {
    fetched,
    record: {
      assetId: asset.assetId,
      assetKind: asset.assetKind,
      originalUrl: asset.originalUrl,
      replayUrl: asset.replayUrl,
      archiveRelativePath: asset.archiveRelativePath,
      captureTimestamp: asset.timestamp,
      sourceMimeType: asset.mimeType,
      responseContentType,
      cdxDigestSha1Base32: asset.cdxDigestSha1Base32,
      contentSha1Base32,
      contentSha256: sha256(bytes),
      fileSizeBytes: bytes.length,
      dictionaryReferenceCount: asset.dictionaryReferenceCount,
      validationStatus: 'cdx_digest_verified',
    },
  };
}

async function download(
  options: CliOptions,
  suppliedAssets?: WajarriArchiveAsset[],
): Promise<DownloadRecord[]> {
  const allAssets = suppliedAssets ?? (await inventory()).assets;
  const scoped =
    options.scope === 'audio'
      ? allAssets.filter((asset) => asset.assetKind === 'audio')
      : allAssets;
  const selected =
    options.limit === null ? scoped : scoped.slice(0, options.limit);
  const records: Array<DownloadRecord | undefined> = new Array(selected.length);
  const errors: Array<Record<string, unknown>> = [];
  const limiter = new RateLimiter(options.requestsPerSecond);
  const startedAt = Date.now();
  let completed = 0;
  let fetched = 0;
  let resumed = 0;

  await runWorkers(selected, options.concurrency, async (asset, index) => {
    try {
      const result = await downloadAsset(asset, limiter);
      records[index] = result.record;
      if (result.fetched) fetched += 1;
      else resumed += 1;
    } catch (error) {
      errors.push({
        assetId: asset.assetId,
        originalUrl: asset.originalUrl,
        replayUrl: asset.replayUrl,
        archiveRelativePath: asset.archiveRelativePath,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      completed += 1;
      if (
        completed === 1 ||
        completed % 100 === 0 ||
        completed === selected.length
      )
        progress(
          'Assets',
          completed,
          selected.length,
          startedAt,
          `fetched ${fetched}, resumed ${resumed}, errors ${errors.length}`,
        );
    }
  });

  const downloads = records.filter(
    (record): record is DownloadRecord => record !== undefined,
  );
  await writeJsonl(DOWNLOAD_MANIFEST_PATH, downloads);
  await writeJsonl(DOWNLOAD_ERROR_PATH, errors);
  console.log(
    `Downloads: ${downloads.length} CDX-verified; ${errors.length} failed.`,
  );
  if (errors.length > 0) process.exitCode = 1;
  return downloads;
}

async function probeAudioFile(
  downloadRecord: DownloadRecord,
): Promise<AudioProbeRecord> {
  const absolutePath = join(SOURCE_ROOT, downloadRecord.archiveRelativePath);
  const { stdout } = await execFile(
    'ffprobe',
    [
      '-v',
      'error',
      '-select_streams',
      'a:0',
      '-show_entries',
      'stream=codec_name,sample_rate,channels:format=duration',
      '-of',
      'json',
      absolutePath,
    ],
    { encoding: 'utf8', timeout: 30_000, maxBuffer: 1024 * 1024 },
  );
  const result = JSON.parse(stdout) as FfprobeResult;
  const stream = result.streams?.[0];
  const durationSeconds = Number(result.format?.duration);
  const sampleRate = Number(stream?.sample_rate);
  const channels = Number(stream?.channels);
  if (
    stream?.codec_name !== 'mp3' ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0 ||
    !Number.isInteger(sampleRate) ||
    sampleRate <= 0 ||
    !Number.isInteger(channels) ||
    channels <= 0
  ) {
    throw new Error(`invalid ffprobe metadata: ${JSON.stringify(result)}`);
  }
  await execFile(
    'ffmpeg',
    ['-nostdin', '-v', 'error', '-i', absolutePath, '-f', 'null', '-'],
    {
      encoding: 'utf8',
      timeout: 60_000,
      maxBuffer: 1024 * 1024,
    },
  );
  return {
    ...downloadRecord,
    codecName: stream.codec_name,
    durationMs: Math.round(durationSeconds * 1000),
    durationSeconds,
    sampleRate,
    channels,
    decodeStatus: 'passed',
  };
}

async function probe(
  options: CliOptions,
  suppliedDownloads?: DownloadRecord[],
): Promise<AudioProbeRecord[]> {
  const downloads =
    suppliedDownloads ??
    (await readJsonl<DownloadRecord>(DOWNLOAD_MANIFEST_PATH));
  const audio = downloads.filter((record) => record.assetKind === 'audio');
  const selected =
    options.limit === null ? audio : audio.slice(0, options.limit);
  const probes: Array<AudioProbeRecord | undefined> = new Array(
    selected.length,
  );
  const errors: Array<Record<string, unknown>> = [];
  const startedAt = Date.now();
  let completed = 0;
  await runWorkers(
    selected,
    options.concurrency,
    async (downloadRecord, index) => {
      try {
        probes[index] = await probeAudioFile(downloadRecord);
      } catch (error) {
        errors.push({
          assetId: downloadRecord.assetId,
          archiveRelativePath: downloadRecord.archiveRelativePath,
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        completed += 1;
        if (
          completed === 1 ||
          completed % 100 === 0 ||
          completed === selected.length
        )
          progress(
            'Audio probes',
            completed,
            selected.length,
            startedAt,
            `errors ${errors.length}`,
          );
      }
    },
  );
  const successful = probes.filter(
    (record): record is AudioProbeRecord => record !== undefined,
  );
  await writeJsonl(AUDIO_PROBE_PATH, successful);
  await writeJsonl(AUDIO_PROBE_ERROR_PATH, errors);
  console.log(
    `Audio probes: ${successful.length} decoded; ${errors.length} failed.`,
  );
  if (errors.length > 0) process.exitCode = 1;
  return successful;
}

function counts(values: Array<string | number>): Record<string, number> {
  const result: Record<string, number> = {};
  for (const value of values)
    result[String(value)] = (result[String(value)] ?? 0) + 1;
  return result;
}

async function audit(): Promise<Record<string, unknown>> {
  const [
    inventoryReport,
    assets,
    crosswalk,
    downloads,
    probes,
    downloadErrors,
    probeErrors,
  ] = await Promise.all([
    readFile(INVENTORY_REPORT_PATH, 'utf8').then(
      (text) => JSON.parse(text) as Record<string, unknown>,
    ),
    readJsonl<WajarriArchiveAsset>(ASSET_INDEX_PATH),
    readJsonl<Record<string, unknown>>(CROSSWALK_PATH),
    pathExists(DOWNLOAD_MANIFEST_PATH).then((exists) =>
      exists ? readJsonl<DownloadRecord>(DOWNLOAD_MANIFEST_PATH) : [],
    ),
    pathExists(AUDIO_PROBE_PATH).then((exists) =>
      exists ? readJsonl<AudioProbeRecord>(AUDIO_PROBE_PATH) : [],
    ),
    pathExists(DOWNLOAD_ERROR_PATH).then((exists) =>
      exists ? readJsonl<Record<string, unknown>>(DOWNLOAD_ERROR_PATH) : [],
    ),
    pathExists(AUDIO_PROBE_ERROR_PATH).then((exists) =>
      exists ? readJsonl<Record<string, unknown>>(AUDIO_PROBE_ERROR_PATH) : [],
    ),
  ]);

  const hashGroups = new Map<string, DownloadRecord[]>();
  for (const record of downloads) {
    const group = hashGroups.get(record.contentSha256) ?? [];
    group.push(record);
    hashGroups.set(record.contentSha256, group);
  }
  const duplicateContentGroups = [...hashGroups.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([contentSha256, group]) => ({
      contentSha256,
      count: group.length,
      assets: group.map((record) => ({
        assetId: record.assetId,
        archiveRelativePath: record.archiveRelativePath,
        dictionaryReferenceCount: record.dictionaryReferenceCount,
      })),
    }))
    .sort(
      (left, right) =>
        right.count - left.count ||
        left.contentSha256.localeCompare(right.contentSha256),
    );
  const dictionaryAudioDownloads = downloads.filter(
    (record) =>
      record.assetKind === 'audio' && record.dictionaryReferenceCount > 0,
  );
  const dictionaryAudioProbes = probes.filter(
    (record) => record.dictionaryReferenceCount > 0,
  );
  const report = {
    schemaVersion: 1,
    archiveId: 'wbv-bundiyarra-wajarri-app-wayback-2016-v0.1.0',
    inventory: inventoryReport,
    assetCount: assets.length,
    dictionaryCrosswalkCount: crosswalk.length,
    downloadedAssetCount: downloads.length,
    downloadedBytes: downloads.reduce(
      (sum, record) => sum + record.fileSizeBytes,
      0,
    ),
    downloadCountByKind: counts(downloads.map((record) => record.assetKind)),
    cdxDigestVerifiedCount: downloads.filter(
      (record) => record.validationStatus === 'cdx_digest_verified',
    ).length,
    downloadErrorCount: downloadErrors.length,
    audioProbeCount: probes.length,
    audioProbeErrorCount: probeErrors.length,
    audioDurationSeconds: probes.reduce(
      (sum, record) => sum + record.durationSeconds,
      0,
    ),
    audioSampleRates: counts(probes.map((record) => record.sampleRate)),
    audioChannels: counts(probes.map((record) => record.channels)),
    dictionaryAudioDownloadCount: dictionaryAudioDownloads.length,
    dictionaryAudioProbeCount: dictionaryAudioProbes.length,
    duplicateContentGroupCount: duplicateContentGroups.length,
    duplicateContentGroups,
    completeArchiveDownload:
      downloads.length === assets.length &&
      downloadErrors.length === 0 &&
      downloads.every(
        (record) => record.validationStatus === 'cdx_digest_verified',
      ),
    completeDictionaryAudioRecovery:
      dictionaryAudioDownloads.length === crosswalk.length &&
      dictionaryAudioProbes.length === crosswalk.length &&
      probeErrors.length === 0,
    linguisticStatus: 'candidate_media_evidence',
    trainingUse: 'not_allowed',
  };
  await writeJson(AUDIT_REPORT_PATH, report);
  console.log(
    `Audit: ${downloads.length}/${assets.length} assets; ${probes.length} audio decodes; ` +
      `${dictionaryAudioProbes.length}/${crosswalk.length} dictionary recordings verified.`,
  );
  return report;
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  if (options.command === 'inventory') {
    await inventory();
    return;
  }
  if (options.command === 'download') {
    await download(options);
    return;
  }
  if (options.command === 'probe') {
    await probe(options);
    return;
  }
  if (options.command === 'audit') {
    await audit();
    return;
  }
  const result = await inventory();
  if (result.missingPointers.length > 0)
    throw new Error(
      `${result.missingPointers.length} dictionary audio pointers are absent from the archive`,
    );
  const downloads = await download(options, result.assets);
  const probes = await probe(options, downloads);
  await audit();
  if (
    downloads.length !== result.assets.length ||
    probes.length !==
      result.assets.filter((asset) => asset.assetKind === 'audio').length
  )
    throw new Error('archive acquisition did not complete without errors');
}

main().catch((error) => {
  console.error(
    error instanceof Error ? (error.stack ?? error.message) : String(error),
  );
  process.exitCode = 1;
});
