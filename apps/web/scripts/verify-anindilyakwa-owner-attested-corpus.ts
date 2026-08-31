import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';

import {
  normalizeComparable,
  partitionForChapter,
  type LexicalBenchmark,
  type NaturalBenchmark,
  type TrainingPair,
} from '../lib/research/anindilyakwaTrainingCorpus';

type FileRef = { path: string; sha256: string; rows?: number };
type Manifest = {
  schema_version: 1;
  edition_id: string;
  permission: FileRef & {
    evidence_class: string;
    independently_document_verified: boolean;
    operator_accepts_responsibility: boolean;
  };
  inputs: {
    natural_benchmarks: FileRef;
    lexical_benchmarks: FileRef;
  };
  counts: Record<string, number>;
  components: {
    train: FileRef;
    development: FileRef;
    exclusions: FileRef;
  };
  release_contract: {
    private_research_training_eligible: boolean;
    public_dataset_release_eligible: boolean;
    model_release_eligible: boolean;
  };
};

function flagValue(flag: string): string {
  const index = process.argv.indexOf(flag);
  if (index < 0 || !process.argv[index + 1]) {
    throw new Error(`missing required ${flag} PATH`);
  }
  return process.argv[index + 1];
}

function sha256(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex');
}

function resolveWithin(root: string, relativePath: string): string {
  if (path.isAbsolute(relativePath)) throw new Error('path must be relative');
  const resolved = path.resolve(root, relativePath);
  const relative = path.relative(root, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`path escapes program root: ${relativePath}`);
  }
  return resolved;
}

function resolvedReference(programRoot: string, reference: FileRef): string {
  return path.isAbsolute(reference.path)
    ? reference.path
    : resolveWithin(programRoot, reference.path);
}

function verifyReference(programRoot: string, reference: FileRef): string {
  const resolved = resolvedReference(programRoot, reference);
  if (sha256(readFileSync(resolved)) !== reference.sha256) {
    throw new Error(`hash mismatch: ${reference.path}`);
  }
  return resolved;
}

function readJsonLines<T>(filePath: string): T[] {
  return readFileSync(filePath, 'utf8')
    .split(/\r?\n/u)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as T);
}

function writeImmutable(filePath: string, content: string): void {
  if (existsSync(filePath)) {
    if (readFileSync(filePath, 'utf8') !== content) {
      throw new Error(`refusing to rewrite immutable artifact: ${filePath}`);
    }
    return;
  }
  mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  writeFileSync(temporaryPath, content, { encoding: 'utf8', flag: 'wx' });
  renameSync(temporaryPath, filePath);
}

const programRoot = path.resolve(flagValue('--program-root'));
const editionRelativePath = flagValue('--edition');
const editionRoot = resolveWithin(programRoot, editionRelativePath);
const manifestPath = path.join(editionRoot, 'MANIFEST.json');
const manifestBytes = readFileSync(manifestPath);
const manifest = JSON.parse(manifestBytes.toString('utf8')) as Manifest;
if (manifest.schema_version !== 1)
  throw new Error('unsupported manifest schema');
if (manifest.edition_id !== 'anindilyakwa-owner-attested-parallel-v0.3.0') {
  throw new Error(`unexpected edition: ${manifest.edition_id}`);
}

const checks: Array<{ check_id: string; pass: true; detail: unknown }> = [];
function pass(checkId: string, detail: unknown): void {
  checks.push({ check_id: checkId, pass: true, detail });
}

const permissionPath = verifyReference(programRoot, manifest.permission);
const permission = JSON.parse(readFileSync(permissionPath, 'utf8')) as {
  attestation?: Record<string, unknown>;
  evidence_class?: string;
};
if (
  permission.attestation?.all_required_permissions_obtained !== true ||
  permission.attestation.operator_accepts_responsibility !== true ||
  permission.evidence_class !==
    'operator_attestation_without_documentary_exhibition'
) {
  throw new Error('permission evidence does not match the manifest claim');
}
pass('permission_hash_and_scope', manifest.permission.evidence_class);

const trainPath = path.join(editionRoot, manifest.components.train.path);
const developmentPath = path.join(
  editionRoot,
  manifest.components.development.path,
);
const exclusionsPath = path.join(
  editionRoot,
  manifest.components.exclusions.path,
);
for (const [label, filePath, component] of [
  ['train', trainPath, manifest.components.train],
  ['development', developmentPath, manifest.components.development],
  ['exclusions', exclusionsPath, manifest.components.exclusions],
] as const) {
  const observed = sha256(readFileSync(filePath));
  if (observed !== component.sha256) {
    throw new Error(`${label} component hash mismatch`);
  }
  pass(`${label}_component_hash`, observed);
}

const train = readJsonLines<TrainingPair>(trainPath);
const development = readJsonLines<TrainingPair>(developmentPath);
const exclusions = readJsonLines<{
  source_id: string;
  canonical_ref: string;
  reason: string;
}>(exclusionsPath);
if (
  train.length !== manifest.components.train.rows ||
  development.length !== manifest.components.development.rows ||
  exclusions.length !== manifest.components.exclusions.rows
) {
  throw new Error('component row counts do not match manifest');
}
pass('component_row_counts', {
  train: train.length,
  development: development.length,
  exclusions: exclusions.length,
});

const pairs = [...train, ...development];
if (
  pairs.length !== manifest.counts.selected ||
  train.length !== manifest.counts.train ||
  development.length !== manifest.counts.development
) {
  throw new Error('selected partition totals do not match manifest');
}
pass('selected_partition_totals', pairs.length);

const trainGroups = new Set(train.map((row) => row.chapter_group));
const developmentGroups = new Set(development.map((row) => row.chapter_group));
const crossingGroups = [...trainGroups].filter((group) =>
  developmentGroups.has(group),
);
if (crossingGroups.length > 0) {
  throw new Error(
    `chapter groups cross partitions: ${crossingGroups.join(',')}`,
  );
}
pass('chapter_group_partition_disjointness', {
  train: trainGroups.size,
  development: developmentGroups.size,
});

for (const row of pairs) {
  if (
    row.source_language !== 'eng' ||
    row.target_language !== 'aoi' ||
    !row.source_text.trim() ||
    !row.target_text.trim() ||
    row.benchmark_overlap !== false ||
    row.partition !== partitionForChapter(row.chapter_group) ||
    row.permission_evidence_class !==
      'operator_attestation_without_documentary_exhibition'
  ) {
    throw new Error(`invalid selected row: ${row.pair_id}`);
  }
}
pass('row_contract_and_direction', 'eng-to-aoi');

const normalizedPairKeys = pairs.map(
  (row) =>
    `${normalizeComparable(row.source_text)}\u0000${normalizeComparable(row.target_text)}`,
);
if (new Set(normalizedPairKeys).size !== normalizedPairKeys.length) {
  throw new Error('normalized duplicate pairs remain');
}
pass('normalized_pair_uniqueness', normalizedPairKeys.length);

const natural = readJsonLines<NaturalBenchmark>(
  verifyReference(programRoot, manifest.inputs.natural_benchmarks),
);
const lexical = readJsonLines<LexicalBenchmark>(
  verifyReference(programRoot, manifest.inputs.lexical_benchmarks),
);
const benchmarkPairs = new Set<string>();
for (const row of natural) {
  benchmarkPairs.add(
    `${normalizeComparable(row.input_english)}\u0000${normalizeComparable(row.expected_anindilyakwa)}`,
  );
}
for (const row of lexical) {
  for (const gloss of row.prompt_english_glosses) {
    benchmarkPairs.add(
      `${normalizeComparable(gloss)}\u0000${normalizeComparable(row.expected_anindilyakwa)}`,
    );
  }
}
const overlap = normalizedPairKeys.filter((key) => benchmarkPairs.has(key));
if (overlap.length > 0) throw new Error('benchmark pairs leaked into corpus');
pass('exact_benchmark_pair_disjointness', {
  natural_rows: natural.length,
  lexical_rows: lexical.length,
  overlap: 0,
});

const exclusionCounts = Object.fromEntries(
  [...new Set(exclusions.map((row) => row.reason))]
    .sort()
    .map((reason) => [
      reason,
      exclusions.filter((row) => row.reason === reason).length,
    ]),
);
if (
  exclusionCounts.verse_shadowed_by_sentence_candidates !==
    manifest.counts.verses_shadowed_by_sentence_candidates ||
  exclusionCounts.verse_range_derived_overlap !==
    manifest.counts.verse_ranges_input ||
  (exclusionCounts.normalized_duplicate_pair ?? 0) !==
    manifest.counts.duplicate_pairs_rejected ||
  (exclusionCounts.exact_benchmark_pair ?? 0) !==
    manifest.counts.benchmark_overlap_rejected ||
  (exclusionCounts.empty_or_invalid ?? 0) !==
    manifest.counts.empty_or_invalid_rejected
) {
  throw new Error('exclusion reasons do not reconcile with manifest counts');
}
pass('exclusion_reason_reconciliation', exclusionCounts);

const inputTotal =
  manifest.counts.sentence_candidates_input +
  manifest.counts.verses_input +
  manifest.counts.verse_ranges_input;
if (pairs.length + exclusions.length !== inputTotal) {
  throw new Error('selected and excluded rows do not reconcile to inputs');
}
pass('input_reconciliation', inputTotal);

if (
  manifest.release_contract.private_research_training_eligible !== true ||
  manifest.release_contract.public_dataset_release_eligible !== false ||
  manifest.release_contract.model_release_eligible !== false
) {
  throw new Error(
    'release contract inflates permission into release readiness',
  );
}
pass('release_boundary', manifest.release_contract);

const verifierPath = fileURLToPath(import.meta.url);
const report = {
  schema_version: 1,
  verification_id: 'anindilyakwa-owner-attested-corpus-v0.3.0',
  edition_id: manifest.edition_id,
  edition_manifest: {
    path: path.relative(programRoot, manifestPath),
    sha256: sha256(manifestBytes),
  },
  verifier: {
    path: verifierPath,
    sha256: sha256(readFileSync(verifierPath)),
  },
  checks,
  decision: {
    pass: true,
    private_research_training_eligible: true,
    public_release_eligible: false,
    selected_rows: pairs.length,
    claim_limit:
      'The immutable scripture-domain corpus is structurally eligible for a private research baseline under operator-attested permission. It is not a reviewed public dataset or proof of sentence competence.',
  },
};
const reportContent = `${JSON.stringify(report, null, 2)}\n`;
const outputRoot = resolveWithin(
  programRoot,
  'verification/corpus-owner-attested-v0.3.0',
);
writeImmutable(path.join(outputRoot, 'report.json'), reportContent);
writeImmutable(
  path.join(outputRoot, 'SHA256SUMS'),
  `${sha256(reportContent)}  report.json\n`,
);

process.stdout.write(
  `${JSON.stringify({
    verification_id: report.verification_id,
    checks_passed: checks.length,
    selected_rows: pairs.length,
    report_sha256: sha256(reportContent),
  })}\n`,
);
