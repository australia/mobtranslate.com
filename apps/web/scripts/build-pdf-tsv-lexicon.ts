import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { canonicalJson } from '../lib/research/dictionarySourceCensus';
import {
  buildPdfTsvLexicon,
  PdfTsvLexiconContractSchema,
} from '../lib/research/pdfTsvLexicon';

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

function jsonLines(rows: unknown[]): string {
  return rows.length === 0
    ? '\n'
    : `${rows.map((row) => canonicalJson(row)).join('\n')}\n`;
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
      'usage: tsx scripts/build-pdf-tsv-lexicon.ts --program-root PATH --contract RELATIVE_PATH [--write]',
    );
  const programRoot = path.resolve(rootArgument);
  const contractBytes = readFileSync(
    resolveWithin(programRoot, contractRelativePath),
  );
  const contract = PdfTsvLexiconContractSchema.parse(
    JSON.parse(contractBytes.toString('utf8')),
  );
  const sourcePdfBytes = readFileSync(
    resolveWithin(programRoot, contract.source.source_pdf_path),
  );
  const sourcePdfSha256 = sha256(sourcePdfBytes);
  if (sourcePdfSha256 !== contract.source.source_pdf_sha256)
    throw new Error(
      `source PDF hash mismatch: ${sourcePdfSha256} != ${contract.source.source_pdf_sha256}`,
    );
  const tsvBytes = readFileSync(
    resolveWithin(programRoot, contract.source.tsv_path),
  );
  const result = buildPdfTsvLexicon(tsvBytes, contract);
  const outputRoot = resolveWithin(programRoot, contract.output_directory);
  const contents = {
    lines: jsonLines(result.lines),
    entries: jsonLines(result.entries),
    reviewQueue: jsonLines(result.reviewQueue),
    report: `${JSON.stringify(result.report, null, 2)}\n`,
  };
  const components = {
    lines: {
      path: `${contract.output_directory}/lines.jsonl`,
      sha256: sha256(contents.lines),
      rows: result.lines.length,
    },
    entries: {
      path: `${contract.output_directory}/entries.jsonl`,
      sha256: sha256(contents.entries),
      rows: result.entries.length,
    },
    reviewQueue: {
      path: `${contract.output_directory}/review-queue.jsonl`,
      sha256: sha256(contents.reviewQueue),
      rows: result.reviewQueue.length,
    },
    report: {
      path: `${contract.output_directory}/report.json`,
      sha256: sha256(contents.report),
    },
  };
  const manifest = {
    schema_version: 1,
    inventory_id: contract.inventory_id,
    created_at_utc: contract.created_at_utc,
    contract: {
      path: contractRelativePath,
      sha256: sha256(contractBytes),
    },
    source: {
      ...contract.source,
      source_pdf_bytes: sourcePdfBytes.length,
      tsv_bytes: tsvBytes.length,
    },
    layout_contract: contract.layout,
    components,
    counts: result.report,
    release_status: contract.release_status,
    claim_limit: result.report.claimLimit,
  };
  const manifestContent = `${JSON.stringify(manifest, null, 2)}\n`;

  if (process.argv.includes('--write')) {
    writeImmutable(path.join(outputRoot, 'lines.jsonl'), contents.lines);
    writeImmutable(path.join(outputRoot, 'entries.jsonl'), contents.entries);
    writeImmutable(
      path.join(outputRoot, 'review-queue.jsonl'),
      contents.reviewQueue,
    );
    writeImmutable(path.join(outputRoot, 'report.json'), contents.report);
    writeImmutable(path.join(outputRoot, 'MANIFEST.json'), manifestContent);
  }

  console.log(
    JSON.stringify(
      {
        mode: process.argv.includes('--write') ? 'written' : 'validated_only',
        inventoryId: contract.inventory_id,
        sourcePdfSha256,
        tsvSha256: contract.source.tsv_sha256,
        counts: result.report,
        components,
        manifestSha256: sha256(manifestContent),
      },
      null,
      2,
    ),
  );
}

main();
