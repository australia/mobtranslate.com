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
import { buildHistoricalDictionaryEdition } from '../lib/research/historicalDictionaryEdition';

const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const ArtifactSchema = z.object({
  path: z.string().min(1),
  sha256: Sha256Schema,
});
const ContractSchema = z.object({
  schema_version: z.literal(1),
  edition_id: z.string().regex(/^[a-z0-9][a-z0-9.-]*$/),
  parent_edition_id: z.string().min(1),
  created_at_utc: z.string().datetime(),
  status: z.literal('candidate_historical_evidence'),
  scope: z.object({
    language: z.string().min(1),
    iso_639_3: z.string().length(3),
    glottocode: z.string().min(1),
    variety: z.string().min(1),
    orthographies: z.array(z.string().min(1)).min(1),
  }),
  parent_manifest: ArtifactSchema,
  historical_inventory_manifest: ArtifactSchema,
  source_ledger: ArtifactSchema,
  change_ledger: ArtifactSchema.extend({
    recorded_candidate_change_ids: z.array(z.string().min(1)).min(1),
  }),
  crosswalk: z.object({
    top_candidates_per_historical_entry: z.number().int().positive().max(20),
    headword_method: z.literal('unicode_grapheme_trigram_jaccard'),
    gloss_method: z.literal('unicode_token_jaccard'),
    automatic_merge_allowed: z.literal(false),
  }),
  current_pointer_path: z.string().min(1),
  supersedes_pointer_sha256: Sha256Schema,
  release_status: z.literal('not_released'),
});

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
  artifact: z.infer<typeof ArtifactSchema>,
): Buffer {
  const bytes = readFileSync(resolveWithin(root, artifact.path));
  const actual = sha256(bytes);
  if (actual !== artifact.sha256)
    throw new Error(
      `hash mismatch for ${artifact.path}: ${actual} != ${artifact.sha256}`,
    );
  return bytes;
}

function parseJsonLines(bytes: Buffer): unknown[] {
  return bytes
    .toString('utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as unknown);
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
      `current pointer hash mismatch: ${previousHash} != ${expectedPreviousHash}`,
    );
  const temporary = `${filePath}.tmp-${process.pid}`;
  try {
    writeFileSync(temporary, content, { encoding: 'utf8', mode: 0o664 });
    renameSync(temporary, filePath);
  } finally {
    if (existsSync(temporary)) rmSync(temporary);
  }
}

function component(
  manifest: Record<string, unknown>,
  key: string,
): { path: string; sha256: string; rows: number } {
  const parsed = z
    .object({ path: z.string(), sha256: Sha256Schema, rows: z.number().int() })
    .parse((manifest.components as Record<string, unknown> | undefined)?.[key]);
  return parsed;
}

async function main(): Promise<void> {
  const rootArgument = flagValue('--program-root');
  const contractRelativePath = flagValue('--contract');
  if (!rootArgument || !contractRelativePath)
    throw new Error(
      'usage: tsx scripts/build-historical-dictionary-edition.ts --program-root PATH --contract RELATIVE_PATH [--write]',
    );
  const programRoot = path.resolve(rootArgument);
  const contractBytes = readFileSync(
    resolveWithin(programRoot, contractRelativePath),
  );
  const contract = ContractSchema.parse(
    JSON.parse(contractBytes.toString('utf8')),
  );
  const parentManifest = JSON.parse(
    readVerified(programRoot, contract.parent_manifest).toString('utf8'),
  ) as Record<string, unknown>;
  if (parentManifest.edition_id !== contract.parent_edition_id)
    throw new Error('parent edition ID does not match its manifest');
  const inventoryManifest = JSON.parse(
    readVerified(programRoot, contract.historical_inventory_manifest).toString(
      'utf8',
    ),
  ) as Record<string, unknown>;
  const inventoryId = z.string().parse(inventoryManifest.inventory_id);
  const changeLedgerBytes = readFileSync(
    resolveWithin(programRoot, contract.change_ledger.path),
  );
  verifyAppendOnlyLedger(changeLedgerBytes, contract.change_ledger.sha256);
  const changeRows = parseJsonLines(changeLedgerBytes).map((row) =>
    z
      .object({ change_id: z.string(), status: z.string() })
      .passthrough()
      .parse(row),
  );
  for (const changeId of contract.change_ledger.recorded_candidate_change_ids) {
    const change = changeRows.find((row) => row.change_id === changeId);
    if (!change || change.status !== 'candidate')
      throw new Error(
        `recorded candidate change is absent or not candidate: ${changeId}`,
      );
  }
  const sourceLedgerBytes = readFileSync(
    resolveWithin(programRoot, contract.source_ledger.path),
  );
  verifyAppendOnlyLedger(sourceLedgerBytes, contract.source_ledger.sha256);

  const parentKeys = [
    'entries',
    'senses',
    'forms',
    'examples',
    'mediaLinks',
    'conflicts',
    'reviewQueue',
  ] as const;
  const parentRows = Object.fromEntries(
    parentKeys.map((key) => {
      const descriptor = component(parentManifest, key);
      const bytes = readVerified(programRoot, descriptor);
      const rows = parseJsonLines(bytes);
      if (rows.length !== descriptor.rows)
        throw new Error(`parent ${key} row count does not match manifest`);
      return [key, rows];
    }),
  ) as Record<(typeof parentKeys)[number], unknown[]>;
  const inventoryEntriesDescriptor = component(inventoryManifest, 'entries');
  const inventoryReviewDescriptor = component(inventoryManifest, 'reviewQueue');
  const historicalEntries = parseJsonLines(
    readVerified(programRoot, inventoryEntriesDescriptor),
  );
  const historicalReviewQueue = parseJsonLines(
    readVerified(programRoot, inventoryReviewDescriptor),
  );
  if (historicalEntries.length !== inventoryEntriesDescriptor.rows)
    throw new Error('historical entry count does not match inventory manifest');
  if (historicalReviewQueue.length !== inventoryReviewDescriptor.rows)
    throw new Error(
      'historical review count does not match inventory manifest',
    );

  const result = buildHistoricalDictionaryEdition({
    parentEntries: parentRows.entries,
    parentSenses: parentRows.senses,
    parentForms: parentRows.forms,
    parentExamples: parentRows.examples,
    parentMediaLinks: parentRows.mediaLinks,
    parentConflicts: parentRows.conflicts,
    parentReviewQueue: parentRows.reviewQueue,
    historicalEntries,
    historicalReviewQueue,
    topCandidatesPerHistoricalEntry:
      contract.crosswalk.top_candidates_per_historical_entry,
  });
  const editionRelativeRoot = `dictionary/editions/${contract.edition_id}`;
  const editionRoot = resolveWithin(programRoot, editionRelativeRoot);
  const contents = {
    entries: jsonLines(result.entries),
    senses: jsonLines(result.senses),
    forms: jsonLines(result.forms),
    examples: jsonLines(result.examples),
    mediaLinks: jsonLines(result.mediaLinks),
    conflicts: jsonLines(result.conflicts),
    reviewQueue: jsonLines(result.reviewQueue),
    crosswalkCandidates: jsonLines(result.crosswalkCandidates),
  };
  const fileNames: Record<keyof typeof contents, string> = {
    entries: 'entries.jsonl',
    senses: 'senses.jsonl',
    forms: 'forms.jsonl',
    examples: 'examples.jsonl',
    mediaLinks: 'media-links.jsonl',
    conflicts: 'conflicts.jsonl',
    reviewQueue: 'review-queue.jsonl',
    crosswalkCandidates: 'historical-current-crosswalk-candidates.jsonl',
  };
  const components = Object.fromEntries(
    Object.entries(contents).map(([key, content]) => [
      key,
      {
        path: `${editionRelativeRoot}/${fileNames[key as keyof typeof contents]}`,
        sha256: sha256(content),
        rows:
          key === 'entries'
            ? result.entries.length
            : key === 'senses'
              ? result.senses.length
              : key === 'forms'
                ? result.forms.length
                : key === 'examples'
                  ? result.examples.length
                  : key === 'mediaLinks'
                    ? result.mediaLinks.length
                    : key === 'conflicts'
                      ? result.conflicts.length
                      : key === 'reviewQueue'
                        ? result.reviewQueue.length
                        : result.crosswalkCandidates.length,
      },
    ]),
  );
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
    historical_inventory: {
      inventory_id: inventoryId,
      ...contract.historical_inventory_manifest,
    },
    source_ledger_sha256: contract.source_ledger.sha256,
    change_ledger_sha256: contract.change_ledger.sha256,
    recorded_candidate_change_ids:
      contract.change_ledger.recorded_candidate_change_ids,
    crosswalk_policy: contract.crosswalk,
    components,
    counts: {
      ...result.report,
      inheritedExamples: result.examples.length,
      inheritedMediaLinks: result.mediaLinks.length,
      inheritedConflicts: result.conflicts.length,
      acceptedEntries: 0,
      acceptedSenses: 0,
      acceptedForms: 0,
      trainingEligibleRows: 0,
    },
    normalization_policy: {
      source: 'NFC source reconstructions and source geometry retained',
      comparison: 'NFKC, lowercase, trim, and whitespace collapse only',
      historical_modern_correspondence:
        'ranked review candidates only; no spelling map or automatic merge',
    },
    accepted_change_ids: [],
    supersedes: [contract.parent_edition_id],
    release_status: contract.release_status,
    claim_limit:
      'This edition adds historical documentary evidence and ranked review candidates. It accepts no historical transcription, spelling correspondence, lexical identity, sense, part of speech, form, or training row.',
  };
  const editionContent = `${JSON.stringify(edition, null, 2)}\n`;
  const editionManifestPath = `${editionRelativeRoot}/EDITION.json`;
  const editionManifestSha256 = sha256(editionContent);
  const currentPointer = {
    schema_version: 1,
    artifact: 'dictionary',
    current_edition_id: contract.edition_id,
    manifest_path: editionManifestPath,
    manifest_sha256: editionManifestSha256,
    updated_at_utc: contract.created_at_utc,
    supersedes_pointer_sha256: contract.supersedes_pointer_sha256,
    release_status: contract.release_status,
  };
  const currentPointerContent = `${JSON.stringify(currentPointer, null, 2)}\n`;

  if (process.argv.includes('--write')) {
    for (const [key, content] of Object.entries(contents))
      writeImmutable(
        path.join(editionRoot, fileNames[key as keyof typeof contents]),
        content,
      );
    writeImmutable(path.join(editionRoot, 'EDITION.json'), editionContent);
    writePointer(
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
        editionManifestPath,
        editionManifestSha256,
        currentPointerSha256: sha256(currentPointerContent),
        counts: edition.counts,
        components,
      },
      null,
      2,
    ),
  );
}

main();
