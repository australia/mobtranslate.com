import { createWriteStream } from 'node:fs';
import { execFile as execFileCallback } from 'node:child_process';
import { access, copyFile, link, mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { promisify } from 'node:util';
import {
  MIKMAQ_ONLINE_INDEX_URL,
  MIKMAQ_RESEARCH_ROOT,
  entryAudio,
  parseMikmaqEntry,
  parseMikmaqIndex,
  parseMikmaqIndexAudioUrls,
  sha256,
  type MikmaqAudioReference,
  type MikmaqEntry,
  type MikmaqIndexEntry,
} from './lib/mikmaq-online';

type Command = 'inventory' | 'crawl' | 'download' | 'probe' | 'audit' | 'all';

interface CliOptions {
  command: Command;
  limit: number | null;
  concurrency: number;
  requestsPerSecond: number;
  refresh: boolean;
}

interface DownloadRecord {
  sourceAudioUrl: string;
  archiveRelativePath: string;
  contentSha256: string;
  fileSizeBytes: number;
  contentType: string | null;
  fetchedAt: string;
  codecName?: string;
  durationMs?: number;
  durationSeconds?: number;
  sampleRate?: number;
  channels?: number;
  probedAt?: string;
  qualityStatus?: 'usable' | 'unusable_too_short';
  qualityNote?: string;
}

const USER_AGENT = 'MobTranslate-source-archiver/2.0 (+https://mobtranslate.com)';
const INDEX_PATH = join(MIKMAQ_RESEARCH_ROOT, 'raw/index/all-words.html');
const INDEX_MANIFEST_PATH = join(MIKMAQ_RESEARCH_ROOT, 'manifests/index.json');
const ENTRY_MANIFEST_PATH = join(MIKMAQ_RESEARCH_ROOT, 'manifests/entries.jsonl');
const ENTRY_ERROR_PATH = join(MIKMAQ_RESEARCH_ROOT, 'manifests/entry-errors.jsonl');
const AUDIO_REFERENCE_PATH = join(MIKMAQ_RESEARCH_ROOT, 'manifests/audio-references.jsonl');
const AUDIO_DOWNLOAD_PATH = join(MIKMAQ_RESEARCH_ROOT, 'manifests/audio-downloads.jsonl');
const AUDIO_ERROR_PATH = join(MIKMAQ_RESEARCH_ROOT, 'manifests/audio-errors.jsonl');
const AUDIO_PROBE_ERROR_PATH = join(MIKMAQ_RESEARCH_ROOT, 'manifests/audio-probe-errors.jsonl');
const INVENTORY_REPORT_PATH = join(MIKMAQ_RESEARCH_ROOT, 'reports/inventory-summary.json');
const ENTRY_AUDIT_PATH = join(MIKMAQ_RESEARCH_ROOT, 'reports/entry-quality-audit.json');
const AUDIO_PROBE_REPORT_PATH = join(MIKMAQ_RESEARCH_ROOT, 'reports/audio-probe-summary.json');
const execFile = promisify(execFileCallback);

function parsePositiveNumber(value: string | undefined, flag: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${flag} must be a positive number`);
  return parsed;
}

function parseOptions(argv: string[]): CliOptions {
  const command = (argv[0] ?? 'all') as Command;
  if (!['inventory', 'crawl', 'download', 'probe', 'audit', 'all'].includes(command)) {
    throw new Error(`Unknown command '${command}'. Use inventory, crawl, download, probe, audit, or all.`);
  }

  const options: CliOptions = {
    command,
    limit: null,
    concurrency: 8,
    requestsPerSecond: 10,
    refresh: false,
  };
  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--refresh') options.refresh = true;
    else if (arg === '--limit') options.limit = Math.floor(parsePositiveNumber(argv[++index], arg));
    else if (arg === '--concurrency') options.concurrency = Math.floor(parsePositiveNumber(argv[++index], arg));
    else if (arg === '--requests-per-second') options.requestsPerSecond = parsePositiveNumber(argv[++index], arg);
    else throw new Error(`Unknown option '${arg}'`);
  }
  return options;
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
  const relativePath = relative(MIKMAQ_RESEARCH_ROOT, path);
  if (relativePath.startsWith('..')) throw new Error(`Refusing to archive a path outside the research root: ${path}`);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const historyPath = join(
    MIKMAQ_RESEARCH_ROOT,
    'history',
    dirname(relativePath),
    `${basename(path)}.${timestamp}.${sha256(bytes).slice(0, 12)}`,
  );
  await mkdir(dirname(historyPath), { recursive: true });
  try {
    await link(path, historyPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error;
    await copyFile(path, historyPath);
  }
}

async function atomicWrite(path: string, contents: string | Buffer): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const nextBytes = Buffer.isBuffer(contents) ? contents : Buffer.from(contents);
  if (await pathExists(path)) {
    const currentBytes = await readFile(path);
    if (currentBytes.equals(nextBytes)) return;
    await preserveExisting(path, currentBytes);
  }
  const temporaryPath = `${path}.tmp-${process.pid}`;
  await writeFile(temporaryPath, nextBytes);
  await rename(temporaryPath, path);
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await atomicWrite(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeJsonl(path: string, rows: unknown[]): Promise<void> {
  await atomicWrite(path, rows.length > 0 ? `${rows.map((row) => JSON.stringify(row)).join('\n')}\n` : '');
}

async function readJsonl<T>(path: string): Promise<T[]> {
  const text = await readFile(path, 'utf8');
  return text
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
    const interval = 1000 / this.requestsPerSecond;
    const waitMs = Math.max(0, this.nextStartAt - Date.now());
    if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
    this.nextStartAt = Date.now() + interval;
    release();
  }
}

function retryDelayMs(attempt: number, retryAfter: string | null): number {
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.min(seconds * 1000, 60_000);
  }
  return Math.min(1000 * 2 ** attempt, 30_000) + Math.floor(Math.random() * 250);
}

async function fetchWithRetry(url: string, limiter: RateLimiter, attempts = 5): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await limiter.wait();
    try {
      const response = await fetch(url, {
        headers: { 'user-agent': USER_AGENT, accept: '*/*' },
        redirect: 'follow',
        signal: AbortSignal.timeout(45_000),
      });
      if (response.ok) return response;
      if (response.status !== 429 && response.status < 500) {
        throw new Error(`${response.status} ${response.statusText}`);
      }
      lastError = new Error(`${response.status} ${response.statusText}`);
      await new Promise((resolve) =>
        setTimeout(resolve, retryDelayMs(attempt, response.headers.get('retry-after'))),
      );
    } catch (error) {
      lastError = error;
      if (attempt + 1 < attempts) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs(attempt, null)));
      }
    }
  }
  throw new Error(`Failed to fetch ${url} after ${attempts} attempts`, { cause: lastError });
}

async function downloadToFile(url: string, path: string, limiter: RateLimiter): Promise<Response> {
  const response = await fetchWithRetry(url, limiter);
  if (!response.body) throw new Error(`Empty response body from ${url}`);
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp-${process.pid}`;
  try {
    await pipeline(Readable.fromWeb(response.body as never), createWriteStream(temporaryPath, { flags: 'wx' }));
    const fileStat = await stat(temporaryPath);
    if (fileStat.size === 0) throw new Error(`Downloaded an empty file from ${url}`);
    if (await pathExists(path)) {
      const [currentBytes, nextBytes] = await Promise.all([readFile(path), readFile(temporaryPath)]);
      if (currentBytes.equals(nextBytes)) {
        await unlink(temporaryPath);
        return response;
      }
      await preserveExisting(path, currentBytes);
    }
    await rename(temporaryPath, path);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
  return response;
}

function progress(label: string, completed: number, total: number, startedAt: number, extra = ''): void {
  const elapsedSeconds = Math.max((Date.now() - startedAt) / 1000, 0.001);
  const rate = completed / elapsedSeconds;
  const etaMinutes = rate > 0 ? (total - completed) / rate / 60 : 0;
  console.log(
    `${label}: ${completed}/${total} (${((completed / Math.max(total, 1)) * 100).toFixed(1)}%) ` +
      `${rate.toFixed(2)}/s, ETA ${etaMinutes.toFixed(1)}m${extra ? `, ${extra}` : ''}`,
  );
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
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => run()));
}

async function inventory(options: CliOptions, limiter: RateLimiter): Promise<MikmaqIndexEntry[]> {
  await mkdir(MIKMAQ_RESEARCH_ROOT, { recursive: true });
  if (options.refresh || !(await pathExists(INDEX_PATH))) {
    console.log(`Fetching index: ${MIKMAQ_ONLINE_INDEX_URL}`);
    const response = await fetchWithRetry(MIKMAQ_ONLINE_INDEX_URL, limiter);
    await atomicWrite(INDEX_PATH, Buffer.from(await response.arrayBuffer()));
  }

  const indexHtml = await readFile(INDEX_PATH, 'utf8');
  const allEntries = parseMikmaqIndex(indexHtml);
  const entries = options.limit === null ? allEntries : allEntries.slice(0, options.limit);
  const indexStat = await stat(INDEX_PATH);
  await writeJson(INDEX_MANIFEST_PATH, {
    schemaVersion: 1,
    sourceUrl: MIKMAQ_ONLINE_INDEX_URL,
    rawHtmlPath: 'raw/index/all-words.html',
    rawHtmlSha256: sha256(indexHtml),
    fetchedAt: indexStat.mtime.toISOString(),
    totalEntryCount: allEntries.length,
    selectedEntryCount: entries.length,
    entries,
  });
  await writeJson(INVENTORY_REPORT_PATH, {
    generatedAt: new Date().toISOString(),
    sourceUrl: MIKMAQ_ONLINE_INDEX_URL,
    sourceEntryCount: allEntries.length,
    selectedEntryCount: entries.length,
    limitedRun: options.limit !== null,
  });
  console.log(`Inventory: ${allEntries.length} unique source entries${options.limit ? `; selected ${entries.length}` : ''}.`);
  return entries;
}

async function crawl(
  options: CliOptions,
  limiter: RateLimiter,
  suppliedEntries?: MikmaqIndexEntry[],
): Promise<MikmaqEntry[]> {
  const indexEntries = suppliedEntries ?? (await inventory(options, limiter));
  const parsedEntries: Array<MikmaqEntry | undefined> = new Array(indexEntries.length);
  const errors: Array<Record<string, unknown>> = [];
  let completed = 0;
  let fetched = 0;
  let reused = 0;
  const startedAt = Date.now();

  await runWorkers(indexEntries, options.concurrency, async (indexEntry, index) => {
    const absolutePath = join(MIKMAQ_RESEARCH_ROOT, indexEntry.rawHtmlPath);
    try {
      if (options.refresh || !(await pathExists(absolutePath))) {
        const response = await fetchWithRetry(indexEntry.sourceUrl, limiter);
        await atomicWrite(absolutePath, Buffer.from(await response.arrayBuffer()));
        fetched += 1;
      } else {
        reused += 1;
      }
      const html = await readFile(absolutePath, 'utf8');
      const htmlStat = await stat(absolutePath);
      parsedEntries[index] = parseMikmaqEntry(html, indexEntry.sourceUrl, {
        rawHtmlPath: indexEntry.rawHtmlPath,
        fetchedAt: htmlStat.mtime.toISOString(),
      });
    } catch (error) {
      errors.push({
        externalEntryId: indexEntry.externalEntryId,
        sourceUrl: indexEntry.sourceUrl,
        error: error instanceof Error ? error.message : String(error),
        observedAt: new Date().toISOString(),
      });
    } finally {
      completed += 1;
      if (completed === 1 || completed % 100 === 0 || completed === indexEntries.length) {
        progress('Entries', completed, indexEntries.length, startedAt, `fetched ${fetched}, resumed ${reused}, errors ${errors.length}`);
      }
    }
  });

  const entries = parsedEntries.filter((entry): entry is MikmaqEntry => entry !== undefined);
  await writeJsonl(ENTRY_MANIFEST_PATH, entries);
  await writeJsonl(ENTRY_ERROR_PATH, errors);
  await writeJsonl(AUDIO_REFERENCE_PATH, entries.flatMap(entryAudio));
  console.log(`Entry manifest: ${entries.length} parsed, ${errors.length} failed.`);
  return entries;
}

async function fileDigest(path: string): Promise<{ sha: string; size: number }> {
  const data = await readFile(path);
  const hasId3Header = data.length >= 3 && data.subarray(0, 3).toString('ascii') === 'ID3';
  const hasMpegFrameSync = data.length >= 2 && data[0] === 0xff && (data[1] & 0xe0) === 0xe0;
  if (!hasId3Header && !hasMpegFrameSync) {
    throw new Error(`Downloaded file is not recognizable MP3 audio: ${path}`);
  }
  return { sha: sha256(data), size: data.byteLength };
}

async function downloadAudio(
  options: CliOptions,
  limiter: RateLimiter,
  suppliedEntries?: MikmaqEntry[],
): Promise<DownloadRecord[]> {
  const entries = suppliedEntries ?? (await readJsonl<MikmaqEntry>(ENTRY_MANIFEST_PATH));
  const byUrl = new Map<string, MikmaqAudioReference>();
  for (const reference of entries.flatMap(entryAudio)) {
    if (!byUrl.has(reference.sourceAudioUrl)) byUrl.set(reference.sourceAudioUrl, reference);
  }
  const uniqueAudio = [...byUrl.values()];
  const records: Array<DownloadRecord | undefined> = new Array(uniqueAudio.length);
  const errors: Array<Record<string, unknown>> = [];
  let completed = 0;
  let fetched = 0;
  let reused = 0;
  const startedAt = Date.now();

  await runWorkers(uniqueAudio, options.concurrency, async (reference, index) => {
    const absolutePath = join(MIKMAQ_RESEARCH_ROOT, reference.archiveRelativePath);
    let contentType: string | null = null;
    try {
      if (options.refresh || !(await pathExists(absolutePath))) {
        const response = await downloadToFile(reference.sourceAudioUrl, absolutePath, limiter);
        contentType = response.headers.get('content-type');
        fetched += 1;
      } else {
        reused += 1;
      }
      const digest = await fileDigest(absolutePath);
      records[index] = {
        sourceAudioUrl: reference.sourceAudioUrl,
        archiveRelativePath: reference.archiveRelativePath,
        contentSha256: digest.sha,
        fileSizeBytes: digest.size,
        contentType,
        fetchedAt: (await stat(absolutePath)).mtime.toISOString(),
      };
    } catch (error) {
      errors.push({
        sourceAudioUrl: reference.sourceAudioUrl,
        archiveRelativePath: reference.archiveRelativePath,
        error: error instanceof Error ? error.message : String(error),
        observedAt: new Date().toISOString(),
      });
    } finally {
      completed += 1;
      if (completed === 1 || completed % 250 === 0 || completed === uniqueAudio.length) {
        progress('Audio', completed, uniqueAudio.length, startedAt, `fetched ${fetched}, resumed ${reused}, errors ${errors.length}`);
      }
    }
  });

  const downloads = records.filter((record): record is DownloadRecord => record !== undefined);
  await writeJsonl(AUDIO_DOWNLOAD_PATH, downloads);
  await writeJsonl(AUDIO_ERROR_PATH, errors);
  await writeJson(INVENTORY_REPORT_PATH, {
    generatedAt: new Date().toISOString(),
    sourceUrl: MIKMAQ_ONLINE_INDEX_URL,
    parsedEntryCount: entries.length,
    entryErrorCount: (await pathExists(ENTRY_ERROR_PATH))
      ? (await readJsonl<Record<string, unknown>>(ENTRY_ERROR_PATH)).length
      : 0,
    recordingReferenceCount: entries.flatMap(entryAudio).length,
    discoveredAudioCount: entries.reduce((sum, entry) => sum + entry.discoveredAudioCount, 0),
    unclassifiedAudioCount: entries.reduce((sum, entry) => sum + entry.unclassifiedAudioUrls.length, 0),
    uniqueAudioCount: uniqueAudio.length,
    downloadedAudioCount: downloads.length,
    audioErrorCount: errors.length,
    downloadedBytes: downloads.reduce((sum, record) => sum + record.fileSizeBytes, 0),
  });
  console.log(`Audio manifest: ${downloads.length} downloaded, ${errors.length} failed.`);
  return downloads;
}

function increment(map: Map<number, number>, value: number): void {
  map.set(value, (map.get(value) ?? 0) + 1);
}

async function auditEntries(suppliedEntries?: MikmaqEntry[]): Promise<Record<string, unknown>> {
  const entries = suppliedEntries ?? (await readJsonl<MikmaqEntry>(ENTRY_MANIFEST_PATH));
  const normalizedGroups = new Map<string, MikmaqEntry[]>();
  const speakerCounts = new Map<string, number>();
  const wordRecordingDistribution = new Map<number, number>();
  const exampleDistribution = new Map<number, number>();
  const entriesWithoutWordRecordings: string[] = [];
  const examplesWithoutRecordings: Array<{ externalEntryId: string; exampleIndex: number; text: string }> = [];
  const unclassifiedAudio: Array<{ externalEntryId: string; urls: string[] }> = [];
  const audioUrls = new Set<string>();
  let audioReferences = 0;
  let discoveredAudio = 0;
  let entriesWithTranslation = 0;
  let entriesWithPartOfSpeech = 0;
  let entriesWithMeanings = 0;
  let entriesWithPronunciationGuide = 0;

  for (const entry of entries) {
    const normalized = normalizedGroups.get(entry.normalizedHeadword) ?? [];
    normalized.push(entry);
    normalizedGroups.set(entry.normalizedHeadword, normalized);
    increment(wordRecordingDistribution, entry.wordRecordings.length);
    increment(exampleDistribution, entry.examples.length);
    if (entry.wordRecordings.length === 0) entriesWithoutWordRecordings.push(entry.externalEntryId);
    entry.examples.forEach((example, exampleIndex) => {
      if (example.recordings.length === 0) {
        examplesWithoutRecordings.push({ externalEntryId: entry.externalEntryId, exampleIndex, text: example.text });
      }
    });
    if (entry.unclassifiedAudioUrls.length > 0) {
      unclassifiedAudio.push({ externalEntryId: entry.externalEntryId, urls: entry.unclassifiedAudioUrls });
    }
    for (const recording of entryAudio(entry)) {
      audioReferences += 1;
      audioUrls.add(recording.sourceAudioUrl);
      const speaker = recording.speakerCode ?? '(not supplied)';
      speakerCounts.set(speaker, (speakerCounts.get(speaker) ?? 0) + 1);
    }
    discoveredAudio += entry.discoveredAudioCount;
    if (entry.translation) entriesWithTranslation += 1;
    if (entry.partOfSpeech) entriesWithPartOfSpeech += 1;
    if (entry.meanings.length > 0) entriesWithMeanings += 1;
    if (entry.pronunciationGuide) entriesWithPronunciationGuide += 1;
  }

  const normalizedHeadwordCollisions = [...normalizedGroups.entries()]
    .filter(([, values]) => values.length > 1)
    .map(([normalizedHeadword, values]) => ({
      normalizedHeadword,
      entries: values.map((entry) => ({ externalEntryId: entry.externalEntryId, sourceHeadword: entry.sourceHeadword })),
    }));
  const indexAudioUrls = parseMikmaqIndexAudioUrls(await readFile(INDEX_PATH, 'utf8'));
  const indexAudioUrlsMissingFromEntries = indexAudioUrls.filter((url) => !audioUrls.has(url));
  const report = {
    generatedAt: new Date().toISOString(),
    entryCount: entries.length,
    fieldCoverage: {
      translation: entriesWithTranslation,
      partOfSpeech: entriesWithPartOfSpeech,
      meanings: entriesWithMeanings,
      pronunciationGuide: entriesWithPronunciationGuide,
    },
    audioReferences,
    uniqueAudioUrls: audioUrls.size,
    uniqueIndexAudioUrls: indexAudioUrls.length,
    indexAudioUrlsMissingFromEntries,
    discoveredAudio,
    classifiedMinusDiscovered: audioReferences - discoveredAudio,
    unclassifiedAudioCount: unclassifiedAudio.reduce((sum, item) => sum + item.urls.length, 0),
    wordRecordingDistribution: Object.fromEntries([...wordRecordingDistribution].sort(([a], [b]) => a - b)),
    exampleDistribution: Object.fromEntries([...exampleDistribution].sort(([a], [b]) => a - b)),
    speakerCodes: [...speakerCounts.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .map(([speakerCode, recordingCount]) => ({ speakerCode, recordingCount })),
    entriesWithoutWordRecordings,
    examplesWithoutRecordings,
    normalizedHeadwordCollisionCount: normalizedHeadwordCollisions.length,
    normalizedHeadwordCollisions,
    unclassifiedAudio,
  };
  await writeJson(ENTRY_AUDIT_PATH, report);
  console.log(
    `Entry audit: ${entries.length} entries, ${audioReferences} classified references, ` +
      `${discoveredAudio} discovered links, ${unclassifiedAudio.length} entries with unclassified audio.`,
  );
  return report;
}

interface FfprobeResult {
  streams?: Array<{ codec_name?: string; sample_rate?: string; channels?: number }>;
  format?: { duration?: string };
}

async function probeAudio(options: CliOptions): Promise<DownloadRecord[]> {
  const downloads = await readJsonl<DownloadRecord>(AUDIO_DOWNLOAD_PATH);
  const probed: Array<DownloadRecord | undefined> = new Array(downloads.length);
  const errors: Array<Record<string, unknown>> = [];
  let completed = 0;
  const startedAt = Date.now();

  await runWorkers(downloads, options.concurrency, async (download, index) => {
    const path = join(MIKMAQ_RESEARCH_ROOT, download.archiveRelativePath);
    try {
      if (
        download.codecName === 'mp3' &&
        typeof download.durationMs === 'number' && download.durationMs >= 0 &&
        download.sampleRate && download.sampleRate > 0 &&
        download.channels && download.channels > 0 &&
        download.probedAt &&
        download.durationMs >= 100
      ) {
        const usable = download.durationMs >= 100;
        probed[index] = {
          ...download,
          qualityStatus: usable ? 'usable' : 'unusable_too_short',
          qualityNote: usable
            ? undefined
            : `Decoded duration ${download.durationMs} ms is below the 100 ms speech floor.`,
        };
        return;
      }
      const { stdout } = await execFile(
        'ffprobe',
        [
          '-v', 'error',
          '-select_streams', 'a:0',
          '-show_entries', 'stream=codec_name,sample_rate,channels:format=duration',
          '-of', 'json',
          path,
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
        !Number.isFinite(durationSeconds) || durationSeconds <= 0 ||
        !Number.isInteger(sampleRate) || sampleRate <= 0 ||
        !Number.isInteger(channels) || channels <= 0
      ) {
        throw new Error(`Invalid ffprobe metadata: ${JSON.stringify(result)}`);
      }
      probed[index] = {
        ...download,
        contentType: download.contentType ?? 'audio/mpeg',
        codecName: stream.codec_name,
        durationMs: Math.round(durationSeconds * 1000),
        durationSeconds,
        sampleRate,
        channels,
        probedAt: new Date().toISOString(),
        qualityStatus: durationSeconds * 1000 >= 100 ? 'usable' : 'unusable_too_short',
        qualityNote: durationSeconds * 1000 >= 100
          ? undefined
          : `Decoded duration ${(durationSeconds * 1000).toFixed(3)} ms is below the 100 ms speech floor.`,
      };
    } catch (error) {
      errors.push({
        sourceAudioUrl: download.sourceAudioUrl,
        archiveRelativePath: download.archiveRelativePath,
        error: error instanceof Error ? error.message : String(error),
        observedAt: new Date().toISOString(),
      });
    } finally {
      completed += 1;
      if (completed === 1 || completed % 500 === 0 || completed === downloads.length) {
        progress('Probe', completed, downloads.length, startedAt, `errors ${errors.length}`);
      }
    }
  });

  const successful = probed.filter((record): record is DownloadRecord => record !== undefined);
  const output = downloads.map((download, index) => probed[index] ?? download);
  await writeJsonl(AUDIO_DOWNLOAD_PATH, output);
  await writeJsonl(AUDIO_PROBE_ERROR_PATH, errors);
  const durations = successful.map((record) => record.durationMs ?? 0).sort((a, b) => a - b);
  const unusable = successful
    .filter((record) => record.qualityStatus !== 'usable')
    .map((record) => ({
      sourceAudioUrl: record.sourceAudioUrl,
      archiveRelativePath: record.archiveRelativePath,
      durationMs: record.durationMs,
      fileSizeBytes: record.fileSizeBytes,
      qualityStatus: record.qualityStatus,
      qualityNote: record.qualityNote,
    }));
  const report = {
    generatedAt: new Date().toISOString(),
    inputAudioCount: downloads.length,
    probedAudioCount: successful.length,
    probeErrorCount: errors.length,
    usableAudioCount: successful.length - unusable.length,
    unusableAudioCount: unusable.length,
    unusable,
    totalDurationMs: durations.reduce((sum, value) => sum + value, 0),
    durationMs: {
      minimum: durations[0] ?? null,
      median: durations.length > 0 ? durations[Math.floor(durations.length / 2)] : null,
      maximum: durations.at(-1) ?? null,
    },
    sampleRates: Object.fromEntries(
      [...new Set(successful.map((record) => record.sampleRate))]
        .sort((a, b) => (a ?? 0) - (b ?? 0))
        .map((sampleRate) => [String(sampleRate), successful.filter((record) => record.sampleRate === sampleRate).length]),
    ),
    channels: Object.fromEntries(
      [...new Set(successful.map((record) => record.channels))]
        .sort((a, b) => (a ?? 0) - (b ?? 0))
        .map((channels) => [String(channels), successful.filter((record) => record.channels === channels).length]),
    ),
  };
  await writeJson(AUDIO_PROBE_REPORT_PATH, report);
  console.log(`Audio probe: ${successful.length} valid MP3 files, ${errors.length} errors.`);
  if (errors.length > 0) throw new Error(`Audio probe found ${errors.length} invalid files`);
  return successful;
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const limiter = new RateLimiter(options.requestsPerSecond);
  console.log(
    `Mi'kmaq Online archive: command=${options.command}, concurrency=${options.concurrency}, ` +
      `rate=${options.requestsPerSecond}/s, root=${MIKMAQ_RESEARCH_ROOT}`,
  );

  if (options.command === 'inventory') await inventory(options, limiter);
  if (options.command === 'crawl') await crawl(options, limiter);
  if (options.command === 'download') await downloadAudio(options, limiter);
  if (options.command === 'probe') await probeAudio(options);
  if (options.command === 'audit') await auditEntries();
  if (options.command === 'all') {
    const indexEntries = await inventory(options, limiter);
    const entries = await crawl(options, limiter, indexEntries);
    await auditEntries(entries);
    await downloadAudio(options, limiter, entries);
    await probeAudio(options);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
