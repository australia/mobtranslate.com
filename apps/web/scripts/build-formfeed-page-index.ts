import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {
  buildFormFeedPageIndex,
  FormFeedPageIndexContractSchema,
} from '../lib/research/formFeedPageIndex';
import { canonicalJson } from '../lib/research/dictionarySourceCensus';

function flagValue(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? null) : null;
}

function resolveWithin(root: string, relativePath: string): string {
  if (path.isAbsolute(relativePath))
    throw new Error(
      `path must be relative to the program root: ${relativePath}`,
    );
  const resolved = path.resolve(root, relativePath);
  const relative = path.relative(root, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative))
    throw new Error(`path escapes the program root: ${relativePath}`);
  return resolved;
}

function sha256(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex');
}

function writeImmutable(filePath: string, content: string): void {
  if (existsSync(filePath)) {
    const existing = readFileSync(filePath, 'utf8');
    if (existing !== content)
      throw new Error(`refusing to rewrite immutable artifact: ${filePath}`);
    return;
  }
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, { encoding: 'utf8', mode: 0o664 });
}

async function main(): Promise<void> {
  const rootArgument = flagValue('--program-root');
  const contractRelativePath = flagValue('--contract');
  if (!rootArgument || !contractRelativePath)
    throw new Error(
      'usage: tsx scripts/build-formfeed-page-index.ts --program-root PATH --contract RELATIVE_PATH [--write]',
    );

  const programRoot = path.resolve(rootArgument);
  const contractBytes = readFileSync(
    resolveWithin(programRoot, contractRelativePath),
  );
  const contract = FormFeedPageIndexContractSchema.parse(
    JSON.parse(contractBytes.toString('utf8')),
  );
  const sourceBytes = readFileSync(
    resolveWithin(programRoot, contract.source.path),
  );
  const result = buildFormFeedPageIndex(sourceBytes, contract);
  const outputRoot = resolveWithin(programRoot, contract.output_directory);
  const pageIndexContent = `${result.pages
    .map((page) => canonicalJson(page))
    .join('\n')}\n`;
  const manifest = {
    schema_version: 1,
    index_id: contract.index_id,
    created_at_utc: contract.created_at_utc,
    contract: {
      path: contractRelativePath,
      sha256: sha256(contractBytes),
    },
    source: {
      ...contract.source,
      byte_length: result.sourceByteLength,
    },
    component: {
      path: `${contract.output_directory}/pages.jsonl`,
      sha256: sha256(pageIndexContent),
      rows: result.pages.length,
    },
    validation: {
      delimiter_count: result.delimiterCount,
      complete_byte_consumption: true,
      sequential_source_pdf_pages: true,
      sequential_printed_pages: true,
      empty_pages: 0,
    },
    release_status: contract.release_status,
  };
  const manifestContent = `${JSON.stringify(manifest, null, 2)}\n`;

  if (process.argv.includes('--write')) {
    writeImmutable(path.join(outputRoot, 'pages.jsonl'), pageIndexContent);
    writeImmutable(path.join(outputRoot, 'MANIFEST.json'), manifestContent);
  }

  console.log(
    JSON.stringify(
      {
        mode: process.argv.includes('--write') ? 'written' : 'validated_only',
        indexId: contract.index_id,
        sourceSha256: contract.source.sha256,
        sourceByteLength: result.sourceByteLength,
        pages: result.pages.length,
        firstPage: result.pages[0],
        lastPage: result.pages.at(-1),
        pageIndexSha256: sha256(pageIndexContent),
        manifestSha256: sha256(manifestContent),
      },
      null,
      2,
    ),
  );
}

main();
