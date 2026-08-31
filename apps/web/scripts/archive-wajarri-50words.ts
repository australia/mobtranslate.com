import { execFile as execFileCallback } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  buildFiftyWordsWajarriEvidence,
  type FiftyWordsAudioAsset,
} from '../lib/research/wajarriFiftyWords';
import { canonicalJson } from '../lib/research/dictionarySourceCensus';

type Command = 'fetch' | 'probe' | 'audit' | 'all';

interface Options {
  command: Command;
  concurrency: number;
  requestsPerSecond: number;
}

interface FetchRecord {
  schemaVersion: 1;
  artifactId: string;
  remoteUrl: string;
  archiveRelativePath: string;
  sha256: string;
  fileSizeBytes: number;
  responseContentType: string | null;
  etag: string | null;
  lastModified: string | null;
  retrievedAtUtc: string;
}

interface AudioDownloadRecord extends FetchRecord {
  assetId: string;
  role: FiftyWordsAudioAsset['role'];
  sourceRecordId: string | null;
  englishSource: string | null;
  wajarriSource: string;
  speakerSource: string;
}

interface AudioProbeRecord {
  schemaVersion: 1;
  assetId: string;
  archiveRelativePath: string;
  sha256: string;
  codecName: string;
  sampleRate: number;
  channels: number;
  durationSeconds: number;
  fullDecodeStatus: 'passed';
}

interface FfprobeOutput {
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
const SOURCE_ROOT = path.join(
  PROGRAM_ROOT,
  'sources/raw/50words-wajarri-a39-20260723',
);
const DICTIONARY_PATH = path.join(
  PROGRAM_ROOT,
  'sources/raw/local-repository-20260722/dictionary.json',
);
const USER_AGENT =
  'MobTranslate-source-archiver/1.0 (+https://mobtranslate.com)';
const BASE_URL = 'https://50words.online';
const INDEX_URL = `${BASE_URL}/repository/A39/index.json`;
const LANGUAGES_URL = `${BASE_URL}/repository/languages.json`;
const PARADISEC_ID =
  'https://catalog.paradisec.org.au/repository/RUIL/50WORDS_A39_Wajarri';
const PARADISEC_API =
  'https://admin-catalog.paradisec.org.au/api/v1/oni/entity/' +
  encodeURIComponent(PARADISEC_ID);
const STATIC_ARTIFACTS_PATH = path.join(
  SOURCE_ROOT,
  'manifests/source-artifacts.jsonl',
);
const AUDIO_ASSETS_PATH = path.join(
  SOURCE_ROOT,
  'inventories/audio-assets.jsonl',
);
const PAIRINGS_PATH = path.join(
  SOURCE_ROOT,
  'inventories/translation-pairings.jsonl',
);
const INVENTORY_REPORT_PATH = path.join(
  SOURCE_ROOT,
  'reports/inventory-report.json',
);
const DOWNLOADS_PATH = path.join(SOURCE_ROOT, 'manifests/downloads.jsonl');
const PROBES_PATH = path.join(SOURCE_ROOT, 'manifests/audio-probes.jsonl');
const AUDIT_REPORT_PATH = path.join(SOURCE_ROOT, 'reports/audit-report.json');
const execFile = promisify(execFileCallback);

function parsePositive(value: string | undefined, name: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0)
    throw new Error(`${name} must be positive`);
  return parsed;
}

function options(argv: string[]): Options {
  const command = (argv[0] ?? 'all') as Command;
  if (!['fetch', 'probe', 'audit', 'all'].includes(command))
    throw new Error(`unknown command: ${command}`);
  const parsed: Options = {
    command,
    concurrency: 4,
    requestsPerSecond: 4,
  };
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--concurrency')
      parsed.concurrency = Math.floor(
        parsePositive(argv[++index], '--concurrency'),
      );
    else if (argument === '--requests-per-second')
      parsed.requestsPerSecond = parsePositive(
        argv[++index],
        '--requests-per-second',
      );
    else throw new Error(`unknown option: ${argument}`);
  }
  return parsed;
}

function sha256(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex');
}

function jsonLines(rows: unknown[]): string {
  return rows.length === 0
    ? '\n'
    : `${rows.map((row) => canonicalJson(row)).join('\n')}\n`;
}

function prettyJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function writeImmutable(
  filePath: string,
  content: Buffer | string,
): Promise<void> {
  const next = Buffer.isBuffer(content) ? content : Buffer.from(content);
  await mkdir(path.dirname(filePath), { recursive: true });
  if (await exists(filePath)) {
    const current = await readFile(filePath);
    if (!current.equals(next))
      throw new Error(`refusing to rewrite immutable artifact: ${filePath}`);
    return;
  }
  const temporary = `${filePath}.part-${process.pid}`;
  await writeFile(temporary, next, { flag: 'wx', mode: 0o664 });
  await rename(temporary, filePath);
}

async function readJsonLines<T>(filePath: string): Promise<T[]> {
  return (await readFile(filePath, 'utf8'))
    .split(/\r?\n/u)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as T);
}

class RateLimiter {
  private nextAt = 0;
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly requestsPerSecond: number) {}

  async wait(): Promise<void> {
    let release = () => undefined;
    const predecessor = this.queue;
    this.queue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await predecessor;
    const waitMs = Math.max(0, this.nextAt - Date.now());
    if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
    this.nextAt = Date.now() + 1000 / this.requestsPerSecond;
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
  rows: T[],
  concurrency: number,
  worker: (_row: T, _index: number) => Promise<void>,
): Promise<void> {
  let next = 0;
  async function run(): Promise<void> {
    while (next < rows.length) {
      const index = next;
      next += 1;
      await worker(rows[index], index);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, rows.length) }, () => run()),
  );
}

async function fetchArtifact(input: {
  artifactId: string;
  remoteUrl: string;
  archiveRelativePath: string;
  limiter: RateLimiter;
  retrievedAtUtc: string;
}): Promise<{ record: FetchRecord; bytes: Buffer }> {
  const response = await fetchRetry(input.remoteUrl, input.limiter);
  const bytes = Buffer.from(await response.arrayBuffer());
  await writeImmutable(
    path.join(SOURCE_ROOT, input.archiveRelativePath),
    bytes,
  );
  return {
    bytes,
    record: {
      schemaVersion: 1,
      artifactId: input.artifactId,
      remoteUrl: input.remoteUrl,
      archiveRelativePath: input.archiveRelativePath,
      sha256: sha256(bytes),
      fileSizeBytes: bytes.length,
      responseContentType: response.headers.get('content-type'),
      etag: response.headers.get('etag'),
      lastModified: response.headers.get('last-modified'),
      retrievedAtUtc: input.retrievedAtUtc,
    },
  };
}

function applicationBundlePath(html: string): string {
  const scripts = [
    ...html.matchAll(/<script[^>]+src=["']([^"']+\.js)["']/giu),
  ].map((match) => match[1]);
  const local = scripts.filter((value) => value.startsWith('/'));
  if (local.length !== 1)
    throw new Error(
      `expected one same-origin application bundle, found ${local.length}`,
    );
  return local[0];
}

async function fetchSource(options: Options): Promise<void> {
  const limiter = new RateLimiter(options.requestsPerSecond);
  const retrievedAtUtc = new Date().toISOString();
  const site = await fetchArtifact({
    artifactId: 'wbv-50words-site-index',
    remoteUrl: `${BASE_URL}/`,
    archiveRelativePath: 'source/site-index.html',
    limiter,
    retrievedAtUtc,
  });
  const bundleRemotePath = applicationBundlePath(site.bytes.toString('utf8'));
  const staticDefinitions = [
    {
      artifactId: 'wbv-50words-site-app-bundle',
      remoteUrl: `${BASE_URL}${bundleRemotePath}`,
      archiveRelativePath: 'source/site-app.js',
    },
    {
      artifactId: 'wbv-50words-languages-index',
      remoteUrl: LANGUAGES_URL,
      archiveRelativePath: 'source/languages.json',
    },
    {
      artifactId: 'wbv-50words-a39-index',
      remoteUrl: INDEX_URL,
      archiveRelativePath: 'source/A39/index.json',
    },
    {
      artifactId: 'wbv-50words-paradisec-entity-metadata',
      remoteUrl: PARADISEC_API,
      archiveRelativePath: 'source/paradisec-entity.json',
    },
    {
      artifactId: 'wbv-50words-paradisec-rocrate-metadata',
      remoteUrl: `${PARADISEC_API}/rocrate`,
      archiveRelativePath: 'source/paradisec-rocrate.json',
    },
    {
      artifactId: 'wbv-50words-cc-by-nc-4-legalcode',
      remoteUrl: 'https://creativecommons.org/licenses/by-nc/4.0/legalcode.en',
      archiveRelativePath: 'source/cc-by-nc-4.0-legalcode.html',
    },
  ];
  const staticResults = await Promise.all(
    staticDefinitions.map((definition) =>
      fetchArtifact({ ...definition, limiter, retrievedAtUtc }),
    ),
  );
  const staticRecords = [
    site.record,
    ...staticResults.map((result) => result.record),
  ];
  await writeImmutable(STATIC_ARTIFACTS_PATH, jsonLines(staticRecords));

  const index = JSON.parse(
    (await readFile(path.join(SOURCE_ROOT, 'source/A39/index.json'))).toString(
      'utf8',
    ),
  ) as unknown;
  const dictionary = JSON.parse(
    (await readFile(DICTIONARY_PATH)).toString('utf8'),
  ) as unknown;
  const inventory = buildFiftyWordsWajarriEvidence({
    indexValue: index,
    currentDictionaryValue: dictionary,
  });
  await writeImmutable(PAIRINGS_PATH, jsonLines(inventory.pairings));
  await writeImmutable(AUDIO_ASSETS_PATH, jsonLines(inventory.audioAssets));
  await writeImmutable(
    INVENTORY_REPORT_PATH,
    prettyJson({
      schemaVersion: 1,
      inventoryId: 'wajarri-50words-a39-evidence-v0.1.0',
      sourceId: 'src-wbv-50words-a39-2019-20260723',
      createdAtUtc: retrievedAtUtc,
      sourceScope:
        'Public 50words.online A39 JSON and audio derivatives only. The separately catalogued PARADISEC preservation files remain closed and were not downloaded.',
      license:
        'CC BY-NC 4.0 as stated by the 50 Words site, subject to attribution and noncommercial use. The site also states that words and recordings were supplied by speakers and included with permission.',
      counts: inventory.report,
      claimLimit:
        'The inventory establishes published speaker-attributed source pairings and audio. Task type, sense boundaries, substitutability, morphology, grammar productivity, split assignment, synthetic eligibility, and model-training row eligibility require separate review.',
    }),
  );

  const downloads: AudioDownloadRecord[] = new Array(
    inventory.audioAssets.length,
  );
  let completed = 0;
  const startedAt = Date.now();
  await workers(
    inventory.audioAssets,
    options.concurrency,
    async (asset, index) => {
      const fetched = await fetchArtifact({
        artifactId: asset.assetId,
        remoteUrl: asset.remoteUrl,
        archiveRelativePath: asset.archiveRelativePath,
        limiter,
        retrievedAtUtc,
      });
      downloads[index] = {
        ...fetched.record,
        assetId: asset.assetId,
        role: asset.role,
        sourceRecordId: asset.sourceRecordId,
        englishSource: asset.englishSource,
        wajarriSource: asset.wajarriSource,
        speakerSource: asset.speakerSource,
      };
      completed += 1;
      if (completed % 20 === 0 || completed === inventory.audioAssets.length) {
        const seconds = Math.max((Date.now() - startedAt) / 1000, 0.001);
        process.stdout.write(
          `audio fetch ${completed}/${inventory.audioAssets.length} (${(
            completed / seconds
          ).toFixed(2)}/s)\n`,
        );
      }
    },
  );
  await writeImmutable(DOWNLOADS_PATH, jsonLines(downloads));
  process.stdout.write(
    `${prettyJson({
      sourceArtifacts: staticRecords.length,
      pairings: inventory.pairings.length,
      audioAssets: inventory.audioAssets.length,
      retrievedAtUtc,
    })}`,
  );
}

async function probeAudio(options: Options): Promise<void> {
  const assets = await readJsonLines<FiftyWordsAudioAsset>(AUDIO_ASSETS_PATH);
  const probes: AudioProbeRecord[] = new Array(assets.length);
  let completed = 0;
  await workers(
    assets,
    Math.min(options.concurrency, 4),
    async (asset, index) => {
      const absolutePath = path.join(SOURCE_ROOT, asset.archiveRelativePath);
      const bytes = await readFile(absolutePath);
      const { stdout } = await execFile('ffprobe', [
        '-v',
        'error',
        '-show_streams',
        '-show_format',
        '-of',
        'json',
        absolutePath,
      ]);
      const parsed = JSON.parse(stdout) as FfprobeOutput;
      const stream = parsed.streams?.find((candidate) => candidate.codec_name);
      const sampleRate = Number(stream?.sample_rate);
      const channels = Number(stream?.channels);
      const durationSeconds = Number(parsed.format?.duration);
      if (
        !stream?.codec_name ||
        !Number.isFinite(sampleRate) ||
        sampleRate <= 0 ||
        !Number.isFinite(channels) ||
        channels <= 0 ||
        !Number.isFinite(durationSeconds) ||
        durationSeconds <= 0
      )
        throw new Error(
          `invalid ffprobe result for ${asset.archiveRelativePath}`,
        );
      await execFile('ffmpeg', [
        '-v',
        'error',
        '-i',
        absolutePath,
        '-f',
        'null',
        '-',
      ]);
      probes[index] = {
        schemaVersion: 1,
        assetId: asset.assetId,
        archiveRelativePath: asset.archiveRelativePath,
        sha256: sha256(bytes),
        codecName: stream.codec_name,
        sampleRate,
        channels,
        durationSeconds,
        fullDecodeStatus: 'passed',
      };
      completed += 1;
      if (completed % 30 === 0 || completed === assets.length)
        process.stdout.write(`audio probe ${completed}/${assets.length}\n`);
    },
  );
  await writeImmutable(PROBES_PATH, jsonLines(probes));
}

async function audit(): Promise<void> {
  const [
    sourceArtifacts,
    audioAssets,
    pairings,
    downloads,
    probes,
    reportBytes,
    bundleBytes,
    languagesBytes,
    rocrateBytes,
  ] = await Promise.all([
    readJsonLines<FetchRecord>(STATIC_ARTIFACTS_PATH),
    readJsonLines<FiftyWordsAudioAsset>(AUDIO_ASSETS_PATH),
    readJsonLines<Record<string, unknown>>(PAIRINGS_PATH),
    readJsonLines<AudioDownloadRecord>(DOWNLOADS_PATH),
    readJsonLines<AudioProbeRecord>(PROBES_PATH),
    readFile(INVENTORY_REPORT_PATH),
    readFile(path.join(SOURCE_ROOT, 'source/site-app.js')),
    readFile(path.join(SOURCE_ROOT, 'source/languages.json')),
    readFile(path.join(SOURCE_ROOT, 'source/paradisec-rocrate.json')),
  ]);
  if (sourceArtifacts.length !== 7)
    throw new Error(
      `expected 7 source artifacts, found ${sourceArtifacts.length}`,
    );
  if (pairings.length !== 55)
    throw new Error(`expected 55 pairings, found ${pairings.length}`);
  if (audioAssets.length !== 171)
    throw new Error(`expected 171 audio assets, found ${audioAssets.length}`);
  if (
    downloads.length !== audioAssets.length ||
    probes.length !== audioAssets.length
  )
    throw new Error('audio download/probe coverage is incomplete');

  for (const record of sourceArtifacts) {
    const bytes = await readFile(
      path.join(SOURCE_ROOT, record.archiveRelativePath),
    );
    if (
      sha256(bytes) !== record.sha256 ||
      bytes.length !== record.fileSizeBytes
    )
      throw new Error(
        `source artifact integrity failure: ${record.artifactId}`,
      );
  }
  const assetById = new Map(audioAssets.map((asset) => [asset.assetId, asset]));
  const probeById = new Map(probes.map((probe) => [probe.assetId, probe]));
  for (const record of downloads) {
    const asset = assetById.get(record.assetId);
    const probe = probeById.get(record.assetId);
    if (!asset || !probe)
      throw new Error(`orphan audio record: ${record.assetId}`);
    const bytes = await readFile(
      path.join(SOURCE_ROOT, record.archiveRelativePath),
    );
    const actual = sha256(bytes);
    if (actual !== record.sha256 || actual !== probe.sha256)
      throw new Error(`audio checksum mismatch: ${record.assetId}`);
    if (probe.fullDecodeStatus !== 'passed')
      throw new Error(`audio decode not passed: ${record.assetId}`);
  }

  const bundle = bundleBytes.toString('utf8');
  const requiredLicenseWitnesses = [
    'http://creativecommons.org/licenses/by-nc/4.0/',
    'The material in this site is made available under a Creative Commons BY-NC licence.',
    'All words, audio, and video recordings are provided by language speakers and are included here with permission.',
  ];
  for (const witness of requiredLicenseWitnesses)
    if (!bundle.includes(witness))
      throw new Error(`missing public-site license witness: ${witness}`);

  const languages = JSON.parse(languagesBytes.toString('utf8')) as {
    languages?: Array<{
      properties?: { code?: string; name?: string; words?: boolean };
    }>;
  };
  const a39 = languages.languages?.filter(
    (row) => row.properties?.code === 'A39',
  );
  if (
    a39?.length !== 1 ||
    a39[0].properties?.name !== 'Wajarri' ||
    a39[0].properties?.words !== true
  )
    throw new Error(
      'languages index does not identify one populated Wajarri A39 row',
    );

  const rocrate = JSON.parse(rocrateBytes.toString('utf8')) as {
    '@graph'?: Array<Record<string, unknown>>;
  };
  const graph = rocrate['@graph'] ?? [];
  const root = graph.find((row) => row['@id'] === PARADISEC_ID);
  const speaker = graph.find((row) => row['@id'] === '#person-6873');
  const closedLicense = graph.find(
    (row) => row['@id'] === '#license-3-64f4efaf',
  );
  if (!root || speaker?.name !== 'Godfrey Simpson')
    throw new Error('PARADISEC identity or speaker metadata is incomplete');
  if (
    closedLicense?.name !==
      'Closed (subject to the access condition details)' ||
    !String(closedLicense.description).includes('Contact RUIL')
  )
    throw new Error('PARADISEC closed-file boundary is not preserved');

  const report = JSON.parse(reportBytes.toString('utf8')) as {
    counts?: { trainingEligibleRows?: number; syntheticEligibleRows?: number };
  };
  if (
    report.counts?.trainingEligibleRows !== 0 ||
    report.counts?.syntheticEligibleRows !== 0
  )
    throw new Error('source inventory must not automatically open training');

  const auditReport = {
    schemaVersion: 1,
    auditId: 'wajarri-50words-a39-evidence-audit-v0.1.0',
    auditedAtUtc: new Date().toISOString(),
    status: 'passed',
    sourceArtifacts: sourceArtifacts.length,
    translationPairings: pairings.length,
    audioAssets: audioAssets.length,
    audioDownloadsChecksumVerified: downloads.length,
    audioFilesFullyDecoded: probes.length,
    speakerSource: 'Godfrey Simpson',
    publicSiteLicenseWitness: 'CC BY-NC 4.0',
    publicSitePermissionStatementVerified: true,
    paradisecPreservationFilesDownloaded: false,
    paradisecClosedAccessBoundaryVerified: true,
    automaticTrainingRows: 0,
    automaticSyntheticRows: 0,
    claimLimit:
      'PASS verifies source identity, public-site licence witnesses, exact bytes, row counts, speaker attribution, and complete audio decoding. It does not adjudicate lexical senses, grammar, task prefixes, synthetic cells, benchmark membership, or model quality.',
  };
  await writeImmutable(AUDIT_REPORT_PATH, prettyJson(auditReport));
  process.stdout.write(prettyJson(auditReport));
}

async function main(): Promise<void> {
  const parsed = options(process.argv.slice(2));
  if (parsed.command === 'fetch' || parsed.command === 'all')
    await fetchSource(parsed);
  if (parsed.command === 'probe' || parsed.command === 'all')
    await probeAudio(parsed);
  if (parsed.command === 'audit' || parsed.command === 'all') await audit();
}

void main();
