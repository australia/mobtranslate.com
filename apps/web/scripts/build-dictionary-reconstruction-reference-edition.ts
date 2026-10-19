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
  buildDictionaryReconstructionReferenceEdition,
  DictionaryReconstructionReferenceContractSchema,
} from '../lib/research/dictionaryReconstructionReferenceEdition';

const ReferenceSchema = z.object({
  path: z.string().min(1),
  sha256: z.string().regex(/^[0-9a-f]{64}$/u),
  rows: z.number().int().nonnegative(),
});

const CensusOutputReferenceSchema = ReferenceSchema.extend({
  rows: z.number().int().nonnegative().nullable(),
});

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
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative))
    throw new Error(
      `path escapes or aliases the program root: ${relativePath}`,
    );
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

function parseJsonLines(bytes: Buffer): Array<Record<string, unknown>> {
  return bytes
    .toString('utf8')
    .split(/\r?\n/u)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

function jsonLines(rows: unknown[]): string {
  return rows.length === 0
    ? '\n'
    : `${rows.map((row) => canonicalJson(row)).join('\n')}\n`;
}

function prettyJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
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

function writePointer(
  filePath: string,
  content: string,
  expectedPreviousHash: string,
): void {
  const previous = readFileSync(filePath);
  if (previous.toString('utf8') === content) return;
  if (sha256(previous) !== expectedPreviousHash)
    throw new Error('current pointer does not match supersedes hash');
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
      'usage: tsx scripts/build-dictionary-reconstruction-reference-edition.ts --program-root PATH --contract RELATIVE_PATH [--write]',
    );
  const programRoot = path.resolve(rootArgument);
  const contractPath = resolveWithin(programRoot, contractRelativePath);
  const contractBytes = readFileSync(contractPath);
  const contract = DictionaryReconstructionReferenceContractSchema.parse(
    JSON.parse(contractBytes.toString('utf8')),
  );

  const parentBytes = readVerified(programRoot, contract.parent_manifest);
  const parentManifest = z
    .object({ components: z.record(z.string(), ReferenceSchema) })
    .passthrough()
    .parse(JSON.parse(parentBytes.toString('utf8')));
  const inheritedComponents = Object.fromEntries(
    Object.entries(parentManifest.components).map(([key, reference]) => {
      const bytes = readVerified(programRoot, reference);
      const rows = parseJsonLines(bytes);
      if (rows.length !== reference.rows)
        throw new Error(`row count mismatch for ${reference.path}`);
      return [key, { reference, bytes }];
    }),
  );

  const censusManifestBytes = readVerified(programRoot, {
    path: contract.candidate_census.manifest_path,
    sha256: contract.candidate_census.manifest_sha256,
  });
  const censusManifest = z
    .object({
      outputs: z.record(z.string(), CensusOutputReferenceSchema),
    })
    .passthrough()
    .parse(JSON.parse(censusManifestBytes.toString('utf8')));
  const recordsReference =
    censusManifest.outputs[contract.candidate_census.records_component_key];
  if (!recordsReference) throw new Error('census records component is absent');
  if (recordsReference.rows === null)
    throw new Error('census records component must declare a row count');
  const censusRecordBytes = readVerified(programRoot, recordsReference);
  const censusRecords = parseJsonLines(censusRecordBytes);
  if (censusRecords.length !== recordsReference.rows)
    throw new Error('census record count does not match its manifest');

  const sourceVerification = verifyAppendOnlyLedger(
    readFileSync(resolveWithin(programRoot, contract.source_ledger.path)),
    contract.source_ledger.sha256,
  );
  const changeVerification = verifyAppendOnlyLedger(
    readFileSync(resolveWithin(programRoot, contract.change_ledger.path)),
    contract.change_ledger.sha256,
  );

  const result = buildDictionaryReconstructionReferenceEdition({
    contractValue: contract,
    parentManifestValue: JSON.parse(parentBytes.toString('utf8')),
    censusManifestValue: JSON.parse(censusManifestBytes.toString('utf8')),
    censusRecords,
    sourceLedgerRows: parseJsonLines(sourceVerification.verifiedBytes),
    changeLedgerRows: parseJsonLines(changeVerification.verifiedBytes),
  });

  const editionRelativeRoot = `dictionary/editions/${contract.edition_id}`;
  const inheritedOutput = Object.fromEntries(
    Object.entries(inheritedComponents).map(([key, value]) => {
      const fileName = path.basename(value.reference.path);
      return [
        key,
        {
          path: `${editionRelativeRoot}/${fileName}`,
          sha256: sha256(value.bytes),
          rows: value.reference.rows,
          bytes: value.bytes,
        },
      ];
    }),
  );
  const newRows = {
    reconstructionReferenceDispositions: {
      fileName: 'reconstruction-reference-dispositions.jsonl',
      rows: result.dispositions,
    },
    reconstructionContextGroups: {
      fileName: 'reconstruction-context-groups.jsonl',
      rows: result.contextGroups,
    },
    reconstructionPromptGroups: {
      fileName: 'reconstruction-prompt-groups.jsonl',
      rows: result.promptGroups,
    },
  } as const;
  const newOutput = Object.fromEntries(
    Object.entries(newRows).map(([key, value]) => {
      const content = jsonLines(value.rows);
      return [
        key,
        {
          path: `${editionRelativeRoot}/${value.fileName}`,
          sha256: sha256(content),
          rows: value.rows.length,
          content,
        },
      ];
    }),
  );
  const components = Object.fromEntries(
    [...Object.entries(inheritedOutput), ...Object.entries(newOutput)].map(
      ([key, value]) => [
        key,
        { path: value.path, sha256: value.sha256, rows: value.rows },
      ],
    ),
  );
  const reportContent = prettyJson({
    schema_version: 1,
    edition_id: contract.edition_id,
    ...result.report,
    claim_limit: contract.claim_limit,
  });
  const report = {
    path: `${editionRelativeRoot}/REFERENCE-REPORT.json`,
    sha256: sha256(reportContent),
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
    parent_manifest: contract.parent_manifest,
    candidate_census: contract.candidate_census,
    source_ledger: {
      path: contract.source_ledger.path,
      historical_sha256: contract.source_ledger.sha256,
      current_sha256: sourceVerification.currentSha256,
      verification_mode: sourceVerification.verificationMode,
    },
    change_ledger: {
      path: contract.change_ledger.path,
      historical_sha256: contract.change_ledger.sha256,
      current_sha256: changeVerification.currentSha256,
      verification_mode: changeVerification.verificationMode,
      issuing_change_id: contract.change_ledger.issuing_change_id,
      accepted_change_ids: contract.change_ledger.accepted_change_ids,
    },
    components,
    reference_report: report,
    counts: {
      ...parentManifest.counts,
      internalReconstructionReferenceMemberships: result.dispositions.length,
      internalSourceContextReferenceGroups: result.contextGroups.length,
      internalPromptReferenceGroups: result.promptGroups.length,
      acceptedLexicalRows: 0,
      acceptedEntries: 0,
      acceptedSenses: 0,
      acceptedForms: 0,
      trainingEligibleRows: 0,
    },
    reference_policy: contract.reference_policy,
    accepted_change_ids: contract.change_ledger.accepted_change_ids,
    supersedes: [contract.parent_edition_id],
    release_status: contract.release_status,
    claim_limit: contract.claim_limit,
  };
  const editionContent = prettyJson(edition);
  const editionManifestPath = `${editionRelativeRoot}/EDITION.json`;
  const editionManifestSha256 = sha256(editionContent);
  const pointer = {
    schema_version: 1,
    artifact: 'dictionary',
    current_edition_id: contract.edition_id,
    manifest_path: editionManifestPath,
    manifest_sha256: editionManifestSha256,
    updated_at_utc: contract.created_at_utc,
    supersedes_pointer_sha256: contract.supersedes_pointer_sha256,
    release_status: contract.release_status,
  };
  const pointerContent = prettyJson(pointer);

  if (process.argv.includes('--write')) {
    for (const value of Object.values(inheritedOutput))
      writeImmutable(resolveWithin(programRoot, value.path), value.bytes);
    for (const value of Object.values(newOutput))
      writeImmutable(resolveWithin(programRoot, value.path), value.content);
    writeImmutable(resolveWithin(programRoot, report.path), reportContent);
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
    prettyJson({
      mode: process.argv.includes('--write')
        ? 'written_or_verified_identical'
        : 'validated_only',
      editionId: contract.edition_id,
      editionManifestPath,
      editionManifestSha256,
      currentPointerSha256: sha256(pointerContent),
      counts: edition.counts,
      report: result.report,
      components,
    }),
  );
}

void main();
