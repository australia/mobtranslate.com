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
import { verifyAppendOnlyLedger } from '../lib/research/appendOnlyLedger';
import { canonicalJson } from '../lib/research/dictionarySourceCensus';
import {
  buildGrammarEvidenceExpansion,
  GrammarEvidenceExpansionContractSchema,
} from '../lib/research/grammarEvidenceExpansion';

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

function writeMutablePointer(
  filePath: string,
  content: string,
  expectedPreviousHash: string,
): void {
  const previous = readFileSync(filePath);
  if (previous.toString('utf8') === content) return;
  const previousHash = sha256(previous);
  if (previousHash !== expectedPreviousHash)
    throw new Error(
      `current pointer does not match supersedes hash: ${previousHash}`,
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
      'usage: tsx scripts/build-grammar-evidence-expansion.ts --program-root PATH --contract RELATIVE_PATH [--write]',
    );

  const programRoot = path.resolve(rootArgument);
  const contractBytes = readFileSync(
    resolveWithin(programRoot, contractRelativePath),
  );
  const contract = GrammarEvidenceExpansionContractSchema.parse(
    JSON.parse(contractBytes.toString('utf8')),
  );
  const parentManifestBytes = readVerified(
    programRoot,
    contract.parent_edition.manifest_path,
    contract.parent_edition.manifest_sha256,
  );
  const parentManifest = JSON.parse(
    parentManifestBytes.toString('utf8'),
  ) as Record<string, unknown>;
  const parentComponents = (parentManifest.components as Record<
    string,
    { path: string; sha256: string; rows: number }
  >) ?? { missing: { path: '', sha256: '', rows: 0 } };
  for (const component of Object.values(parentComponents))
    readVerified(programRoot, component.path, component.sha256);
  const parentReviewReference = parentComponents.reviewQueue;
  if (!parentReviewReference)
    throw new Error('parent edition has no reviewQueue component');
  const parentReviewRows = parseJsonLines(
    readVerified(
      programRoot,
      parentReviewReference.path,
      parentReviewReference.sha256,
    ),
  );

  const inventoryManifestBytes = readVerified(
    programRoot,
    contract.evidence_inventory.manifest_path,
    contract.evidence_inventory.manifest_sha256,
  );
  const inventoryManifest = JSON.parse(
    inventoryManifestBytes.toString('utf8'),
  ) as Record<string, unknown>;
  const inventoryComponents = inventoryManifest.components as Record<
    string,
    { path: string; sha256: string; rows: number }
  >;
  if (!inventoryComponents)
    throw new Error('evidence inventory has no components');
  const inventoryRowsByComponent = new Map<
    string,
    Array<Record<string, unknown>>
  >();
  for (const key of contract.evidence_inventory.required_component_keys) {
    const component = inventoryComponents[key];
    if (!component)
      throw new Error(`evidence inventory component is absent: ${key}`);
    inventoryRowsByComponent.set(
      key,
      parseJsonLines(
        readVerified(programRoot, component.path, component.sha256),
      ),
    );
  }

  for (const artifact of contract.catalog_artifacts)
    readVerified(programRoot, artifact.path, artifact.sha256);
  const sourceLedgerBytes = readFileSync(
    resolveWithin(programRoot, contract.source_ledger.path),
  );
  const sourceLedgerVerification = verifyAppendOnlyLedger(
    sourceLedgerBytes,
    contract.source_ledger.sha256,
  );
  const changeLedgerBytes = readFileSync(
    resolveWithin(programRoot, contract.change_ledger.path),
  );
  const changeLedgerVerification = verifyAppendOnlyLedger(
    changeLedgerBytes,
    contract.change_ledger.sha256,
  );
  const changeLedgerRows = parseJsonLines(
    changeLedgerVerification.verifiedBytes,
  );

  const result = buildGrammarEvidenceExpansion({
    contractValue: contract,
    parentManifestValue: parentManifest,
    inventoryManifestValue: inventoryManifest,
    parentReviewRows,
    inventoryRowsByComponent,
    changeLedgerRows,
  });
  const editionRelativeRoot = `grammar/editions/${contract.edition_id}`;
  const reviewQueueContent = jsonLines(result.reviewQueue);
  const evidenceComponentsContent = jsonLines(result.evidenceComponents);
  const reviewQueueReference = {
    path: `${editionRelativeRoot}/review-queue.jsonl`,
    sha256: sha256(reviewQueueContent),
    rows: result.reviewQueue.length,
  };
  const evidenceComponentsReference = {
    path: `${editionRelativeRoot}/evidence-components.jsonl`,
    sha256: sha256(evidenceComponentsContent),
    rows: result.evidenceComponents.length,
  };
  const components = {
    assertions: result.inheritedComponents.assertions,
    syntheses: result.inheritedComponents.syntheses,
    conflicts: result.inheritedComponents.conflicts,
    reviewQueue: reviewQueueReference,
    evidenceComponents: evidenceComponentsReference,
    ...Object.fromEntries(
      contract.evidence_inventory.required_component_keys.map((key) => [
        key,
        result.inventoryComponents[key],
      ]),
    ),
  };
  const edition = {
    schema_version: 1,
    edition_id: contract.edition_id,
    created_at_utc: contract.created_at_utc,
    parent_edition_id: contract.parent_edition_id,
    status: contract.status,
    scope: contract.scope,
    method_contract: {
      path: contractRelativePath,
      sha256: sha256(contractBytes),
    },
    parent_edition: contract.parent_edition,
    evidence_inventory: contract.evidence_inventory,
    source_ledger: {
      path: contract.source_ledger.path,
      historical_sha256: contract.source_ledger.sha256,
      current_sha256: sourceLedgerVerification.currentSha256,
      verification_mode: sourceLedgerVerification.verificationMode,
    },
    change_ledger: {
      path: contract.change_ledger.path,
      historical_sha256: contract.change_ledger.sha256,
      current_sha256: changeLedgerVerification.currentSha256,
      verification_mode: changeLedgerVerification.verificationMode,
      issuing_change_id: contract.change_ledger.issuing_change_id,
      accepted_change_ids: contract.change_ledger.accepted_change_ids,
    },
    catalog_artifacts: contract.catalog_artifacts,
    components,
    counts: {
      inherited_source_assertions: result.inheritedComponents.assertions.rows,
      inherited_cross_source_syntheses:
        result.inheritedComponents.syntheses.rows,
      inherited_accepted_for_analysis_syntheses:
        result.counts.acceptedForAnalysisSyntheses,
      unresolved_conflicts: result.counts.unresolvedConflicts,
      douglas_table_blocks: result.inventoryValidation.table_blocks,
      douglas_morphotactic_candidates:
        result.inventoryValidation.morphotactic_statements,
      douglas_numbered_examples: result.inventoryValidation.numbered_examples,
      douglas_numbered_example_occurrences:
        result.inventoryValidation.numbered_example_occurrences,
      curated_review_examples: result.inventoryValidation.curated_examples,
      inherited_review_items: result.counts.inheritedReviewItems,
      added_review_items: result.counts.addedReviewItems,
      total_review_items: result.counts.totalReviewItems,
      new_accepted_rows: result.counts.newAcceptedRows,
      training_eligible_rows: result.counts.trainingEligibleRows,
    },
    supersedes: [contract.parent_edition_id],
    release_status: contract.release_status,
    claim_limit:
      'This edition expands auditable evidence and review coverage. It preserves all prior conflicts, accepts no new linguistic form or rule, and authorizes no synthetic generation, benchmark reference, model training, or public translation claim.',
  };
  const editionContent = `${JSON.stringify(edition, null, 2)}\n`;
  const editionManifestRelativePath = `${editionRelativeRoot}/EDITION.json`;
  const editionManifestSha256 = sha256(editionContent);
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
    writeImmutable(
      resolveWithin(programRoot, reviewQueueReference.path),
      reviewQueueContent,
    );
    writeImmutable(
      resolveWithin(programRoot, evidenceComponentsReference.path),
      evidenceComponentsContent,
    );
    writeImmutable(
      resolveWithin(programRoot, editionManifestRelativePath),
      editionContent,
    );
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
        currentPointerSha256: sha256(currentPointerContent),
        components,
        counts: edition.counts,
      },
      null,
      2,
    ),
  );
}

main();
