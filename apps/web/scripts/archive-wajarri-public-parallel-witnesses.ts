import { execFile as execFileCallback } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  access,
  mkdir,
  readFile,
  rename,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';
import {
  extractVisibleHtmlText,
  locateEvidenceMarkers,
  normalizeExtractedText,
} from '../lib/research/publicParallelWitnessArchive';

const execFile = promisify(execFileCallback);
const userAgent = 'MobTranslate-source-archiver/1.0 (+https://mobtranslate.com)';

const markerSchema = z.object({
  markerId: z.string().min(1),
  text: z.string().min(1),
  expectedCount: z.number().int().positive(),
});

const sourceSchema = z.object({
  sourceId: z.string().min(1),
  title: z.string().min(1),
  url: z.string().url(),
  format: z.enum(['html', 'pdf']),
  expectedContentTypePrefix: z.string().min(1),
  bodyPath: z.string().min(1),
  headersPath: z.string().min(1),
  textPath: z.string().min(1),
  markers: z.array(markerSchema).min(1),
});

const contractSchema = z.object({
  schemaVersion: z.literal(1),
  acquisitionId: z.string().min(1),
  capturedAtUtc: z.string().datetime({ offset: true }),
  manifestPath: z.string().min(1),
  reportPath: z.string().min(1),
  sources: z.array(sourceSchema).min(1),
});

type Contract = z.infer<typeof contractSchema>;
type Source = z.infer<typeof sourceSchema>;

interface Options {
  programRoot: string;
  contractPath: string;
  fetch: boolean;
  write: boolean;
}

function parseOptions(argv: string[]): Options {
  let programRoot = '';
  let contractPath = '';
  let fetch = false;
  let write = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--program-root') programRoot = argv[++index] ?? '';
    else if (argument === '--contract') contractPath = argv[++index] ?? '';
    else if (argument === '--fetch') fetch = true;
    else if (argument === '--write') write = true;
    else throw new Error(`unknown argument ${argument}`);
  }
  if (!programRoot || !contractPath)
    throw new Error('--program-root and --contract are required');
  return { programRoot: resolve(programRoot), contractPath, fetch, write };
}

function sha256(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex');
}

function pathInside(programRoot: string, relativePath: string): string {
  const absolute = resolve(programRoot, relativePath);
  if (!absolute.startsWith(`${programRoot}/`))
    throw new Error(`path escapes program root: ${relativePath}`);
  return absolute;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function writeImmutable(path: string, value: Buffer | string): Promise<void> {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
  await mkdir(dirname(path), { recursive: true });
  if (await exists(path)) {
    const existing = await readFile(path);
    if (existing.equals(bytes)) return;
    throw new Error(`refusing to overwrite non-identical artifact ${path}`);
  }
  const temporary = `${path}.part-${process.pid}`;
  await writeFile(temporary, bytes, { flag: 'wx' });
  await rename(temporary, path);
}

function stableHeaders(headers: Headers): Record<string, string> {
  return Object.fromEntries(
    [...headers.entries()].sort(([left], [right]) => left.localeCompare(right)),
  );
}

async function extractPdfText(pdfPath: string): Promise<string> {
  const temporary = `${pdfPath}.txt.part-${process.pid}`;
  try {
    await execFile('pdftotext', ['-layout', pdfPath, temporary], {
      maxBuffer: 16 * 1024 * 1024,
    });
    return normalizeExtractedText(await readFile(temporary, 'utf8'));
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
}

async function fetchSource(
  source: Source,
  programRoot: string,
): Promise<void> {
  const response = await fetch(source.url, {
    headers: { accept: '*/*', 'user-agent': userAgent },
    redirect: 'follow',
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok)
    throw new Error(`${source.sourceId}: ${response.status} ${response.statusText}`);
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().startsWith(source.expectedContentTypePrefix))
    throw new Error(`${source.sourceId}: unexpected content type ${contentType}`);

  const body = Buffer.from(await response.arrayBuffer());
  const bodyPath = pathInside(programRoot, source.bodyPath);
  const headersPath = pathInside(programRoot, source.headersPath);
  const textPath = pathInside(programRoot, source.textPath);
  await writeImmutable(bodyPath, body);
  const headerRecord = {
    requestedUrl: source.url,
    finalUrl: response.url,
    status: response.status,
    statusText: response.statusText,
    headers: stableHeaders(response.headers),
  };
  await writeImmutable(headersPath, `${JSON.stringify(headerRecord, null, 2)}\n`);
  const text =
    source.format === 'html'
      ? extractVisibleHtmlText(body.toString('utf8'))
      : await extractPdfText(bodyPath);
  await writeImmutable(textPath, text);
}

async function buildSourceRecord(source: Source, programRoot: string) {
  const bodyPath = pathInside(programRoot, source.bodyPath);
  const headersPath = pathInside(programRoot, source.headersPath);
  const textPath = pathInside(programRoot, source.textPath);
  const [body, headersBytes, textBytes] = await Promise.all([
    readFile(bodyPath),
    readFile(headersPath),
    readFile(textPath),
  ]);
  const headers = z
    .object({
      requestedUrl: z.string().url(),
      finalUrl: z.string().url(),
      status: z.number().int(),
      statusText: z.string(),
      headers: z.record(z.string(), z.string()),
    })
    .parse(JSON.parse(headersBytes.toString('utf8')));
  if (headers.status !== 200)
    throw new Error(`${source.sourceId}: archived status is ${headers.status}`);
  const text = textBytes.toString('utf8');
  const locatedMarkers = locateEvidenceMarkers(text, source.markers);
  return {
    sourceId: source.sourceId,
    title: source.title,
    requestedUrl: source.url,
    finalUrl: headers.finalUrl,
    status: headers.status,
    contentType: headers.headers['content-type'] ?? null,
    body: {
      path: source.bodyPath,
      bytes: body.length,
      sha256: sha256(body),
    },
    headers: {
      path: source.headersPath,
      bytes: headersBytes.length,
      sha256: sha256(headersBytes),
    },
    extractedText: {
      path: source.textPath,
      bytes: textBytes.length,
      lines: text.trimEnd().split('\n').length,
      sha256: sha256(textBytes),
    },
    evidenceMarkers: locatedMarkers,
  };
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const contractAbsolute = pathInside(options.programRoot, options.contractPath);
  const contractBytes = await readFile(contractAbsolute);
  const contract: Contract = contractSchema.parse(
    JSON.parse(contractBytes.toString('utf8')),
  );
  if (options.fetch) {
    for (const source of contract.sources)
      await fetchSource(source, options.programRoot);
  }
  const sources = [];
  for (const source of contract.sources)
    sources.push(await buildSourceRecord(source, options.programRoot));

  const manifest = {
    schemaVersion: 1,
    acquisitionId: contract.acquisitionId,
    capturedAtUtc: contract.capturedAtUtc,
    contract: {
      path: options.contractPath,
      bytes: contractBytes.length,
      sha256: sha256(contractBytes),
    },
    sources,
  };
  const report = {
    schemaVersion: 1,
    acquisitionId: contract.acquisitionId,
    sourceCount: sources.length,
    markerCount: sources.reduce(
      (total, source) => total + source.evidenceMarkers.length,
      0,
    ),
    observedMarkerLines: sources.reduce(
      (total, source) =>
        total +
        source.evidenceMarkers.reduce(
          (sourceTotal, marker) => sourceTotal + marker.observedCount,
          0,
        ),
      0,
    ),
    allSourcesHttp200: sources.every((source) => source.status === 200),
    allMarkersExact: sources.every((source) =>
      source.evidenceMarkers.every(
        (marker) => marker.observedCount === marker.expectedCount,
      ),
    ),
    linguisticAcceptance: 'not_automatic',
    trainingAuthorization: 'not_automatic',
    claimLimit:
      'This archive proves public byte access and exact phrase-witness locations only. It does not establish line alignment, grammatical productivity, source independence, training rights, model quality, or speaker approval.',
  };
  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
  const reportText = `${JSON.stringify(report, null, 2)}\n`;
  if (options.write) {
    await writeImmutable(
      pathInside(options.programRoot, contract.manifestPath),
      manifestText,
    );
    await writeImmutable(
      pathInside(options.programRoot, contract.reportPath),
      reportText,
    );
  }
  console.log(
    JSON.stringify(
      {
        ...report,
        manifestSha256: sha256(manifestText),
        reportSha256: sha256(reportText),
        mode: options.fetch ? 'fetched_and_verified' : 'offline_replay',
        wrote: options.write,
      },
      null,
      2,
    ),
  );
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
