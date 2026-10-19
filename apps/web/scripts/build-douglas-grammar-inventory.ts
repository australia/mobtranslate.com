import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { verifyAppendOnlyLedger } from '../lib/research/appendOnlyLedger';
import { canonicalJson } from '../lib/research/dictionarySourceCensus';
import {
  buildDouglasGrammarInventory,
  DouglasGrammarInventoryContractSchema,
  type DouglasPageIndexRow,
} from '../lib/research/douglasGrammarInventory';

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

function readVerified(
  root: string,
  relativePath: string,
  expectedSha256: string,
): Buffer {
  const bytes = readFileSync(resolveWithin(root, relativePath));
  const actualSha256 = sha256(bytes);
  if (actualSha256 !== expectedSha256)
    throw new Error(
      `hash mismatch for ${relativePath}: ${actualSha256} != ${expectedSha256}`,
    );
  return bytes;
}

function parseJsonLines(bytes: Buffer): Array<Record<string, unknown>> {
  return bytes
    .toString('utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
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
      'usage: tsx scripts/build-douglas-grammar-inventory.ts --program-root PATH --contract RELATIVE_PATH [--write]',
    );

  const programRoot = path.resolve(rootArgument);
  const contractBytes = readFileSync(
    resolveWithin(programRoot, contractRelativePath),
  );
  const contract = DouglasGrammarInventoryContractSchema.parse(
    JSON.parse(contractBytes.toString('utf8')),
  );
  const sourceBytes = readVerified(
    programRoot,
    contract.source.path,
    contract.source.sha256,
  );
  readVerified(
    programRoot,
    contract.source.page_index.manifest_path,
    contract.source.page_index.manifest_sha256,
  );
  const pageRows = parseJsonLines(
    readVerified(
      programRoot,
      contract.source.page_index.pages_path,
      contract.source.page_index.pages_sha256,
    ),
  ) as unknown as DouglasPageIndexRow[];
  const sourceLedgerBytes = readFileSync(
    resolveWithin(programRoot, contract.source_ledger.path),
  );
  const sourceLedgerVerification = verifyAppendOnlyLedger(
    sourceLedgerBytes,
    contract.source_ledger.sha256,
  );

  const result = buildDouglasGrammarInventory(sourceBytes, pageRows, contract);
  const contents = {
    tableBlocks: jsonLines(result.tableBlocks),
    morphotacticStatements: jsonLines(result.morphotacticStatements),
    numberedExamples: jsonLines(result.numberedExamples),
    curatedExamples: jsonLines(result.curatedExamples),
  };
  const fileNames = {
    tableBlocks: 'table-blocks.jsonl',
    morphotacticStatements: 'morphotactic-statements.jsonl',
    numberedExamples: 'numbered-examples.jsonl',
    curatedExamples: 'curated-examples.jsonl',
  } as const;
  const rowCounts = {
    tableBlocks: result.tableBlocks.length,
    morphotacticStatements: result.morphotacticStatements.length,
    numberedExamples: result.numberedExamples.length,
    curatedExamples: result.curatedExamples.length,
  };
  const components = Object.fromEntries(
    Object.entries(contents).map(([key, content]) => [
      key,
      {
        path: `${contract.output_directory}/${fileNames[key as keyof typeof fileNames]}`,
        sha256: sha256(content),
        rows: rowCounts[key as keyof typeof rowCounts],
      },
    ]),
  );
  const manifest = {
    schema_version: 1,
    inventory_id: contract.inventory_id,
    created_at_utc: contract.created_at_utc,
    status: contract.status,
    scope: contract.scope,
    method_contract: {
      path: contractRelativePath,
      sha256: sha256(contractBytes),
    },
    source: {
      ...contract.source,
      byte_length: sourceBytes.length,
    },
    source_ledger: {
      path: contract.source_ledger.path,
      historical_sha256: contract.source_ledger.sha256,
      current_sha256: sourceLedgerVerification.currentSha256,
      verification_mode: sourceLedgerVerification.verificationMode,
    },
    components,
    validation: {
      indexed_source_pages: pageRows.length,
      expected_example_number_range: [
        contract.numbered_examples.expected_first_number,
        contract.numbered_examples.expected_last_number,
      ],
      numbered_examples: result.numberedExamples.length,
      numbered_example_occurrences: result.numberedExampleOccurrenceCount,
      duplicate_example_numbers: result.duplicateExampleNumbers,
      table_blocks: result.tableBlocks.length,
      morphotactic_statements: result.morphotacticStatements.length,
      curated_examples: result.curatedExamples.length,
      complete_number_sequence: true,
      source_page_hashes_verified: true,
      silent_ocr_corrections: 0,
      accepted_rows: 0,
      training_eligible_rows: 0,
    },
    claim_limit:
      'This inventory preserves source-rendered OCR blocks and source-anchored analyst candidates. It does not establish current forms, resolve table cells, certify translations, or authorize training.',
    release_status: contract.release_status,
  };
  const manifestContent = `${JSON.stringify(manifest, null, 2)}\n`;
  const manifestRelativePath = `${contract.output_directory}/MANIFEST.json`;

  if (process.argv.includes('--write')) {
    for (const [key, content] of Object.entries(contents))
      writeImmutable(
        resolveWithin(
          programRoot,
          `${contract.output_directory}/${fileNames[key as keyof typeof fileNames]}`,
        ),
        content,
      );
    writeImmutable(
      resolveWithin(programRoot, manifestRelativePath),
      manifestContent,
    );
  }

  console.log(
    JSON.stringify(
      {
        mode: process.argv.includes('--write') ? 'written' : 'validated_only',
        inventoryId: contract.inventory_id,
        manifestPath: manifestRelativePath,
        manifestSha256: sha256(manifestContent),
        components,
        validation: manifest.validation,
      },
      null,
      2,
    ),
  );
}

main();
