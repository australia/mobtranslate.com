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
import {
  buildCandidateDictionaryLedgers,
  canonicalJson,
  type DictionaryCensusResult,
  SourceDictionaryRecordSchema,
} from '../lib/research/dictionarySourceCensus';

const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const EditionContractSchema = z.object({
  schema_version: z.literal(1),
  edition_id: z.string().regex(/^[a-z0-9][a-z0-9.-]*$/),
  parent_edition_id: z.string().min(1),
  created_at_utc: z.string().datetime(),
  status: z.literal('candidate_source_census'),
  scope: z.object({
    language: z.string().min(1),
    iso_639_3: z.string().length(3),
    glottocode: z.string().min(1),
    variety: z.string().min(1),
    orthography: z.string().min(1),
  }),
  census_manifest: z.object({
    path: z.string().min(1),
    sha256: Sha256Schema,
  }),
  parent_manifest: z.object({
    path: z.string().min(1),
    sha256: Sha256Schema,
  }),
  source_ledger: z.object({
    path: z.string().min(1),
    sha256: Sha256Schema,
  }),
  change_ledger: z.object({
    path: z.string().min(1),
    sha256: Sha256Schema,
  }),
  current_pointer_path: z.string().min(1),
  supersedes_pointer_sha256: Sha256Schema.nullable(),
  release_status: z.literal('not_released'),
});

type CensusReport = DictionaryCensusResult['report'] & {
  censusId: string;
  databaseSnapshotAtUtc: string;
};

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

function readJsonLines<T>(bytes: Buffer, parse: (_value: unknown) => T): T[] {
  const text = bytes.toString('utf8');
  return text
    .split(/\r?\n/u)
    .filter((line) => line.trim().length > 0)
    .map((line, index) => {
      try {
        return parse(JSON.parse(line));
      } catch (error) {
        throw new Error(`invalid JSONL row ${index + 1}`, { cause: error });
      }
    });
}

function jsonLines(rows: unknown[]): string {
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
  supersedesPointerSha256: string | null,
): void {
  if (existsSync(filePath)) {
    const existing = readFileSync(filePath);
    const existingHash = sha256Bytes(existing);
    if (existing.toString('utf8') === content) return;
    if (supersedesPointerSha256 !== existingHash)
      throw new Error(
        `current pointer does not match supersedes_pointer_sha256: ${existingHash}`,
      );
  } else if (supersedesPointerSha256 !== null) {
    throw new Error(
      'current pointer is absent but a superseded pointer hash was supplied',
    );
  }
  mkdirSync(path.dirname(filePath), { recursive: true });
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
  if (!rootArgument)
    throw new Error(
      'usage: tsx scripts/build-candidate-dictionary-edition.ts --program-root PATH --contract RELATIVE_PATH [--write]',
    );
  const programRoot = path.resolve(rootArgument);
  const contractRelativePath =
    flagValue('--contract') ?? 'dictionary/EDITION-CONTRACT.json';
  const contractPath = resolveWithin(programRoot, contractRelativePath);
  const contractBytes = readFileSync(contractPath);
  const contract = EditionContractSchema.parse(
    JSON.parse(contractBytes.toString('utf8')),
  );
  const censusManifestBytes = readVerified(
    programRoot,
    contract.census_manifest.path,
    contract.census_manifest.sha256,
  );
  const censusManifest = z
    .object({
      censusId: z.string().min(1),
      databaseSnapshotAtUtc: z.string().min(1),
      source: z.object({ sourceId: z.string().min(1) }),
      artifacts: z.object({
        sourceRecords: z.object({
          path: z.string().min(1),
          sha256: Sha256Schema,
          rows: z.number().int().nonnegative(),
        }),
        databaseRows: z.object({
          path: z.string().min(1),
          sha256: Sha256Schema,
          rows: z.number().int().nonnegative(),
        }),
        crosswalk: z.object({
          path: z.string().min(1),
          sha256: Sha256Schema,
          rows: z.number().int().nonnegative(),
        }),
        report: z.object({
          path: z.string().min(1),
          sha256: Sha256Schema,
        }),
      }),
      exactLineageContractPassed: z.literal(true),
    })
    .parse(JSON.parse(censusManifestBytes.toString('utf8')));
  const sourceRecordBytes = readVerified(
    programRoot,
    censusManifest.artifacts.sourceRecords.path,
    censusManifest.artifacts.sourceRecords.sha256,
  );
  readVerified(
    programRoot,
    censusManifest.artifacts.databaseRows.path,
    censusManifest.artifacts.databaseRows.sha256,
  );
  readVerified(
    programRoot,
    censusManifest.artifacts.crosswalk.path,
    censusManifest.artifacts.crosswalk.sha256,
  );
  const reportBytes = readVerified(
    programRoot,
    censusManifest.artifacts.report.path,
    censusManifest.artifacts.report.sha256,
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
  const sourceRecords = readJsonLines(sourceRecordBytes, (value) =>
    SourceDictionaryRecordSchema.parse(value),
  );
  if (sourceRecords.length !== censusManifest.artifacts.sourceRecords.rows)
    throw new Error('source record row count does not match census manifest');
  const report = JSON.parse(reportBytes.toString('utf8')) as CensusReport;
  if (report.censusId !== censusManifest.censusId)
    throw new Error('census report identity does not match census manifest');
  const ledgers = buildCandidateDictionaryLedgers(sourceRecords, report, {
    orthographyId: contract.scope.orthography,
  });

  const editionRelativeRoot = `dictionary/editions/${contract.edition_id}`;
  const editionRoot = resolveWithin(programRoot, editionRelativeRoot);
  const contents = {
    entries: jsonLines(ledgers.entries),
    senses: jsonLines(ledgers.senses),
    forms: jsonLines(ledgers.forms),
    examples: jsonLines(ledgers.examples),
    mediaLinks: jsonLines(ledgers.mediaLinks),
    conflicts: jsonLines(ledgers.conflicts),
    reviewQueue: jsonLines(ledgers.reviewQueue),
  };
  const components = {
    entries: {
      path: `${editionRelativeRoot}/entries.jsonl`,
      sha256: sha256Bytes(contents.entries),
      rows: ledgers.entries.length,
    },
    senses: {
      path: `${editionRelativeRoot}/senses.jsonl`,
      sha256: sha256Bytes(contents.senses),
      rows: ledgers.senses.length,
    },
    forms: {
      path: `${editionRelativeRoot}/forms.jsonl`,
      sha256: sha256Bytes(contents.forms),
      rows: ledgers.forms.length,
    },
    examples: {
      path: `${editionRelativeRoot}/examples.jsonl`,
      sha256: sha256Bytes(contents.examples),
      rows: ledgers.examples.length,
    },
    mediaLinks: {
      path: `${editionRelativeRoot}/media-links.jsonl`,
      sha256: sha256Bytes(contents.mediaLinks),
      rows: ledgers.mediaLinks.length,
    },
    conflicts: {
      path: `${editionRelativeRoot}/conflicts.jsonl`,
      sha256: sha256Bytes(contents.conflicts),
      rows: ledgers.conflicts.length,
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
      census_manifest_path: contract.census_manifest.path,
      census_manifest_sha256: contract.census_manifest.sha256,
      database_snapshot_at_utc: censusManifest.databaseSnapshotAtUtc,
    },
    source_ledger_sha256: contract.source_ledger.sha256,
    change_ledger_sha256: contract.change_ledger.sha256,
    components,
    counts: {
      source_records_crosswalked: sourceRecords.length,
      database_lineage_pairs: report.crosswalk.exactTwoLineagePairs,
      candidate_entries: ledgers.entries.length,
      candidate_senses: ledgers.senses.length,
      candidate_forms: ledgers.forms.length,
      accepted_entries: 0,
      accepted_senses: 0,
      accepted_forms: 0,
      attested_examples: 0,
      unresolved_media_links: ledgers.mediaLinks.length,
      pending_review_items: ledgers.reviewQueue.length,
      repeated_headword_groups: report.source.repeatedExactHeadwordGroups,
      ambiguous_english_prompt_groups:
        report.EnglishPromptInventory.promptsWithMultipleTargetHeadwords,
    },
    normalization_policy: {
      source: 'NFC/source bytes retained without spelling edits',
      comparison: 'NFKC, lowercase, trim, and whitespace collapse only',
      semantic_merging: 'none; every source row remains a separate candidate',
    },
    accepted_change_ids: [],
    supersedes: [contract.parent_edition_id],
    exports: {},
    release_status: contract.release_status,
    claim_limit:
      'This candidate edition proves complete source preservation and database lineage, and exposes every mapping for review. It does not yet adjudicate lexical identity, sense boundaries, synonymy, morphology, part of speech, media integrity, or benchmark-acceptable answers.',
  };
  const editionContent = `${JSON.stringify(edition, null, 2)}\n`;
  const editionManifestRelativePath = `${editionRelativeRoot}/EDITION.json`;
  const editionManifestSha256 = sha256Bytes(editionContent);
  const currentPointer = {
    schema_version: 1,
    artifact: 'dictionary',
    current_edition_id: contract.edition_id,
    manifest_path: editionManifestRelativePath,
    manifest_sha256: editionManifestSha256,
    updated_at_utc: contract.created_at_utc,
    supersedes_pointer_sha256: contract.supersedes_pointer_sha256,
    release_status: contract.release_status,
  };
  const currentPointerContent = `${JSON.stringify(currentPointer, null, 2)}\n`;

  if (process.argv.includes('--write')) {
    writeImmutable(path.join(editionRoot, 'entries.jsonl'), contents.entries);
    writeImmutable(path.join(editionRoot, 'senses.jsonl'), contents.senses);
    writeImmutable(path.join(editionRoot, 'forms.jsonl'), contents.forms);
    writeImmutable(path.join(editionRoot, 'examples.jsonl'), contents.examples);
    writeImmutable(
      path.join(editionRoot, 'media-links.jsonl'),
      contents.mediaLinks,
    );
    writeImmutable(
      path.join(editionRoot, 'conflicts.jsonl'),
      contents.conflicts,
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
        components,
        counts: edition.counts,
      },
      null,
      2,
    ),
  );
}

main();
