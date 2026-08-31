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
import { extendReviewedCheckpointState } from '../lib/research/reviewedCheckpoint';

const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);

const ContractSchema = z
  .object({
    schema_version: z.literal(1),
    edition_id: z.string().min(1),
    parent_edition_id: z.string().min(1),
    created_at_utc: z.string().datetime(),
    status: z.string().min(1),
    scope: z.record(z.string(), z.unknown()),
    parent_manifest: z.object({
      path: z.string().min(1),
      sha256: Sha256Schema,
    }),
    source_ledger: z.object({ path: z.string().min(1), sha256: Sha256Schema }),
    change_ledger: z.object({
      path: z.string().min(1),
      sha256: Sha256Schema,
      issuing_change_id: z.string().min(1),
      accepted_change_ids: z.array(z.string()),
    }),
    component_inheritance: z.object({
      mode: z.literal('exact_parent_component_aliases'),
      parent_component_count: z.number().int().positive(),
      changed_component_count: z.literal(0),
      require_matching_path_sha256_and_rows: z.literal(true),
    }),
    expected_counts: z.record(z.string(), z.number().int().nonnegative()),
    current_pointer_path: z.string().min(1),
    supersedes_pointer_sha256: Sha256Schema,
    release_status: z.string().min(1),
    claim_limit: z.string().min(1),
  })
  .passthrough();

type JsonObject = Record<string, unknown>;

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

function sha256Bytes(bytes: string | Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function readVerified(
  root: string,
  relativePath: string,
  expectedSha256: string,
): Buffer {
  const bytes = readFileSync(resolveWithin(root, relativePath));
  const actualSha256 = sha256Bytes(bytes);
  if (actualSha256 !== expectedSha256)
    throw new Error(
      `hash mismatch for ${relativePath}: expected ${expectedSha256}, found ${actualSha256}`,
    );
  return bytes;
}

function parseJsonLines(bytes: Buffer, relativePath: string): JsonObject[] {
  const text = bytes.toString('utf8');
  if (!text.endsWith('\n'))
    throw new Error(`append-only ledger must end with newline: ${relativePath}`);
  return text
    .split('\n')
    .filter(Boolean)
    .map((line, index) => {
      const value = JSON.parse(line) as unknown;
      if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error(`invalid object at ${relativePath}:${index + 1}`);
      return value as JsonObject;
    });
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
  expectedCurrentSha256: string,
): void {
  const existing = readFileSync(filePath);
  if (existing.toString('utf8') === content) return;
  const actualSha256 = sha256Bytes(existing);
  if (actualSha256 !== expectedCurrentSha256)
    throw new Error(
      `current pointer hash mismatch: expected ${expectedCurrentSha256}, found ${actualSha256}`,
    );
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  try {
    writeFileSync(temporaryPath, content, { encoding: 'utf8', mode: 0o664 });
    renameSync(temporaryPath, filePath);
  } finally {
    if (existsSync(temporaryPath)) rmSync(temporaryPath);
  }
}

function object(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${label} must be an object`);
  return value as JsonObject;
}

function checkpointEntry(contract: JsonObject): [string, JsonObject] {
  const entries = Object.entries(contract).filter(([key, value]) =>
    key.endsWith('_checkpoint') && value && typeof value === 'object',
  );
  if (entries.length !== 1)
    throw new Error(`contract must contain exactly one *_checkpoint object`);
  return [entries[0][0], object(entries[0][1], entries[0][0])];
}

function verifyCheckpointPaths(root: string, value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) verifyCheckpointPaths(root, item);
    return;
  }
  if (!value || typeof value !== 'object') return;
  const record = value as JsonObject;
  for (const [key, item] of Object.entries(record)) {
    if (key.endsWith('_path') && typeof item === 'string') {
      const expectedKey = `${key.slice(0, -5)}_sha256`;
      const expected = record[expectedKey];
      if (typeof expected === 'string' && /^[0-9a-f]{64}$/.test(expected))
        readVerified(root, item, expected);
    }
    verifyCheckpointPaths(root, item);
  }
}

function ledgerHashFromParent(parent: JsonObject, key: string): string {
  const ledger = object(parent[key], `parent ${key}`);
  const hash = ledger.current_sha256 ?? ledger.sha256;
  if (typeof hash !== 'string' || !/^[0-9a-f]{64}$/.test(hash))
    throw new Error(`parent ${key} has no usable current hash`);
  return hash;
}

function verifyParentComponents(
  root: string,
  parent: JsonObject,
  expectedCount: number,
): JsonObject {
  const components = object(parent.components, 'parent components');
  if (Object.keys(components).length !== expectedCount)
    throw new Error(
      `parent component count mismatch: expected ${expectedCount}, found ${Object.keys(components).length}`,
    );
  for (const [name, rawComponent] of Object.entries(components)) {
    const component = object(rawComponent, `parent component ${name}`);
    const componentPath = component.path;
    const componentSha256 = component.sha256;
    const expectedRows = component.rows;
    if (
      typeof componentPath !== 'string' ||
      typeof componentSha256 !== 'string' ||
      typeof expectedRows !== 'number'
    )
      throw new Error(`malformed parent component ${name}`);
    const bytes = readVerified(root, componentPath, componentSha256);
    const actualRows = bytes
      .toString('utf8')
      .split('\n')
      .filter(Boolean).length;
    if (actualRows !== expectedRows)
      throw new Error(
        `row mismatch for ${componentPath}: expected ${expectedRows}, found ${actualRows}`,
      );
  }
  return components;
}

function verifyExpectedComponentRows(
  components: JsonObject,
  rawExpectedRows: unknown,
): void {
  if (rawExpectedRows === undefined) return;
  const expectedRows = object(rawExpectedRows, 'expected component rows');
  for (const [componentKey, expected] of Object.entries(expectedRows)) {
    if (!Number.isInteger(expected) || (expected as number) < 0)
      throw new Error(`invalid expected row count for component ${componentKey}`);
    const component = object(
      components[componentKey],
      `expected component ${componentKey}`,
    );
    if (component.rows !== expected)
      throw new Error(
        `component row mismatch for ${componentKey}: expected ${expected}, found ${String(component.rows)}`,
      );
  }
}

function evidencePolicy(
  contract: JsonObject,
  parentEditionId: string,
): JsonObject {
  const declared = contract.evidence_policy;
  const policy =
    declared === undefined
      ? {
          original_pdf_verification:
            'The archived original PDF identity, extracted page text, source-rendering alignment, and every candidate evidence span are hash-bound and fail-closed.',
          page_metadata:
            'Physical and printed page corrections are provenance metadata only and do not alter or accept a linguistic interpretation.',
          acceptance:
            'No lexical or grammatical claim, example, benchmark reference, synthetic row, or training row is accepted by source-fidelity verification alone.',
        }
      : object(declared, 'evidence policy');
  return {
    ...policy,
    component_inheritance: `Every component path, hash, and row count aliases the ${parentEditionId} parent exactly; zero component bytes changed.`,
  };
}

async function main(): Promise<void> {
  const rootArgument = flagValue('--program-root');
  const contractRelativePath = flagValue('--contract');
  const artifact = flagValue('--artifact');
  if (
    !rootArgument ||
    !contractRelativePath ||
    (artifact !== 'dictionary' && artifact !== 'grammar')
  )
    throw new Error(
      'usage: tsx scripts/build-reviewed-no-change-edition.ts --artifact dictionary|grammar --program-root PATH --contract RELATIVE_PATH [--write]',
    );

  const programRoot = path.resolve(rootArgument);
  const contractBytes = readFileSync(
    resolveWithin(programRoot, contractRelativePath),
  );
  const contract = ContractSchema.parse(
    JSON.parse(contractBytes.toString('utf8')),
  );
  if (!contract.current_pointer_path.startsWith(`${artifact}/`))
    throw new Error('artifact does not match current pointer path');
  const [checkpointKey, checkpoint] = checkpointEntry(contract);
  verifyCheckpointPaths(programRoot, checkpoint);

  const parentBytes = readVerified(
    programRoot,
    contract.parent_manifest.path,
    contract.parent_manifest.sha256,
  );
  const parent = object(
    JSON.parse(parentBytes.toString('utf8')),
    'parent manifest',
  );
  if (parent.edition_id !== contract.parent_edition_id)
    throw new Error('parent edition ID does not match contract');
  const components = verifyParentComponents(
    programRoot,
    parent,
    contract.component_inheritance.parent_component_count,
  );
  verifyExpectedComponentRows(components, contract.expected_component_rows);
  const sourceLedgerBytes = readVerified(
    programRoot,
    contract.source_ledger.path,
    contract.source_ledger.sha256,
  );
  const sourceLedger = parseJsonLines(
    sourceLedgerBytes,
    contract.source_ledger.path,
  );
  const sourceIds = checkpoint.source_ids;
  if (Array.isArray(sourceIds)) {
    const available = new Set(sourceLedger.map((row) => row.source_id));
    for (const sourceId of sourceIds)
      if (typeof sourceId !== 'string' || !available.has(sourceId))
        throw new Error(`checkpoint source is absent from source ledger: ${sourceId}`);
  }
  const changeLedgerBytes = readVerified(
    programRoot,
    contract.change_ledger.path,
    contract.change_ledger.sha256,
  );
  const changeLedger = parseJsonLines(
    changeLedgerBytes,
    contract.change_ledger.path,
  );
  const issuingChanges = changeLedger.filter(
    (row) => row.change_id === contract.change_ledger.issuing_change_id,
  );
  if (issuingChanges.length !== 1)
    throw new Error('issuing change ID is not unique in change ledger');
  if (issuingChanges[0].new_edition_id !== contract.edition_id)
    throw new Error('issuing change does not identify the contracted edition');

  const { counts, reviewRouting } = extendReviewedCheckpointState({
    parentCounts: object(parent.counts, 'parent counts'),
    parentReviewRouting: object(
      parent.review_routing ?? {},
      'parent review routing',
    ),
    checkpoint,
  });
  const parentSourceHash = ledgerHashFromParent(parent, 'source_ledger');
  const parentChangeHash = ledgerHashFromParent(parent, 'change_ledger');
  const edition = {
    schema_version: 1,
    edition_id: contract.edition_id,
    created_at_utc: contract.created_at_utc,
    parent_edition_id: contract.parent_edition_id,
    status: contract.status,
    scope: contract.scope,
    method_contract: {
      path: contractRelativePath,
      sha256: sha256Bytes(contractBytes),
    },
    parent_manifest: contract.parent_manifest,
    [checkpointKey]: checkpoint,
    source_ledger: {
      path: contract.source_ledger.path,
      historical_sha256: parentSourceHash,
      current_sha256: contract.source_ledger.sha256,
      verification_mode: 'exact_file',
    },
    change_ledger: {
      path: contract.change_ledger.path,
      historical_sha256: parentChangeHash,
      current_sha256: contract.change_ledger.sha256,
      verification_mode: 'exact_file',
      issuing_change_id: contract.change_ledger.issuing_change_id,
      accepted_change_ids: contract.change_ledger.accepted_change_ids,
    },
    component_inheritance: {
      mode: contract.component_inheritance.mode,
      parent_manifest_sha256: contract.parent_manifest.sha256,
      changed_component_count: 0,
    },
    components,
    counts,
    review_routing: reviewRouting,
    evidence_policy: evidencePolicy(contract, contract.parent_edition_id),
    accepted_change_ids: contract.change_ledger.accepted_change_ids,
    supersedes: [contract.parent_edition_id],
    release_status: contract.release_status,
    claim_limit: contract.claim_limit,
  };
  const editionContent = `${JSON.stringify(edition, null, 2)}\n`;
  const editionRelativePath = `${artifact}/editions/${contract.edition_id}/EDITION.json`;
  const editionSha256 = sha256Bytes(editionContent);
  const currentPointer = {
    schema_version: 1,
    artifact,
    current_edition_id: contract.edition_id,
    manifest_path: editionRelativePath,
    manifest_sha256: editionSha256,
    updated_at_utc: contract.created_at_utc,
    supersedes_pointer_sha256: contract.supersedes_pointer_sha256,
    release_status: contract.release_status,
  };
  const currentPointerContent = `${JSON.stringify(currentPointer, null, 2)}\n`;

  if (process.argv.includes('--write')) {
    writeImmutable(
      resolveWithin(programRoot, editionRelativePath),
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
        artifact,
        editionId: contract.edition_id,
        editionManifestPath: editionRelativePath,
        editionManifestSha256: editionSha256,
        currentPointerPath: contract.current_pointer_path,
        currentPointerSha256: sha256Bytes(currentPointerContent),
        componentCount: Object.keys(components).length,
        changedComponentCount: 0,
        counts,
      },
      null,
      2,
    ),
  );
}

main();
