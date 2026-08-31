import { execFile as execFileCallback } from 'node:child_process';
import { createHash } from 'node:crypto';
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
import { promisify } from 'node:util';
import {
  buildGeraldtonArchiveAssets,
  crosswalkGeraldtonAdoptionRows,
  parseGeraldtonAdoptionList,
  parseGeraldtonCdxExport,
  type GeraldtonAdoptionRow,
  type GeraldtonArchiveAsset,
  type GeraldtonCrosswalkRow,
} from '../lib/research/geraldtonGoesWajarri';
import { sha1Base32 } from '../lib/research/wajarriWaybackArchive';

type Command = 'inventory' | 'download' | 'extract' | 'audit' | 'all';

interface Options {
  command: Command;
  concurrency: number;
  requestsPerSecond: number;
  limit: number | null;
}

interface DownloadRecord {
  assetId: string;
  assetKind: GeraldtonArchiveAsset['assetKind'];
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
  validationStatus: 'cdx_digest_verified';
}

const PROGRAM_ROOT =
  process.env.WAJARRI_PROGRAM_ROOT ??
  '/mnt/donto-data/donto-resources/research/language-programs/wajarri-v1';
const SOURCE_ROOT = join(
  PROGRAM_ROOT,
  'sources/raw/geraldton-goes-wajarri-wayback',
);
const CDX_PATH = join(SOURCE_ROOT, 'manifests/cdx-all-200-collapsed.json');
const DICTIONARY_PATH = join(
  PROGRAM_ROOT,
  'sources/raw/local-repository-20260722/dictionary.json',
);
const ASSETS_PATH = join(SOURCE_ROOT, 'manifests/assets.jsonl');
const DOWNLOADS_PATH = join(SOURCE_ROOT, 'manifests/downloads.jsonl');
const DOWNLOAD_ERRORS_PATH = join(
  SOURCE_ROOT,
  'manifests/download-errors.jsonl',
);
const LIST_2015_PATH = join(
  SOURCE_ROOT,
  'inventories/adoption-list-2015.jsonl',
);
const LIST_2021_PATH = join(
  SOURCE_ROOT,
  'inventories/adoption-list-2021.jsonl',
);
const CROSSWALK_2015_PATH = join(
  SOURCE_ROOT,
  'inventories/dictionary-crosswalk-2015.jsonl',
);
const CROSSWALK_2021_PATH = join(
  SOURCE_ROOT,
  'inventories/dictionary-crosswalk-2021.jsonl',
);
const INVENTORY_REPORT_PATH = join(
  SOURCE_ROOT,
  'reports/archive-inventory.json',
);
const EVIDENCE_REPORT_PATH = join(
  SOURCE_ROOT,
  'reports/lexical-evidence-report.json',
);
const AUDIT_REPORT_PATH = join(SOURCE_ROOT, 'reports/audit-report.json');
const USER_AGENT =
  'MobTranslate-source-archiver/1.0 (+https://mobtranslate.com)';
const LIST_2015_URL = 'http://geraldton-goes-wajarri.org/list/wajarri_list.php';
const LIST_2021_URL =
  'http://geraldton-goes-wajarri.org/list/wajarri_list.php?skip=';
const execFile = promisify(execFileCallback);

function positive(value: string | undefined, flag: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0)
    throw new Error(`${flag} must be positive`);
  return parsed;
}

function options(argv: string[]): Options {
  const command = (argv[0] ?? 'all') as Command;
  if (!['inventory', 'download', 'extract', 'audit', 'all'].includes(command))
    throw new Error(`unknown command '${command}'`);
  const result: Options = {
    command,
    concurrency: 6,
    requestsPerSecond: 5,
    limit: null,
  };
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--concurrency')
      result.concurrency = Math.floor(positive(argv[++index], argument));
    else if (argument === '--requests-per-second')
      result.requestsPerSecond = positive(argv[++index], argument);
    else if (argument === '--limit')
      result.limit = Math.floor(positive(argv[++index], argument));
    else throw new Error(`unknown option '${argument}'`);
  }
  return result;
}

function sha256(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function atomicWrite(
  path: string,
  content: Buffer | string,
): Promise<void> {
  const next = Buffer.isBuffer(content) ? content : Buffer.from(content);
  await mkdir(dirname(path), { recursive: true });
  if (await exists(path)) {
    const current = await readFile(path);
    if (current.equals(next)) return;
    const relativePath = relative(SOURCE_ROOT, path);
    if (relativePath.startsWith('..'))
      throw new Error(`path outside source root: ${path}`);
    const historyPath = join(
      SOURCE_ROOT,
      'history',
      dirname(relativePath),
      `${basename(path)}.${new Date().toISOString().replace(/[:.]/gu, '-')}.${sha256(current).slice(0, 12)}`,
    );
    await mkdir(dirname(historyPath), { recursive: true });
    await copyFile(path, historyPath);
  }
  const temporary = `${path}.part-${process.pid}`;
  await writeFile(temporary, next, { flag: 'wx' });
  await rename(temporary, path);
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await atomicWrite(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeJsonl(path: string, rows: unknown[]): Promise<void> {
  await atomicWrite(
    path,
    rows.length ? `${rows.map((row) => JSON.stringify(row)).join('\n')}\n` : '',
  );
}

async function readJsonl<T>(path: string): Promise<T[]> {
  return (await readFile(path, 'utf8'))
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

class RateLimiter {
  private nextAt = 0;
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly rate: number) {}

  async wait(): Promise<void> {
    let release = () => undefined;
    const predecessor = this.queue;
    this.queue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await predecessor;
    const waitMs = Math.max(0, this.nextAt - Date.now());
    if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
    this.nextAt = Date.now() + 1000 / this.rate;
    release();
  }
}

async function fetchRetry(
  url: string,
  limiter: RateLimiter,
): Promise<Response> {
  let cause: unknown;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await limiter.wait();
    try {
      const response = await fetch(url, {
        headers: { accept: '*/*', 'user-agent': USER_AGENT },
        redirect: 'follow',
        signal: AbortSignal.timeout(60_000),
      });
      if (response.ok) return response;
      cause = new Error(`${response.status} ${response.statusText}`);
      if (response.status !== 429 && response.status < 500) throw cause;
    } catch (error) {
      cause = error;
    }
    await new Promise((resolve) =>
      setTimeout(
        resolve,
        Math.min(1000 * 2 ** attempt, 30_000) + Math.floor(Math.random() * 250),
      ),
    );
  }
  throw new Error(`failed to fetch ${url}`, { cause });
}

async function workers<T>(
  values: T[],
  concurrency: number,
  worker: (_value: T, _index: number) => Promise<void>,
): Promise<void> {
  let next = 0;
  async function run(): Promise<void> {
    while (next < values.length) {
      const index = next;
      next += 1;
      await worker(values[index], index);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(values.length, concurrency) }, () => run()),
  );
}

async function inventory(): Promise<GeraldtonArchiveAsset[]> {
  const cdxBytes = await readFile(CDX_PATH);
  const assets = buildGeraldtonArchiveAssets(
    parseGeraldtonCdxExport(JSON.parse(cdxBytes.toString('utf8')) as unknown),
  );
  await writeJsonl(ASSETS_PATH, assets);
  const counts: Record<string, number> = {};
  for (const asset of assets)
    counts[asset.assetKind] = (counts[asset.assetKind] ?? 0) + 1;
  await writeJson(INVENTORY_REPORT_PATH, {
    schemaVersion: 1,
    archiveId: 'wbv-geraldton-goes-wajarri-wayback-v0.1.0',
    cdxPath: relative(PROGRAM_ROOT, CDX_PATH),
    cdxSha256: sha256(cdxBytes),
    assetCount: assets.length,
    countsByKind: counts,
    cdxDeclaredBytes: assets.reduce((sum, asset) => sum + asset.cdxLength, 0),
    linguisticStatus: 'source_inventory',
    trainingUse: 'not_allowed',
  });
  console.log(`Inventory: ${assets.length} assets.`);
  return assets;
}

async function downloadAsset(
  asset: GeraldtonArchiveAsset,
  limiter: RateLimiter,
): Promise<{ record: DownloadRecord; fetched: boolean }> {
  const path = join(SOURCE_ROOT, asset.archiveRelativePath);
  let bytes: Buffer;
  let responseContentType: string | null = null;
  let fetched = false;
  if (await exists(path)) bytes = await readFile(path);
  else {
    const response = await fetchRetry(asset.replayUrl, limiter);
    bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length)
      throw new Error(`empty response for ${asset.originalUrl}`);
    if (sha1Base32(bytes) !== asset.cdxDigestSha1Base32)
      throw new Error(`CDX digest mismatch for ${asset.originalUrl}`);
    await mkdir(dirname(path), { recursive: true });
    const temporary = `${path}.part-${process.pid}`;
    try {
      await writeFile(temporary, bytes, { flag: 'wx' });
      await rename(temporary, path);
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      throw error;
    }
    responseContentType = response.headers.get('content-type');
    fetched = true;
  }
  const contentSha1Base32 = sha1Base32(bytes);
  if (contentSha1Base32 !== asset.cdxDigestSha1Base32)
    throw new Error(`existing CDX digest mismatch for ${asset.originalUrl}`);
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
      validationStatus: 'cdx_digest_verified',
    },
  };
}

async function download(
  runOptions: Options,
  supplied?: GeraldtonArchiveAsset[],
): Promise<DownloadRecord[]> {
  const all = supplied ?? (await inventory());
  const selected =
    runOptions.limit === null ? all : all.slice(0, runOptions.limit);
  const limiter = new RateLimiter(runOptions.requestsPerSecond);
  const rows: Array<DownloadRecord | undefined> = new Array(selected.length);
  const errors: Array<Record<string, unknown>> = [];
  let completed = 0;
  let fetched = 0;
  let resumed = 0;
  const started = Date.now();
  await workers(selected, runOptions.concurrency, async (asset, index) => {
    try {
      const result = await downloadAsset(asset, limiter);
      rows[index] = result.record;
      if (result.fetched) fetched += 1;
      else resumed += 1;
    } catch (error) {
      errors.push({
        assetId: asset.assetId,
        originalUrl: asset.originalUrl,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      completed += 1;
      if (
        completed === 1 ||
        completed % 50 === 0 ||
        completed === selected.length
      ) {
        const elapsed = Math.max((Date.now() - started) / 1000, 0.001);
        console.log(
          `Assets: ${completed}/${selected.length}, ${(completed / elapsed).toFixed(2)}/s, ` +
            `fetched ${fetched}, resumed ${resumed}, errors ${errors.length}`,
        );
      }
    }
  });
  const downloads = rows.filter(
    (row): row is DownloadRecord => row !== undefined,
  );
  await writeJsonl(DOWNLOADS_PATH, downloads);
  await writeJsonl(DOWNLOAD_ERRORS_PATH, errors);
  if (errors.length) process.exitCode = 1;
  return downloads;
}

function counts(values: string[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const value of values) result[value] = (result[value] ?? 0) + 1;
  return result;
}

function relationCounts(rows: GeraldtonCrosswalkRow[]): Record<string, number> {
  return counts(rows.map((row) => row.relationStatus));
}

function unresolvedSurfaceCounts(
  rows: GeraldtonCrosswalkRow[],
): Record<string, number> {
  return counts(
    rows
      .filter((row) => row.relationStatus === 'no_exact_headword_review')
      .map((row) => row.sourceUnitKind),
  );
}

async function extract(suppliedAssets?: GeraldtonArchiveAsset[]): Promise<{
  rows2015: GeraldtonAdoptionRow[];
  rows2021: GeraldtonAdoptionRow[];
  crosswalk2015: GeraldtonCrosswalkRow[];
  crosswalk2021: GeraldtonCrosswalkRow[];
}> {
  const assets =
    suppliedAssets ?? (await readJsonl<GeraldtonArchiveAsset>(ASSETS_PATH));
  const dictionaryBytes = await readFile(DICTIONARY_PATH);
  async function parseSnapshot(
    originalUrl: string,
    snapshotId: string,
  ): Promise<GeraldtonAdoptionRow[]> {
    const asset = assets.find(
      (candidate) => candidate.originalUrl === originalUrl,
    );
    if (!asset) throw new Error(`list capture is absent: ${originalUrl}`);
    const path = join(SOURCE_ROOT, asset.archiveRelativePath);
    const html = await readFile(path, 'utf8');
    return parseGeraldtonAdoptionList({
      html,
      snapshotId,
      captureTimestamp: asset.timestamp,
      sourceListUrl: asset.originalUrl,
      sourceListPath: relative(PROGRAM_ROOT, path),
      sourceListSha256: sha256(html),
    });
  }
  const rows2015 = await parseSnapshot(LIST_2015_URL, 'ggw-adoption-list-2015');
  const rows2021 = await parseSnapshot(LIST_2021_URL, 'ggw-adoption-list-2021');
  const dictionary = JSON.parse(dictionaryBytes.toString('utf8')) as unknown;
  const crosswalk2015 = crosswalkGeraldtonAdoptionRows(rows2015, dictionary);
  const crosswalk2021 = crosswalkGeraldtonAdoptionRows(rows2021, dictionary);
  await writeJsonl(LIST_2015_PATH, rows2015);
  await writeJsonl(LIST_2021_PATH, rows2021);
  await writeJsonl(CROSSWALK_2015_PATH, crosswalk2015);
  await writeJsonl(CROSSWALK_2021_PATH, crosswalk2021);
  const ids2015 = new Set(rows2015.map((row) => row.sourceItemNumber));
  await writeJson(EVIDENCE_REPORT_PATH, {
    schemaVersion: 1,
    inventoryId: 'wbv-geraldton-goes-wajarri-lexical-evidence-v0.1.0',
    dictionaryPath: relative(PROGRAM_ROOT, DICTIONARY_PATH),
    dictionarySha256: sha256(dictionaryBytes),
    snapshot2015: {
      rows: rows2015.length,
      categories: counts(rows2015.map((row) => row.categoryComparison)),
      relationStatus: relationCounts(crosswalk2015),
      unresolvedSurfaceKinds: unresolvedSurfaceCounts(crosswalk2015),
    },
    snapshot2021: {
      rows: rows2021.length,
      categories: counts(rows2021.map((row) => row.categoryComparison)),
      relationStatus: relationCounts(crosswalk2021),
      unresolvedSurfaceKinds: unresolvedSurfaceCounts(crosswalk2021),
      itemNumbersAbsentFrom2015: rows2021
        .filter((row) => !ids2015.has(row.sourceItemNumber))
        .map((row) => row.sourceItemNumber),
    },
    automaticMergeAllowed: false,
    acceptedLexicalRows: 0,
    trainingEligibleRows: 0,
    claimLimit:
      'These same-project website rows are corroborating source candidates. Exact surface matches do not adjudicate sense equivalence, orthography, category analysis, independence, or training rights.',
  });
  console.log(
    `Evidence: ${rows2015.length} rows in 2015; ${rows2021.length} rows in 2021.`,
  );
  return { rows2015, rows2021, crosswalk2015, crosswalk2021 };
}

async function audit(): Promise<Record<string, unknown>> {
  const [
    assets,
    downloads,
    errors,
    rows2015,
    rows2021,
    crosswalk2015,
    crosswalk2021,
  ] = await Promise.all([
    readJsonl<GeraldtonArchiveAsset>(ASSETS_PATH),
    readJsonl<DownloadRecord>(DOWNLOADS_PATH),
    readJsonl<Record<string, unknown>>(DOWNLOAD_ERRORS_PATH),
    readJsonl<GeraldtonAdoptionRow>(LIST_2015_PATH),
    readJsonl<GeraldtonAdoptionRow>(LIST_2021_PATH),
    readJsonl<GeraldtonCrosswalkRow>(CROSSWALK_2015_PATH),
    readJsonl<GeraldtonCrosswalkRow>(CROSSWALK_2021_PATH),
  ]);
  const audio = downloads.filter((row) => row.assetKind === 'audio');
  const audioProbes: Array<Record<string, unknown>> = [];
  for (const row of audio) {
    const path = join(SOURCE_ROOT, row.archiveRelativePath);
    const { stdout } = await execFile(
      'ffprobe',
      [
        '-v',
        'error',
        '-select_streams',
        'a:0',
        '-show_entries',
        'stream=codec_name:format=duration',
        '-of',
        'json',
        path,
      ],
      { encoding: 'utf8', timeout: 30_000, maxBuffer: 1024 * 1024 },
    );
    const probe = JSON.parse(stdout) as {
      streams?: Array<{ codec_name?: string }>;
      format?: { duration?: string };
    };
    const durationSeconds = Number(probe.format?.duration);
    if (
      probe.streams?.[0]?.codec_name !== 'mp3' ||
      !Number.isFinite(durationSeconds) ||
      durationSeconds <= 0
    )
      throw new Error(`invalid archived audio: ${row.archiveRelativePath}`);
    await execFile(
      'ffmpeg',
      ['-nostdin', '-v', 'error', '-i', path, '-f', 'null', '-'],
      {
        encoding: 'utf8',
        timeout: 180_000,
        maxBuffer: 1024 * 1024,
      },
    );
    audioProbes.push({
      assetId: row.assetId,
      archiveRelativePath: row.archiveRelativePath,
      durationSeconds,
    });
  }
  const report = {
    schemaVersion: 1,
    archiveId: 'wbv-geraldton-goes-wajarri-wayback-v0.1.0',
    assetCount: assets.length,
    downloadedAssetCount: downloads.length,
    downloadedBytes: downloads.reduce((sum, row) => sum + row.fileSizeBytes, 0),
    cdxDigestVerifiedCount: downloads.filter(
      (row) => row.validationStatus === 'cdx_digest_verified',
    ).length,
    downloadErrorCount: errors.length,
    decodedAudioCount: audioProbes.length,
    adoptionRows2015: rows2015.length,
    adoptionRows2021: rows2021.length,
    crosswalkRows2015: crosswalk2015.length,
    crosswalkRows2021: crosswalk2021.length,
    completeArchive: assets.length === downloads.length && errors.length === 0,
    completeLexicalInventory:
      rows2015.length === crosswalk2015.length &&
      rows2021.length === crosswalk2021.length,
    acceptedLexicalRows: 0,
    trainingEligibleRows: 0,
  };
  await writeJson(AUDIT_REPORT_PATH, report);
  console.log(
    `Audit: ${downloads.length}/${assets.length} assets; ${rows2015.length} + ${rows2021.length} lexical rows.`,
  );
  return report;
}

async function main(): Promise<void> {
  const runOptions = options(process.argv.slice(2));
  if (runOptions.command === 'inventory') return void (await inventory());
  if (runOptions.command === 'download')
    return void (await download(runOptions));
  if (runOptions.command === 'extract') return void (await extract());
  if (runOptions.command === 'audit') return void (await audit());
  const assets = await inventory();
  const downloads = await download(runOptions, assets);
  if (downloads.length !== assets.length)
    throw new Error('archive download is incomplete');
  await extract(assets);
  await audit();
}

main().catch((error) => {
  console.error(
    error instanceof Error ? (error.stack ?? error.message) : String(error),
  );
  process.exitCode = 1;
});
