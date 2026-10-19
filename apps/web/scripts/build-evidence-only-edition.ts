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
import { z } from 'zod';
import { verifyAppendOnlyLedger } from '../lib/research/appendOnlyLedger';
import { canonicalJson } from '../lib/research/dictionarySourceCensus';
import {
  buildEvidenceOnlyEdition,
  ComponentReferenceSchema,
  EvidenceOnlyEditionContractSchema,
} from '../lib/research/evidenceOnlyEdition';

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

function readVerified(
  root: string,
  reference: { path: string; sha256: string },
): Buffer {
  const bytes = readFileSync(resolveWithin(root, reference.path));
  const actual = sha256(bytes);
  if (actual !== reference.sha256)
    throw new Error(
      `hash mismatch for ${reference.path}: ${actual} != ${reference.sha256}`,
    );
  return bytes;
}

function parseJsonLines(bytes: Buffer, label: string): Array<Record<string, unknown>> {
  const text = bytes.toString('utf8');
  if (!text.endsWith('\n')) throw new Error(`${label} must end with newline`);
  return text
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

function jsonLines(rows: unknown[]): string {
  return rows.length === 0
    ? '\n'
    : `${rows.map((row) => canonicalJson(row)).join('\n')}\n`;
}

function writeImmutable(filePath: string, content: string): void {
  if (existsSync(filePath)) {
    if (readFileSync(filePath, 'utf8') !== content)
      throw new Error(`refusing to rewrite immutable artifact: ${filePath}`);
    return;
  }
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, { encoding: 'utf8', mode: 0o664 });
}

function writePointer(
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
  const temporary = `${filePath}.tmp-${process.pid}`;
  try {
    writeFileSync(temporary, content, { encoding: 'utf8', mode: 0o664 });
    renameSync(temporary, filePath);
  } finally {
    if (existsSync(temporary)) rmSync(temporary);
  }
}

async function main(): Promise<void> {
  const rootArgument = flagValue('--program-root');
  const contractRelativePath = flagValue('--contract');
  if (!rootArgument || !contractRelativePath)
    throw new Error(
      'usage: tsx scripts/build-evidence-only-edition.ts --program-root PATH --contract RELATIVE_PATH [--write]',
    );
  const programRoot = path.resolve(rootArgument);
  const contractBytes = readFileSync(
    resolveWithin(programRoot, contractRelativePath),
  );
  const contract = EvidenceOnlyEditionContractSchema.parse(
    JSON.parse(contractBytes.toString('utf8')),
  );
  if (!contract.current_pointer_path.startsWith(`${contract.artifact}/`))
    throw new Error('current pointer does not match artifact');

  const parentManifest = JSON.parse(
    readVerified(programRoot, contract.parent_manifest).toString('utf8'),
  ) as Record<string, unknown>;
  const parentComponents = z
    .record(z.string(), ComponentReferenceSchema)
    .parse(parentManifest.components);
  const parentRowsByComponent = new Map<
    string,
    Array<Record<string, unknown>>
  >();
  for (const [key, reference] of Object.entries(parentComponents)) {
    const rows = parseJsonLines(
      readVerified(programRoot, reference),
      reference.path,
    );
    if (rows.length !== reference.rows)
      throw new Error(`row count mismatch for ${reference.path}`);
    parentRowsByComponent.set(key, rows);
  }

  const inventoryManifest = JSON.parse(
    readVerified(programRoot, {
      path: contract.evidence_inventory.manifest_path,
      sha256: contract.evidence_inventory.manifest_sha256,
    }).toString('utf8'),
  ) as Record<string, unknown>;
  const inventoryComponents = z
    .record(z.string(), ComponentReferenceSchema)
    .parse(inventoryManifest.components);
  const inventoryRowsByComponent = new Map<
    string,
    Array<Record<string, unknown>>
  >();
  for (const binding of contract.evidence_inventory.component_bindings) {
    const reference = inventoryComponents[binding.inventory_component_key];
    if (!reference)
      throw new Error(
        `inventory component is absent: ${binding.inventory_component_key}`,
      );
    const rows = parseJsonLines(
      readVerified(programRoot, reference),
      reference.path,
    );
    if (rows.length !== reference.rows)
      throw new Error(`row count mismatch for ${reference.path}`);
    inventoryRowsByComponent.set(binding.inventory_component_key, rows);
  }

  const sourceLedgerVerification = verifyAppendOnlyLedger(
    readFileSync(resolveWithin(programRoot, contract.source_ledger.path)),
    contract.source_ledger.sha256,
  );
  const changeLedgerVerification = verifyAppendOnlyLedger(
    readFileSync(resolveWithin(programRoot, contract.change_ledger.path)),
    contract.change_ledger.sha256,
  );
  const result = buildEvidenceOnlyEdition({
    contractValue: contract,
    parentManifestValue: parentManifest,
    inventoryManifestValue: inventoryManifest,
    parentRowsByComponent,
    inventoryRowsByComponent,
    changeLedgerRows: parseJsonLines(
      changeLedgerVerification.verifiedBytes,
      contract.change_ledger.path,
    ),
  });

  const editionRoot = `${contract.artifact}/editions/${contract.edition_id}`;
  const outputFilenameByComponent = new Map<string, string>([
    ['reviewQueue', 'review-queue.jsonl'],
  ]);
  for (const operation of contract.component_appends)
    outputFilenameByComponent.set(
      operation.parent_component_key,
      operation.output_filename,
    );
  if (result.evidenceComponents)
    outputFilenameByComponent.set(
      'evidenceComponents',
      'evidence-components.jsonl',
    );
  const outputFilenames = [...outputFilenameByComponent.values()];
  if (new Set(outputFilenames).size !== outputFilenames.length)
    throw new Error('generated component output filenames collide');

  const components = { ...result.components };
  const generatedContents = new Map<string, string>();
  for (const [componentKey, rows] of result.generatedRows) {
    const filename = outputFilenameByComponent.get(componentKey);
    if (!filename)
      throw new Error(`no output filename for generated component ${componentKey}`);
    const content = jsonLines(rows);
    generatedContents.set(componentKey, content);
    components[componentKey] = {
      path: `${editionRoot}/${filename}`,
      sha256: sha256(content),
      rows: rows.length,
    };
  }

  const parentCounts =
    parentManifest.counts &&
    typeof parentManifest.counts === 'object' &&
    !Array.isArray(parentManifest.counts)
      ? (parentManifest.counts as Record<string, unknown>)
      : {};
  const priorBatches =
    typeof parentCounts.scholarlySourceEvidenceBatches === 'number'
      ? parentCounts.scholarlySourceEvidenceBatches
      : 0;
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
    parent_manifest: contract.parent_manifest,
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
    component_inheritance: {
      parent_component_count: Object.keys(parentComponents).length,
      appended_component_keys: contract.component_appends.map(
        (row) => row.parent_component_key,
      ),
      added_inventory_component_keys:
        contract.evidence_inventory.component_bindings.map(
          (row) => row.edition_component_key,
        ),
      unchanged_components_alias_parent_exactly: true,
    },
    components,
    counts: {
      ...parentCounts,
      scholarlySourceEvidenceBatches: priorBatches + 1,
      inheritedReviewItems: result.counts.inheritedReviewItems,
      addedReviewItems: result.counts.addedReviewItems,
      totalReviewItems: result.counts.totalReviewItems,
      inheritedEvidenceComponents:
        result.counts.inheritedEvidenceComponents,
      addedEvidenceComponents: result.counts.addedEvidenceComponents,
      totalEvidenceComponents: result.counts.totalEvidenceComponents,
      appendedRowsByComponent: result.counts.appendedRowsByComponent,
      scholarlyEvidenceRowsAdded: result.counts.addedEvidenceRows,
      newAcceptedRows: 0,
      trainingEligibleRows: 0,
    },
    evidence_policy: contract.evidence_policy,
    accepted_change_ids: contract.change_ledger.accepted_change_ids,
    supersedes: [contract.parent_edition_id],
    release_status: contract.release_status,
    claim_limit: contract.claim_limit,
  };
  const editionContent = `${JSON.stringify(edition, null, 2)}\n`;
  const editionManifestPath = `${editionRoot}/EDITION.json`;
  const editionManifestSha256 = sha256(editionContent);
  const pointer = {
    schema_version: 1,
    artifact: contract.artifact,
    current_edition_id: contract.edition_id,
    manifest_path: editionManifestPath,
    manifest_sha256: editionManifestSha256,
    updated_at_utc: contract.created_at_utc,
    supersedes_pointer_sha256: contract.supersedes_pointer_sha256,
    release_status: contract.release_status,
  };
  const pointerContent = `${JSON.stringify(pointer, null, 2)}\n`;

  if (process.argv.includes('--write')) {
    for (const [componentKey, content] of generatedContents) {
      const filename = outputFilenameByComponent.get(componentKey)!;
      writeImmutable(
        resolveWithin(programRoot, `${editionRoot}/${filename}`),
        content,
      );
    }
    writeImmutable(
      resolveWithin(programRoot, editionManifestPath),
      editionContent,
    );
    writePointer(
      resolveWithin(programRoot, contract.current_pointer_path),
      pointerContent,
      contract.supersedes_pointer_sha256,
    );
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        mode: process.argv.includes('--write') ? 'written' : 'validated_only',
        artifact: contract.artifact,
        editionId: contract.edition_id,
        editionManifestPath,
        editionManifestSha256,
        currentPointerSha256: sha256(pointerContent),
        counts: edition.counts,
        components,
      },
      null,
      2,
    )}\n`,
  );
}

void main();
