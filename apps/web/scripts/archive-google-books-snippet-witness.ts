import { createHash } from 'node:crypto';
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
  buildGoogleBooksSnippetWitness,
  GoogleBooksSnippetWitnessContractSchema,
  type SnippetQueryResponse,
} from '../lib/research/googleBooksSnippetWitness';

function flagValue(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? null) : null;
}

function resolveWithin(root: string, relativePath: string): string {
  if (path.isAbsolute(relativePath))
    throw new Error(`path must be relative to program root: ${relativePath}`);
  const resolved = path.resolve(root, relativePath);
  const relative = path.relative(root, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative))
    throw new Error(`path escapes program root: ${relativePath}`);
  return resolved;
}

function sha256(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex');
}

function writeImmutable(filePath: string, content: Buffer | string): void {
  const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content);
  if (existsSync(filePath)) {
    if (!readFileSync(filePath).equals(bytes))
      throw new Error(`refusing to rewrite immutable artifact: ${filePath}`);
    return;
  }
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, bytes, { mode: 0o664 });
}

function jsonLines(rows: unknown[]): string {
  return rows.length === 0
    ? '\n'
    : `${rows.map((row) => canonicalJson(row)).join('\n')}\n`;
}

async function fetchQuery(
  endpoint: string,
  volumeId: string,
  query: string,
): Promise<{ bytes: Buffer; headers: string }> {
  const url = new URL(endpoint);
  url.searchParams.set('jscmd', 'SearchWithinVolume2');
  url.searchParams.set('q', query);
  url.searchParams.set('vid', volumeId);
  const response = await fetch(url, {
    redirect: 'follow',
    headers: { 'user-agent': 'MobTranslate scholarly source audit/1.0' },
  });
  if (!response.ok)
    throw new Error(`Google Books query failed: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const headers = [
    `request-url: ${url.toString()}`,
    `response-url: ${response.url}`,
    `status: ${response.status}`,
    ...[...response.headers.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${key}: ${value}`),
    '',
  ].join('\n');
  return { bytes, headers };
}

function decodeJson(bytes: Buffer, headers: string): unknown {
  const contentType = headers
    .split('\n')
    .find((line) => line.toLowerCase().startsWith('content-type:'));
  const encoding = /charset\s*=\s*iso-8859-1/iu.test(contentType ?? '')
    ? 'latin1'
    : 'utf8';
  return JSON.parse(bytes.toString(encoding)) as unknown;
}

async function main(): Promise<void> {
  const rootArgument = flagValue('--program-root');
  const contractRelativePath = flagValue('--contract');
  if (!rootArgument || !contractRelativePath)
    throw new Error(
      'usage: tsx scripts/archive-google-books-snippet-witness.ts --program-root PATH --contract RELATIVE_PATH [--fetch] [--write]',
    );
  const programRoot = path.resolve(rootArgument);
  const contractBytes = readFileSync(
    resolveWithin(programRoot, contractRelativePath),
  );
  const contract = GoogleBooksSnippetWitnessContractSchema.parse(
    JSON.parse(contractBytes.toString('utf8')),
  );
  const outputRoot = `sources/raw/${contract.acquisition_id}`;
  const queryReferences: Array<Record<string, unknown>> = [];
  const responses: SnippetQueryResponse[] = [];
  for (const query of contract.queries) {
    const rawRelativePath = `${outputRoot}/queries/${query.query_id}.json`;
    const headersRelativePath = `${outputRoot}/queries/${query.query_id}.headers.txt`;
    const rawPath = resolveWithin(programRoot, rawRelativePath);
    const headersPath = resolveWithin(programRoot, headersRelativePath);
    let bytes: Buffer;
    let headers: string;
    if (process.argv.includes('--fetch')) {
      const fetched = await fetchQuery(
        contract.endpoint,
        contract.volume.id,
        query.query,
      );
      bytes = fetched.bytes;
      headers = fetched.headers;
      if (process.argv.includes('--write')) {
        writeImmutable(rawPath, bytes);
        writeImmutable(headersPath, headers);
      }
    } else {
      bytes = readFileSync(rawPath);
      headers = readFileSync(headersPath, 'utf8');
    }
    const parsed = decodeJson(bytes, headers);
    responses.push({ queryId: query.query_id, query: query.query, response: parsed });
    queryReferences.push({
      query_id: query.query_id,
      query: query.query,
      response: {
        path: rawRelativePath,
        sha256: sha256(bytes),
        bytes: bytes.length,
      },
      headers: {
        path: headersRelativePath,
        sha256: sha256(headers),
      },
    });
  }

  const result = buildGoogleBooksSnippetWitness(contract, responses);
  const queriesContent = jsonLines(result.queryRows);
  const snippetsContent = jsonLines(result.scopedHits);
  const pageReferences: Array<Record<string, unknown>> = [];
  for (const [page, content] of result.pageWitnesses) {
    const relativePath = `${outputRoot}/page-witnesses/page-${page}.txt`;
    pageReferences.push({
      printed_page: page,
      path: relativePath,
      sha256: sha256(content),
      lines: content.split('\n').length - 1,
    });
    if (process.argv.includes('--write'))
      writeImmutable(resolveWithin(programRoot, relativePath), content);
  }
  const report = {
    schema_version: 1,
    acquisition_id: contract.acquisition_id,
    source_id: contract.source_id,
    volume: contract.volume,
    printed_page_scope: contract.printed_page_scope,
    counts: result.counts,
    access_status: 'publisher_public_search_snippets_only',
    rights: contract.rights,
    claim_limit: contract.claim_limit,
  };
  const reportContent = `${JSON.stringify(report, null, 2)}\n`;
  const components = {
    queries: {
      path: `${outputRoot}/queries.jsonl`,
      sha256: sha256(queriesContent),
      rows: result.queryRows.length,
    },
    scoped_snippets: {
      path: `${outputRoot}/scoped-snippets.jsonl`,
      sha256: sha256(snippetsContent),
      rows: result.scopedHits.length,
    },
    page_witnesses: pageReferences,
    raw_queries: queryReferences,
    report: {
      path: `${outputRoot}/REPORT.json`,
      sha256: sha256(reportContent),
    },
  };
  const manifest = {
    schema_version: 1,
    acquisition_id: contract.acquisition_id,
    source_id: contract.source_id,
    created_at_utc: contract.created_at_utc,
    method_contract: {
      path: contractRelativePath,
      sha256: sha256(contractBytes),
    },
    volume: contract.volume,
    endpoint: contract.endpoint,
    components,
    counts: result.counts,
    rights: contract.rights,
    claim_limit: contract.claim_limit,
  };
  const manifestContent = `${JSON.stringify(manifest, null, 2)}\n`;
  if (process.argv.includes('--write')) {
    writeImmutable(
      resolveWithin(programRoot, components.queries.path),
      queriesContent,
    );
    writeImmutable(
      resolveWithin(programRoot, components.scoped_snippets.path),
      snippetsContent,
    );
    writeImmutable(
      resolveWithin(programRoot, components.report.path),
      reportContent,
    );
    writeImmutable(
      resolveWithin(programRoot, `${outputRoot}/MANIFEST.json`),
      manifestContent,
    );
  }
  process.stdout.write(
    `${JSON.stringify({
      mode: process.argv.includes('--write') ? 'written' : 'validated_only',
      manifest_path: `${outputRoot}/MANIFEST.json`,
      manifest_sha256: sha256(manifestContent),
      counts: result.counts,
    })}\n`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
