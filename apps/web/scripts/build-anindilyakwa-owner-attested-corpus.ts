import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import {
  selectAnindilyakwaTrainingCorpus,
  type LexicalBenchmark,
  type NaturalBenchmark,
  type ParallelCandidate,
} from '../lib/research/anindilyakwaTrainingCorpus';

type FileRef = { path: string; sha256: string };
type Contract = {
  schema_version: 1;
  edition_id: string;
  created_at_utc: string;
  program_id: string;
  permission: FileRef;
  inputs: {
    sentence_candidates: FileRef;
    verses: FileRef;
    verse_ranges: FileRef;
    natural_benchmarks: FileRef;
    lexical_benchmarks: FileRef;
  };
  implementation: Array<FileRef & { role: string }>;
  output_directory: string;
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

function verifiedPath(programRoot: string, reference: FileRef): string {
  const resolved = path.isAbsolute(reference.path)
    ? reference.path
    : resolveWithin(programRoot, reference.path);
  const bytes = readFileSync(resolved);
  if (sha256(bytes) !== reference.sha256) {
    throw new Error(`input hash mismatch: ${reference.path}`);
  }
  return resolved;
}

function readJsonLines<T>(filePath: string): T[] {
  return readFileSync(filePath, 'utf8')
    .split(/\r?\n/u)
    .filter((line) => line.trim())
    .map((line, index) => {
      try {
        return JSON.parse(line) as T;
      } catch (error) {
        throw new Error(
          `invalid JSONL at ${filePath}:${index + 1}: ${String(error)}`,
        );
      }
    });
}

function jsonLines(rows: unknown[]): string {
  return rows
    .map((row) => JSON.stringify(row))
    .join('\n')
    .concat('\n');
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

function assertPermission(value: unknown): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('permission evidence must be a JSON object');
  }
  const record = value as Record<string, unknown>;
  const attestation = record.attestation as Record<string, unknown> | undefined;
  const scopes = record.scope_interpreted_against_active_goal;
  if (
    attestation?.all_required_permissions_obtained !== true ||
    attestation.operator_accepts_responsibility !== true ||
    !Array.isArray(scopes) ||
    !scopes.includes('model_training_and_evaluation') ||
    !scopes.includes('dictionary_grammar_and_corpus_use')
  ) {
    throw new Error(
      'permission attestation does not authorize corpus training',
    );
  }
  if (
    record.evidence_class !==
    'operator_attestation_without_documentary_exhibition'
  ) {
    throw new Error('unexpected permission evidence class');
  }
}

const programRoot = path.resolve(flagValue('--program-root'));
const contractRelativePath = flagValue('--contract');
const contractPath = resolveWithin(programRoot, contractRelativePath);
const contractBytes = readFileSync(contractPath);
const contract = JSON.parse(contractBytes.toString('utf8')) as Contract;
if (contract.schema_version !== 1)
  throw new Error('unsupported schema version');
if (contract.program_id !== 'anindilyakwa-v1') {
  throw new Error(`unexpected program_id: ${contract.program_id}`);
}
if (contract.edition_id !== 'anindilyakwa-owner-attested-parallel-v0.3.0') {
  throw new Error(`unexpected edition_id: ${contract.edition_id}`);
}

for (const implementation of contract.implementation) {
  verifiedPath(programRoot, implementation);
}
const permissionPath = verifiedPath(programRoot, contract.permission);
assertPermission(JSON.parse(readFileSync(permissionPath, 'utf8')) as unknown);

const sentenceCandidates = readJsonLines<ParallelCandidate>(
  verifiedPath(programRoot, contract.inputs.sentence_candidates),
);
const verses = readJsonLines<ParallelCandidate>(
  verifiedPath(programRoot, contract.inputs.verses),
);
const verseRanges = readJsonLines<ParallelCandidate>(
  verifiedPath(programRoot, contract.inputs.verse_ranges),
);
const naturalBenchmarks = readJsonLines<NaturalBenchmark>(
  verifiedPath(programRoot, contract.inputs.natural_benchmarks),
);
const lexicalBenchmarks = readJsonLines<LexicalBenchmark>(
  verifiedPath(programRoot, contract.inputs.lexical_benchmarks),
);

const selection = selectAnindilyakwaTrainingCorpus({
  sentenceCandidates,
  verses,
  verseRanges,
  naturalBenchmarks,
  lexicalBenchmarks,
});
if (
  selection.pairs.length + selection.exclusions.length !==
  sentenceCandidates.length + verses.length + verseRanges.length
) {
  throw new Error('selected and excluded rows do not reconcile to inputs');
}
if (selection.counts.train === 0 || selection.counts.development === 0) {
  throw new Error('both train and development partitions must be nonempty');
}

const trainContent = jsonLines(
  selection.pairs.filter((row) => row.partition === 'train'),
);
const developmentContent = jsonLines(
  selection.pairs.filter((row) => row.partition === 'development'),
);
const exclusionsContent = jsonLines(selection.exclusions);
const componentHashes = {
  train: sha256(trainContent),
  development: sha256(developmentContent),
  exclusions: sha256(exclusionsContent),
};
const chapterPartitions = Object.fromEntries(
  [...new Set(selection.pairs.map((row) => row.chapter_group))]
    .sort()
    .map((group) => [
      group,
      selection.pairs.find((row) => row.chapter_group === group)?.partition,
    ]),
);
const manifest = {
  schema_version: 1,
  edition_id: contract.edition_id,
  created_at_utc: contract.created_at_utc,
  status: 'owner_attested_permission_research_training_eligible',
  language: {
    source: { name: 'English', iso_639_3: 'eng' },
    target: { name: 'Anindilyakwa', iso_639_3: 'aoi' },
  },
  contract: {
    path: contractRelativePath,
    sha256: sha256(contractBytes),
  },
  permission: {
    ...contract.permission,
    evidence_class: 'operator_attestation_without_documentary_exhibition',
    independently_document_verified: false,
    operator_accepts_responsibility: true,
  },
  inputs: contract.inputs,
  implementation: contract.implementation,
  selection_policy: {
    direction: 'English to Anindilyakwa',
    sentence_candidates_precede_whole_verse:
      'when any sentence candidate exists for a verse, exclude that whole verse',
    verse_ranges: 'always excluded as derived overlap',
    deduplication: 'NFKC lowercase letter-number normalized exact pair',
    benchmark_filter:
      'exclude exact normalized English-Anindilyakwa pairs found in frozen natural or lexical benchmark rows',
    partition:
      'deterministic SHA-256 assignment of complete book.chapter groups; no chapter crosses train/development',
  },
  counts: selection.counts,
  chapter_partitions: chapterPartitions,
  components: {
    train: {
      path: 'train.jsonl',
      sha256: componentHashes.train,
      rows: selection.counts.train,
    },
    development: {
      path: 'development.jsonl',
      sha256: componentHashes.development,
      rows: selection.counts.development,
    },
    exclusions: {
      path: 'exclusions.jsonl',
      sha256: componentHashes.exclusions,
      rows: selection.exclusions.length,
    },
  },
  release_contract: {
    private_research_training_eligible: true,
    public_dataset_permission_attested: true,
    public_dataset_release_eligible: false,
    model_release_eligible: false,
    reason:
      'permission is admitted, but qualified review, model evaluation, immutable release, and live-runtime gates remain independent',
  },
  limitations: [
    'Scripture-domain parallel evidence is not representative free-form conversational coverage.',
    'Permission is operator-attested and was not independently document-verified by the agent.',
    'Alignment was machine-produced; selected rows remain candidates pending linguistic quality review.',
    'This edition cannot itself authorize dictionary lookup, controlled generation, free-form generation, or public release.',
  ],
};
const manifestContent = `${JSON.stringify(manifest, null, 2)}\n`;

const outputRoot = resolveWithin(programRoot, contract.output_directory);
writeImmutable(path.join(outputRoot, 'train.jsonl'), trainContent);
writeImmutable(path.join(outputRoot, 'development.jsonl'), developmentContent);
writeImmutable(path.join(outputRoot, 'exclusions.jsonl'), exclusionsContent);
writeImmutable(path.join(outputRoot, 'MANIFEST.json'), manifestContent);
writeImmutable(
  path.join(outputRoot, 'SHA256SUMS'),
  [
    `${componentHashes.train}  train.jsonl`,
    `${componentHashes.development}  development.jsonl`,
    `${componentHashes.exclusions}  exclusions.jsonl`,
    `${sha256(manifestContent)}  MANIFEST.json`,
  ]
    .join('\n')
    .concat('\n'),
);

process.stdout.write(
  `${JSON.stringify({
    edition_id: contract.edition_id,
    output_directory: contract.output_directory,
    counts: selection.counts,
    manifest_sha256: sha256(manifestContent),
  })}\n`,
);
