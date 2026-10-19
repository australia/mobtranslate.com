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
  buildDictionaryPublishedEvidenceEdition,
  DictionaryPublishedEvidenceContractSchema,
} from '../lib/research/dictionaryPublishedEvidenceEdition';

const ReferenceSchema = z.object({
  path: z.string().min(1),
  sha256: z.string().regex(/^[0-9a-f]{64}$/u),
  rows: z.number().int().nonnegative(),
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
  if (relative.startsWith('..') || path.isAbsolute(relative))
    throw new Error(`path escapes the program root: ${relativePath}`);
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

function readRows(
  root: string,
  reference: { path: string; sha256: string; rows: number },
): Array<Record<string, unknown>> {
  const rows = parseJsonLines(readVerified(root, reference));
  if (rows.length !== reference.rows)
    throw new Error(`row count mismatch for ${reference.path}`);
  return rows;
}

async function main(): Promise<void> {
  const rootArgument = flagValue('--program-root');
  const contractRelativePath = flagValue('--contract');
  if (!rootArgument || !contractRelativePath)
    throw new Error(
      'usage: tsx scripts/build-dictionary-published-evidence-edition.ts --program-root PATH --contract RELATIVE_PATH [--write]',
    );
  const programRoot = path.resolve(rootArgument);
  const contractBytes = readFileSync(
    resolveWithin(programRoot, contractRelativePath),
  );
  const contract = DictionaryPublishedEvidenceContractSchema.parse(
    JSON.parse(contractBytes.toString('utf8')),
  );
  const parentManifest = JSON.parse(
    readVerified(programRoot, contract.parent_manifest).toString('utf8'),
  ) as Record<string, unknown>;
  const parentComponents = z
    .record(z.string(), ReferenceSchema)
    .parse(parentManifest.components);
  const parentKeys = [
    'entries',
    'senses',
    'forms',
    'examples',
    'mediaLinks',
    'conflicts',
    'reviewQueue',
    'crosswalkCandidates',
    'contemporaryEvidenceLinks',
    'unlinkedAudio',
  ] as const;
  const parentRows = Object.fromEntries(
    parentKeys.map((key) => {
      const reference = parentComponents[key];
      if (!reference) throw new Error(`parent component is absent: ${key}`);
      return [key, readRows(programRoot, reference)];
    }),
  ) as Record<(typeof parentKeys)[number], Array<Record<string, unknown>>>;

  const inventoryManifest = JSON.parse(
    readVerified(programRoot, {
      path: contract.evidence_inventory.manifest_path,
      sha256: contract.evidence_inventory.manifest_sha256,
    }).toString('utf8'),
  ) as Record<string, unknown>;
  const inventoryComponents = z
    .record(z.string(), ReferenceSchema)
    .parse(inventoryManifest.components);
  const lexicalReference =
    inventoryComponents[contract.evidence_inventory.lexical_component_key];
  if (!lexicalReference)
    throw new Error('inventory lexical component is absent');
  const lexicalRows = readRows(programRoot, lexicalReference);

  const sourceLedgerBytes = readFileSync(
    resolveWithin(programRoot, contract.source_ledger.path),
  );
  const sourceLedgerVerification = verifyAppendOnlyLedger(
    sourceLedgerBytes,
    contract.source_ledger.sha256,
  );
  const sourceRows = parseJsonLines(sourceLedgerVerification.verifiedBytes);
  const requiredSourceIds = new Set(
    lexicalRows.map((row) => z.string().parse(row.sourceId)),
  );
  for (const sourceId of requiredSourceIds) {
    const source = sourceRows.find((row) => row.source_id === sourceId);
    if (!source) throw new Error(`required source is absent: ${sourceId}`);
    for (const key of [
      'training_use',
      'redistribution',
      'derived_weights',
      'hosted_transfer',
    ])
      if (source[key] !== 'not_allowed')
        throw new Error(`required source ${sourceId} has unexpected ${key}`);
  }
  const changeLedgerBytes = readFileSync(
    resolveWithin(programRoot, contract.change_ledger.path),
  );
  const changeLedgerVerification = verifyAppendOnlyLedger(
    changeLedgerBytes,
    contract.change_ledger.sha256,
  );

  const result = buildDictionaryPublishedEvidenceEdition({
    contractValue: contract,
    parentManifestValue: parentManifest,
    inventoryManifestValue: inventoryManifest,
    parentEntries: parentRows.entries,
    parentSenses: parentRows.senses,
    parentReviewQueue: parentRows.reviewQueue,
    lexicalPairingRows: lexicalRows,
    changeLedgerRows: parseJsonLines(changeLedgerVerification.verifiedBytes),
  });
  const expected = contract.expected_counts;
  const actual: Record<keyof typeof expected, number> = {
    evidence_links: result.report.evidenceLinks,
    exact_current_headwords: result.report.exactCurrentHeadwords,
    exact_normalized_glosses: result.report.exactNormalizedGlosses,
    token_set_equal_glosses: result.report.tokenSetEqualGlosses,
    other_gloss_relations: result.report.otherGlossRelations,
    added_review_items: result.report.addedReviewItems,
  };
  for (const key of Object.keys(expected) as Array<keyof typeof expected>)
    if (actual[key] !== expected[key])
      throw new Error(
        `expected count mismatch for ${key}: ${actual[key]} != ${expected[key]}`,
      );

  const editionRelativeRoot = `dictionary/editions/${contract.edition_id}`;
  const outputRows = {
    entries: parentRows.entries,
    senses: parentRows.senses,
    forms: parentRows.forms,
    examples: parentRows.examples,
    mediaLinks: parentRows.mediaLinks,
    conflicts: parentRows.conflicts,
    reviewQueue: result.reviewQueue,
    crosswalkCandidates: parentRows.crosswalkCandidates,
    contemporaryEvidenceLinks: parentRows.contemporaryEvidenceLinks,
    unlinkedAudio: parentRows.unlinkedAudio,
    publishedEvidenceLinks: result.publishedEvidenceLinks,
  };
  const names: Record<keyof typeof outputRows, string> = {
    entries: 'entries.jsonl',
    senses: 'senses.jsonl',
    forms: 'forms.jsonl',
    examples: 'examples.jsonl',
    mediaLinks: 'media-links.jsonl',
    conflicts: 'conflicts.jsonl',
    reviewQueue: 'review-queue.jsonl',
    crosswalkCandidates: 'historical-current-crosswalk-candidates.jsonl',
    contemporaryEvidenceLinks: 'contemporary-evidence-links.jsonl',
    unlinkedAudio: 'unlinked-audio.jsonl',
    publishedEvidenceLinks: 'published-evidence-links.jsonl',
  };
  const contents = Object.fromEntries(
    Object.entries(outputRows).map(([key, rows]) => [key, jsonLines(rows)]),
  ) as Record<keyof typeof outputRows, string>;
  const components = Object.fromEntries(
    (Object.keys(outputRows) as Array<keyof typeof outputRows>).map((key) => [
      key,
      {
        path: `${editionRelativeRoot}/${names[key]}`,
        sha256: sha256(contents[key]),
        rows: outputRows[key].length,
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
    components,
    counts: {
      entries: parentRows.entries.length,
      senses: parentRows.senses.length,
      forms: parentRows.forms.length,
      examples: parentRows.examples.length,
      conflicts: parentRows.conflicts.length,
      historicalCrosswalkCandidates: parentRows.crosswalkCandidates.length,
      contemporaryEvidenceLinks: parentRows.contemporaryEvidenceLinks.length,
      unlinkedAudioCandidates: parentRows.unlinkedAudio.length,
      ...result.report,
      acceptedEntries: 0,
      acceptedSenses: 0,
      acceptedForms: 0,
      trainingEligibleRows: 0,
    },
    evidence_policy: {
      published_pairings:
        'The source explicitly pairs each printed form and gloss. Exact headword and string diagnostics route review but do not establish lexical or sense identity.',
      source_independence:
        'The publication identifies the same dictionary/project lineage plus local speaker input; evidence is corroborating, not assumed independent.',
      acceptance:
        'Every new link remains a candidate pending evidence-qualified lexical, sense, part-of-speech, variety, and use-right review.',
    },
    accepted_change_ids: contract.change_ledger.accepted_change_ids,
    supersedes: [contract.parent_edition_id],
    release_status: contract.release_status,
    claim_limit:
      'This edition adds five explicit published pairing links and review records. It accepts no lexical fact, sense relation, substitutability claim, training row, redistribution right, hosted-transfer right, or model-weight right.',
  };
  const editionContent = `${JSON.stringify(edition, null, 2)}\n`;
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
  const pointerContent = `${JSON.stringify(pointer, null, 2)}\n`;

  if (process.argv.includes('--write')) {
    const editionRoot = resolveWithin(programRoot, editionRelativeRoot);
    for (const key of Object.keys(outputRows) as Array<keyof typeof outputRows>)
      writeImmutable(path.join(editionRoot, names[key]), contents[key]);
    writeImmutable(path.join(editionRoot, 'EDITION.json'), editionContent);
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
