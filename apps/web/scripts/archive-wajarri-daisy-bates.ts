import { createHash } from 'node:crypto';
import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {
  buildDaisyBatesWajidaInventory,
  type DaisyBatesPageImage,
} from '../lib/research/wajarriDaisyBates';
import { canonicalJson } from '../lib/research/dictionarySourceCensus';

type Command = 'fetch' | 'audit' | 'all';

interface Options {
  command: Command;
  concurrency: number;
  requestsPerSecond: number;
}

interface ArtifactSpec {
  artifactId: string;
  remoteUrl: string;
  archiveRelativePath: string;
}

interface DownloadRecord extends ArtifactSpec {
  schemaVersion: 1;
  sha256: string;
  fileSizeBytes: number;
  responseContentType: string | null;
  etag: string | null;
  lastModified: string | null;
  retrievedAtUtc: string;
}

interface ImageAuditRecord {
  schemaVersion: 1;
  assetId: string;
  archiveRelativePath: string;
  sha256: string;
  format: 'jpeg';
  width: number;
  height: number;
  channels: number;
  fullDecodeStatus: 'passed';
}

const PROGRAM_ROOT =
  process.env.WAJARRI_PROGRAM_ROOT ??
  '/mnt/donto-data/donto-resources/research/language-programs/wajarri-v1';
const SOURCE_ROOT = path.join(
  PROGRAM_ROOT,
  'sources/raw/digital-daisy-bates-wajida-54-200t-20260723',
);
const DICTIONARY_PATH = path.join(
  PROGRAM_ROOT,
  'sources/raw/local-repository-20260722/dictionary.json',
);
const DICTIONARY_SNAPSHOT_PATH = path.join(
  SOURCE_ROOT,
  'inputs/current-dictionary-source-snapshot.json',
);
const DOWNLOADS_PATH = path.join(SOURCE_ROOT, 'manifests/downloads.jsonl');
const SOURCE_ROWS_PATH = path.join(
  SOURCE_ROOT,
  'inventories/source-rows.jsonl',
);
const PAGE_IMAGES_PATH = path.join(
  SOURCE_ROOT,
  'inventories/page-images.jsonl',
);
const INVENTORY_REPORT_PATH = path.join(
  SOURCE_ROOT,
  'reports/inventory-report.json',
);
const IMAGE_AUDIT_PATH = path.join(SOURCE_ROOT, 'manifests/image-audit.jsonl');
const AUDIT_REPORT_PATH = path.join(SOURCE_ROOT, 'reports/audit-report.json');
const USER_AGENT =
  'MobTranslate-source-archiver/1.0 (+https://mobtranslate.com)';

const STATIC_ARTIFACTS: ArtifactSpec[] = [
  {
    artifactId: 'wbv-bates-document-html',
    remoteUrl: 'https://bates.org.au/text/54-200T.html',
    archiveRelativePath: 'source/document.html',
  },
  {
    artifactId: 'wbv-bates-homepage-html',
    remoteUrl: 'https://bates.org.au/',
    archiveRelativePath: 'source/homepage.html',
  },
  {
    artifactId: 'wbv-bates-technical-details-html',
    remoteUrl: 'https://bates.org.au/tech.html',
    archiveRelativePath: 'source/technical-details.html',
  },
  {
    artifactId: 'wbv-bates-cc-by-nc-4-legalcode',
    remoteUrl: 'https://creativecommons.org/licenses/by-nc/4.0/legalcode.txt',
    archiveRelativePath: 'source/cc-by-nc-4.0-legalcode.txt',
  },
  {
    artifactId: 'wbv-bates-adelaide-item-json',
    remoteUrl:
      'https://digital.library.adelaide.edu.au/server/api/core/items/e5636859-c09d-4732-a161-7a5618646935',
    archiveRelativePath: 'source/adelaide-item.json',
  },
  {
    artifactId: 'wbv-bates-adelaide-access-status-json',
    remoteUrl:
      'https://digital.library.adelaide.edu.au/server/api/core/items/e5636859-c09d-4732-a161-7a5618646935/accessStatus',
    archiveRelativePath: 'source/adelaide-access-status.json',
  },
  {
    artifactId: 'wbv-bates-adelaide-bundles-json',
    remoteUrl:
      'https://digital.library.adelaide.edu.au/server/api/core/items/e5636859-c09d-4732-a161-7a5618646935/bundles?size=20',
    archiveRelativePath: 'source/adelaide-bundles.json',
  },
  {
    artifactId: 'wbv-bates-adelaide-original-bitstreams-json',
    remoteUrl:
      'https://digital.library.adelaide.edu.au/server/api/core/bundles/2b2e3989-c968-41be-a9b4-001d25f1e5dd/bitstreams?size=20',
    archiveRelativePath: 'source/adelaide-original-bitstreams.json',
  },
  {
    artifactId: 'wbv-bates-adelaide-license-bitstreams-json',
    remoteUrl:
      'https://digital.library.adelaide.edu.au/server/api/core/bundles/a37a9e62-1834-4684-a59d-7ebb7b668722/bitstreams?size=20',
    archiveRelativePath: 'source/adelaide-license-bitstreams.json',
  },
  {
    artifactId: 'wbv-bates-adelaide-owning-collection-json',
    remoteUrl:
      'https://digital.library.adelaide.edu.au/server/api/core/items/e5636859-c09d-4732-a161-7a5618646935/owningCollection',
    archiveRelativePath: 'source/adelaide-owning-collection.json',
  },
];

function parsePositive(value: string | undefined, name: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0)
    throw new Error(`${name} must be positive`);
  return parsed;
}

function options(argv: string[]): Options {
  const command = (argv[0] ?? 'all') as Command;
  if (!['fetch', 'audit', 'all'].includes(command))
    throw new Error(`unknown command: ${command}`);
  const parsed: Options = {
    command,
    concurrency: 2,
    requestsPerSecond: 2,
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
  private readonly intervalMs: number;
  private nextAt = 0;
  private queue: Promise<void> = Promise.resolve();

  constructor(requestsPerSecond: number) {
    if (!Number.isFinite(requestsPerSecond) || requestsPerSecond <= 0) {
      throw new Error('requestsPerSecond must be a positive finite number');
    }
    this.intervalMs = 1000 / requestsPerSecond;
  }

  async wait(): Promise<void> {
    let release = () => undefined;
    const predecessor = this.queue;
    this.queue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await predecessor;
    const waitMs = Math.max(0, this.nextAt - Date.now());
    if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
    this.nextAt = Date.now() + this.intervalMs;
    release();
  }
}

async function workers<T>(
  rows: T[],
  concurrency: number,
  worker: (_row: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  async function run(): Promise<void> {
    while (next < rows.length) {
      const index = next;
      next += 1;
      await worker(rows[index]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, rows.length) }, () => run()),
  );
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

async function existingDownloads(): Promise<Map<string, DownloadRecord>> {
  if (!(await exists(DOWNLOADS_PATH))) return new Map();
  return new Map(
    (await readJsonLines<DownloadRecord>(DOWNLOADS_PATH)).map((row) => [
      row.artifactId,
      row,
    ]),
  );
}

async function fetchArtifact(input: {
  spec: ArtifactSpec;
  limiter: RateLimiter;
  existing: Map<string, DownloadRecord>;
}): Promise<DownloadRecord> {
  const prior = input.existing.get(input.spec.artifactId);
  const archivePath = path.join(SOURCE_ROOT, input.spec.archiveRelativePath);
  if (prior) {
    if (
      prior.remoteUrl !== input.spec.remoteUrl ||
      prior.archiveRelativePath !== input.spec.archiveRelativePath
    )
      throw new Error(`download identity changed: ${input.spec.artifactId}`);
    const bytes = await readFile(archivePath);
    if (bytes.length !== prior.fileSizeBytes || sha256(bytes) !== prior.sha256)
      throw new Error(`archived download drift: ${input.spec.artifactId}`);
    return prior;
  }

  const response = await fetchRetry(input.spec.remoteUrl, input.limiter);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0)
    throw new Error(`empty response: ${input.spec.remoteUrl}`);
  await writeImmutable(archivePath, bytes);
  return {
    schemaVersion: 1,
    ...input.spec,
    sha256: sha256(bytes),
    fileSizeBytes: bytes.length,
    responseContentType: response.headers.get('content-type'),
    etag: response.headers.get('etag'),
    lastModified: response.headers.get('last-modified'),
    retrievedAtUtc: new Date().toISOString(),
  };
}

function imageSpec(image: DaisyBatesPageImage): ArtifactSpec {
  return {
    artifactId: image.assetId,
    remoteUrl: image.remoteUrl,
    archiveRelativePath: image.archiveRelativePath,
  };
}

async function buildInventory(): Promise<
  ReturnType<typeof buildDaisyBatesWajidaInventory>
> {
  const html = await readFile(
    path.join(SOURCE_ROOT, 'source/document.html'),
    'utf8',
  );
  const dictionary = JSON.parse(
    await readFile(DICTIONARY_SNAPSHOT_PATH, 'utf8'),
  );
  const inventory = buildDaisyBatesWajidaInventory({
    html,
    currentDictionaryValue: dictionary,
  });
  await writeImmutable(SOURCE_ROWS_PATH, jsonLines(inventory.sourceRows));
  await writeImmutable(PAGE_IMAGES_PATH, jsonLines(inventory.pageImages));
  await writeImmutable(INVENTORY_REPORT_PATH, prettyJson(inventory.report));
  return inventory;
}

async function fetchAll(parsed: Options): Promise<void> {
  await mkdir(SOURCE_ROOT, { recursive: true });
  if (!(await exists(DICTIONARY_SNAPSHOT_PATH)))
    await writeImmutable(
      DICTIONARY_SNAPSHOT_PATH,
      await readFile(DICTIONARY_PATH),
    );
  const existing = await existingDownloads();
  const limiter = new RateLimiter(parsed.requestsPerSecond);
  const records = new Map<string, DownloadRecord>();
  for (const spec of STATIC_ARTIFACTS) {
    const record = await fetchArtifact({ spec, limiter, existing });
    records.set(record.artifactId, record);
  }
  const inventory = await buildInventory();
  await workers(inventory.pageImages, parsed.concurrency, async (image) => {
    const record = await fetchArtifact({
      spec: imageSpec(image),
      limiter,
      existing,
    });
    records.set(record.artifactId, record);
  });
  const ordered = [...records.values()].sort((left, right) =>
    left.artifactId.localeCompare(right.artifactId, 'en'),
  );
  if (ordered.length !== STATIC_ARTIFACTS.length + inventory.pageImages.length)
    throw new Error('download manifest is incomplete');
  await writeImmutable(DOWNLOADS_PATH, jsonLines(ordered));
}

async function audit(): Promise<void> {
  const inventory = await buildInventory();
  const downloads = await readJsonLines<DownloadRecord>(DOWNLOADS_PATH);
  const expectedArtifacts = new Map(
    [...STATIC_ARTIFACTS, ...inventory.pageImages.map(imageSpec)].map((row) => [
      row.artifactId,
      row,
    ]),
  );
  if (downloads.length !== expectedArtifacts.size)
    throw new Error(
      `unexpected download count: ${downloads.length} != ${expectedArtifacts.size}`,
    );
  for (const download of downloads) {
    const expected = expectedArtifacts.get(download.artifactId);
    if (!expected)
      throw new Error(`unexpected artifact: ${download.artifactId}`);
    if (
      download.remoteUrl !== expected.remoteUrl ||
      download.archiveRelativePath !== expected.archiveRelativePath
    )
      throw new Error(`artifact identity mismatch: ${download.artifactId}`);
    const bytes = await readFile(
      path.join(SOURCE_ROOT, download.archiveRelativePath),
    );
    if (
      bytes.length !== download.fileSizeBytes ||
      sha256(bytes) !== download.sha256
    )
      throw new Error(`artifact checksum mismatch: ${download.artifactId}`);
  }

  if (inventory.report.sourceRows !== 755)
    throw new Error(
      `unexpected source row count: ${inventory.report.sourceRows}`,
    );
  if (inventory.report.typescriptImages !== 24)
    throw new Error(
      `unexpected typescript image count: ${inventory.report.typescriptImages}`,
    );
  if (inventory.report.manuscriptImages !== 31)
    throw new Error(
      `unexpected manuscript image count: ${inventory.report.manuscriptImages}`,
    );
  if (inventory.report.emptyGlossSourceRows !== 1)
    throw new Error(
      `unexpected empty-gloss source row count: ${inventory.report.emptyGlossSourceRows}`,
    );
  if (
    inventory.report.trainingRows !== 0 ||
    inventory.report.syntheticRows !== 0 ||
    inventory.report.benchmarkRows !== 0 ||
    inventory.report.productiveGrammarRules !== 0
  )
    throw new Error('historical source audit opened a prohibited eligibility');

  const byArtifact = new Map(downloads.map((row) => [row.artifactId, row]));
  const imageAudits: ImageAuditRecord[] = [];
  for (const image of inventory.pageImages) {
    const download = byArtifact.get(image.assetId);
    if (!download) throw new Error(`missing image download: ${image.assetId}`);
    const imagePath = path.join(SOURCE_ROOT, image.archiveRelativePath);
    const metadata = await sharp(imagePath, { failOn: 'warning' }).metadata();
    await sharp(imagePath, { failOn: 'warning' }).stats();
    if (
      metadata.format !== 'jpeg' ||
      !metadata.width ||
      !metadata.height ||
      !metadata.channels
    )
      throw new Error(`invalid JPEG metadata: ${image.assetId}`);
    imageAudits.push({
      schemaVersion: 1,
      assetId: image.assetId,
      archiveRelativePath: image.archiveRelativePath,
      sha256: download.sha256,
      format: 'jpeg',
      width: metadata.width,
      height: metadata.height,
      channels: metadata.channels,
      fullDecodeStatus: 'passed',
    });
  }
  await writeImmutable(IMAGE_AUDIT_PATH, jsonLines(imageAudits));

  const document = await readFile(
    path.join(SOURCE_ROOT, 'source/document.html'),
    'utf8',
  );
  const homepage = await readFile(
    path.join(SOURCE_ROOT, 'source/homepage.html'),
    'utf8',
  );
  const technical = await readFile(
    path.join(SOURCE_ROOT, 'source/technical-details.html'),
    'utf8',
  );
  const accessStatus = JSON.parse(
    await readFile(
      path.join(SOURCE_ROOT, 'source/adelaide-access-status.json'),
      'utf8',
    ),
  ) as { status?: string };
  if (!document.includes('Language: </span>Watjarri'))
    throw new Error('document identity witness is absent');
  if (!technical.includes('The moral rights of the speakers are asserted'))
    throw new Error('speaker moral-rights notice is absent');
  if (!technical.includes('creativecommons.org/licenses/by-nc/4.0/'))
    throw new Error('CC BY-NC 4.0 technical-page notice is absent');
  if (!homepage.includes('creativecommons.org/licenses/by/3.0/au/'))
    throw new Error('CC BY 3.0 AU homepage notice is absent');
  if (accessStatus.status !== 'restricted')
    throw new Error('University of Adelaide access boundary changed');

  const issuedAtUtc = downloads
    .map((row) => row.retrievedAtUtc)
    .sort()
    .at(-1);
  await writeImmutable(
    AUDIT_REPORT_PATH,
    prettyJson({
      schema_version: 1,
      audit_id: 'wajarri-digital-daisy-bates-wajida-54-200t-audit-v0.1.0',
      issued_at_utc: issuedAtUtc,
      result: 'pass',
      source_identity: {
        document: 'Section XII, 2F, 8b - Wajida of Peak Hill',
        source_language_label: 'Watjarri',
        project_citation: 'Nick Thieberger. 2017. Digital Daisy Bates.',
        source_period:
          'Digital Daisy Bates describes the collection as recorded in the early 1900s; this document does not state an exact recording date.',
      },
      counts: inventory.report,
      archive: {
        downloads: downloads.length,
        downloaded_bytes: downloads.reduce(
          (sum, row) => sum + row.fileSizeBytes,
          0,
        ),
        image_full_decode_passes: imageAudits.length,
        checksum_failures: 0,
      },
      rights: {
        conservative_operational_license: 'CC BY-NC 4.0',
        notice_conflict:
          'The current homepage body says CC BY 3.0 AU while the current site-wide badge, document page, and technical page state CC BY-NC 4.0. Downstream use is conservatively bounded by CC BY-NC 4.0.',
        attribution_required: true,
        commercial_use: 'not_allowed_without_separate_permission',
        speaker_moral_rights_notice_preserved: true,
        university_adelaide_pdf_access: 'restricted_and_not_downloaded',
      },
      downstream_decision: {
        source_rows_preserved: inventory.report.sourceRows,
        direct_supervision_rows: 0,
        benchmark_rows: 0,
        training_rows: 0,
        synthetic_rows: 0,
        productive_grammar_rules: 0,
        blockers: [
          'historical transcription has not been mapped to the contemporary practical orthography',
          'source rows have not been classified as lexical, metalinguistic, phrase, clause, or sentence tasks',
          'sense boundaries and substitutability have not been adjudicated',
          'speaker, variety, and exact recording date are unresolved beyond the source record',
          'no leakage-safe split has been assigned',
          'no source row independently authorizes a productive grammar rule',
        ],
      },
      inputs: {
        dictionary_snapshot: {
          path: path.relative(PROGRAM_ROOT, DICTIONARY_SNAPSHOT_PATH),
          sha256: sha256(await readFile(DICTIONARY_SNAPSHOT_PATH)),
        },
        downloads_manifest: {
          path: path.relative(PROGRAM_ROOT, DOWNLOADS_PATH),
          sha256: sha256(await readFile(DOWNLOADS_PATH)),
        },
      },
    }),
  );
}

async function main(): Promise<void> {
  const parsed = options(process.argv.slice(2));
  if (parsed.command === 'fetch' || parsed.command === 'all')
    await fetchAll(parsed);
  if (parsed.command === 'audit' || parsed.command === 'all') await audit();
  if (parsed.command === 'fetch') {
    const report = JSON.parse(
      await readFile(INVENTORY_REPORT_PATH, 'utf8'),
    ) as {
      sourceRows: number;
      trainingRows: number;
      syntheticRows: number;
    };
    const downloads = await readJsonLines<DownloadRecord>(DOWNLOADS_PATH);
    console.log(
      JSON.stringify({
        result: 'fetched',
        sourceRows: report.sourceRows,
        downloads: downloads.length,
        trainingRows: report.trainingRows,
        syntheticRows: report.syntheticRows,
        sourceRoot: SOURCE_ROOT,
      }),
    );
    return;
  }
  const report = JSON.parse(await readFile(AUDIT_REPORT_PATH, 'utf8')) as {
    result: string;
    counts: { sourceRows: number; trainingRows: number; syntheticRows: number };
    archive: { downloads: number; image_full_decode_passes: number };
  };
  console.log(
    JSON.stringify({
      result: report.result,
      sourceRows: report.counts.sourceRows,
      downloads: report.archive.downloads,
      imageFullDecodePasses: report.archive.image_full_decode_passes,
      trainingRows: report.counts.trainingRows,
      syntheticRows: report.counts.syntheticRows,
      sourceRoot: SOURCE_ROOT,
    }),
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
