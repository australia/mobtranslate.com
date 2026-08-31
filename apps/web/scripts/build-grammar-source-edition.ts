import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {
  buildGrammarSourceEdition,
  GrammarSourceEditionContractSchema,
} from '../lib/research/grammarSourceEdition';
import { verifyAppendOnlyLedger } from '../lib/research/appendOnlyLedger';
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

function sha256Bytes(bytes: string | Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function readVerified(
  root: string,
  relativePath: string,
  expected: string,
): Buffer {
  const bytes = readFileSync(resolveWithin(root, relativePath));
  const actual = sha256Bytes(bytes);
  if (actual !== expected)
    throw new Error(
      `hash mismatch for ${relativePath}: expected ${expected}, found ${actual}`,
    );
  return bytes;
}

function readVerifiedLedger(
  root: string,
  relativePath: string,
  expected: string,
): Buffer {
  const bytes = readFileSync(resolveWithin(root, relativePath));
  return verifyAppendOnlyLedger(bytes, expected).verifiedBytes;
}

function jsonLines(rows: unknown[]): string {
  if (rows.length === 0) return '\n';
  return `${rows.map((row) => canonicalJson(row)).join('\n')}\n`;
}

function writeImmutable(filePath: string, content: string): void {
  if (existsSync(filePath)) {
    const existing = readFileSync(filePath, 'utf8');
    if (existing !== content)
      throw new Error(
        `refusing to rewrite immutable edition artifact: ${filePath}`,
      );
    return;
  }
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, { encoding: 'utf8', mode: 0o664 });
}

function writeMutablePointer(
  filePath: string,
  content: string,
  supersedesPointerSha256: string,
): void {
  if (!existsSync(filePath))
    throw new Error('current grammar pointer is absent');
  const existing = readFileSync(filePath);
  const existingHash = sha256Bytes(existing);
  if (existing.toString('utf8') === content) return;
  if (existingHash !== supersedesPointerSha256)
    throw new Error(
      `current pointer does not match supersedes_pointer_sha256: ${existingHash}`,
    );
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  try {
    writeFileSync(temporaryPath, content, { encoding: 'utf8', mode: 0o664 });
    renameSync(temporaryPath, filePath);
  } finally {
    if (existsSync(temporaryPath)) rmSync(temporaryPath);
  }
}

async function main(): Promise<void> {
  const rootArgument = flagValue('--program-root');
  const contractRelativePath = flagValue('--contract');
  if (!rootArgument || !contractRelativePath)
    throw new Error(
      'usage: tsx scripts/build-grammar-source-edition.ts --program-root PATH --contract RELATIVE_PATH [--write]',
    );

  const programRoot = path.resolve(rootArgument);
  const contractBytes = readFileSync(
    resolveWithin(programRoot, contractRelativePath),
  );
  const contract = GrammarSourceEditionContractSchema.parse(
    JSON.parse(contractBytes.toString('utf8')),
  );
  const sourceBytes = readVerified(
    programRoot,
    contract.source.path,
    contract.source.sha256,
  );
  readVerified(
    programRoot,
    contract.parent_manifest.path,
    contract.parent_manifest.sha256,
  );
  readVerifiedLedger(
    programRoot,
    contract.source_ledger.path,
    contract.source_ledger.sha256,
  );
  readVerifiedLedger(
    programRoot,
    contract.change_ledger.path,
    contract.change_ledger.sha256,
  );

  const ledgers = buildGrammarSourceEdition(
    sourceBytes.toString('utf8'),
    contract,
  );
  const editionRelativeRoot = `grammar/editions/${contract.edition_id}`;
  const editionRoot = resolveWithin(programRoot, editionRelativeRoot);
  const contents = {
    pages: jsonLines(ledgers.pages),
    claims: jsonLines(ledgers.claims),
    examples: jsonLines(ledgers.examples),
    paradigms: jsonLines(ledgers.paradigms),
    reviewQueue: jsonLines(ledgers.reviewQueue),
  };
  const components = {
    pages: {
      path: `${editionRelativeRoot}/page-index.jsonl`,
      sha256: sha256Bytes(contents.pages),
      rows: ledgers.pages.length,
    },
    claims: {
      path: `${editionRelativeRoot}/claims.jsonl`,
      sha256: sha256Bytes(contents.claims),
      rows: ledgers.claims.length,
    },
    examples: {
      path: `${editionRelativeRoot}/examples.jsonl`,
      sha256: sha256Bytes(contents.examples),
      rows: ledgers.examples.length,
    },
    paradigms: {
      path: `${editionRelativeRoot}/paradigms.jsonl`,
      sha256: sha256Bytes(contents.paradigms),
      rows: ledgers.paradigms.length,
    },
    reviewQueue: {
      path: `${editionRelativeRoot}/review-queue.jsonl`,
      sha256: sha256Bytes(contents.reviewQueue),
      rows: ledgers.reviewQueue.length,
    },
  };
  const edition = {
    schema_version: 1,
    edition_id: contract.edition_id,
    created_at_utc: contract.created_at_utc,
    parent_edition_id: contract.parent_edition_id,
    status: contract.status,
    scope: contract.scope,
    method_contract: {
      edition_contract_path: contractRelativePath,
      edition_contract_sha256: sha256Bytes(contractBytes),
    },
    source: {
      source_id: contract.source.source_id,
      path: contract.source.path,
      sha256: contract.source.sha256,
      source_rendering: contract.source.source_rendering,
      declared_page_count: contract.source.declared_page_count,
      source_line_count: ledgers.sourceLineCount,
      training_use: contract.source.training_use,
    },
    source_ledger_sha256: contract.source_ledger.sha256,
    change_ledger_sha256: contract.change_ledger.sha256,
    components,
    counts: {
      page_index_rows: ledgers.pages.length,
      source_verified_candidate_claims: ledgers.claims.length,
      curriculum_example_candidates: ledgers.examples.length,
      source_structured_candidate_paradigms: ledgers.paradigms.length,
      pending_review_items: ledgers.reviewQueue.length,
      accepted_claims: 0,
      accepted_examples: 0,
      accepted_paradigms: 0,
      training_eligible_rows: 0,
    },
    evidence_policy: {
      source_spans:
        'line-bounded and SHA-256 verified against frozen source bytes',
      naturalness:
        'curriculum examples are pedagogical models, not natural-corpus evidence',
      interlinear_analysis:
        'none; no segmentation or morpheme gloss is inferred',
      confirmation:
        'independent descriptive source or qualified review required',
    },
    accepted_change_ids: contract.change_ledger.accepted_change_ids,
    supersedes: [contract.parent_edition_id],
    release_status: contract.release_status,
    claim_limit:
      'This edition inventories explicit statements and examples in one unratified curriculum rendering. It accepts no grammar rule, paradigm, natural sentence, training row, or free-form translation claim.',
  };
  const editionContent = `${JSON.stringify(edition, null, 2)}\n`;
  const editionManifestRelativePath = `${editionRelativeRoot}/EDITION.json`;
  const editionManifestSha256 = sha256Bytes(editionContent);
  const currentPointer = {
    schema_version: 1,
    artifact: 'grammar',
    current_edition_id: contract.edition_id,
    manifest_path: editionManifestRelativePath,
    manifest_sha256: editionManifestSha256,
    updated_at_utc: contract.created_at_utc,
    supersedes_pointer_sha256: contract.supersedes_pointer_sha256,
    release_status: contract.release_status,
  };
  const currentPointerContent = `${JSON.stringify(currentPointer, null, 2)}\n`;

  if (process.argv.includes('--write')) {
    writeImmutable(path.join(editionRoot, 'page-index.jsonl'), contents.pages);
    writeImmutable(path.join(editionRoot, 'claims.jsonl'), contents.claims);
    writeImmutable(path.join(editionRoot, 'examples.jsonl'), contents.examples);
    writeImmutable(
      path.join(editionRoot, 'paradigms.jsonl'),
      contents.paradigms,
    );
    writeImmutable(
      path.join(editionRoot, 'review-queue.jsonl'),
      contents.reviewQueue,
    );
    writeImmutable(path.join(editionRoot, 'EDITION.json'), editionContent);
    writeMutablePointer(
      resolveWithin(programRoot, contract.current_pointer_path),
      currentPointerContent,
      contract.supersedes_pointer_sha256,
    );
  }

  console.log(
    JSON.stringify(
      {
        mode: process.argv.includes('--write') ? 'written' : 'validated_only',
        editionId: contract.edition_id,
        editionManifestPath: editionManifestRelativePath,
        editionManifestSha256,
        currentPointerPath: contract.current_pointer_path,
        currentPointerSha256: sha256Bytes(currentPointerContent),
        sourceLineCount: ledgers.sourceLineCount,
        components,
        counts: edition.counts,
      },
      null,
      2,
    ),
  );
}

main();
