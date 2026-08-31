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

type InputFile = { path: string; sha256: string };
type Contract = {
  schema_version: 1;
  suite_id: string;
  created_at_utc: string;
  language: { name: string; iso_639_3: string };
  seed: string;
  test_bucket_modulus: number;
  test_bucket_values: number[];
  inputs: {
    dictionary_entries: InputFile;
    dictionary_senses: InputFile;
    sentence_evidence: InputFile;
    grammar_claims: InputFile;
  };
  release_contract: Record<string, unknown>;
  route_gates: Record<string, unknown>;
  output_directory: string;
};

type Entry = {
  entry_id: string;
  source_entry_id: string;
  headword_source: string;
  headword_comparison: string;
  semantic_domain_source_id: string;
};
type Sense = {
  sense_id: string;
  entry_id: string;
  english_gloss_source: string;
};
type SentenceEvidence = {
  evidence_id: string;
  example: string;
  interlinear_gloss: string;
  english_translation: string;
  example_source: string;
  verb_roots: string[];
  verb_root_glosses: string[];
  aktionsart_labels: string[];
  genres: string[];
};

function flagValue(flag: string): string {
  const index = process.argv.indexOf(flag);
  if (index < 0 || !process.argv[index + 1]) {
    throw new Error(`missing required ${flag} PATH`);
  }
  return process.argv[index + 1];
}

function resolveWithin(root: string, relativePath: string): string {
  if (path.isAbsolute(relativePath))
    throw new Error('input path must be relative');
  const resolved = path.resolve(root, relativePath);
  const relative = path.relative(root, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`path escapes program root: ${relativePath}`);
  }
  return resolved;
}

function sha256(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex');
}

function readVerified(root: string, input: InputFile): Buffer {
  const bytes = readFileSync(resolveWithin(root, input.path));
  if (sha256(bytes) !== input.sha256) {
    throw new Error(`input hash mismatch: ${input.path}`);
  }
  return bytes;
}

function parseJsonl<T>(bytes: Buffer): T[] {
  return bytes
    .toString('utf8')
    .trimEnd()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

function normalized(value: string): string {
  return value
    .normalize('NFC')
    .replace(/[‘’]/gu, "'")
    .replace(/\s+/gu, ' ')
    .trim();
}

function clusterKeyForCitation(value: string): string {
  return normalized(value)
    .replace(
      /\b\d{1,2}[.:]\d{2}(?:[.:]\d{2})?(?:\.\d+)?\s*[-–]\s*\d{1,2}[.:]\d{2}(?:[.:]\d{2})?(?:\.\d+)?\b/gu,
      '',
    )
    .replace(/:\s*\d+(?:\s*[-–]\s*\d+)?\s*$/gu, '')
    .replace(/[;,]\s*$/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

function partitionForGroup(
  groupKey: string,
  contract: Contract,
): 'development' | 'test' {
  const bucket =
    Number.parseInt(
      sha256(`${contract.seed}\u0000${groupKey}`).slice(0, 8),
      16,
    ) % contract.test_bucket_modulus;
  return contract.test_bucket_values.includes(bucket) ? 'test' : 'development';
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
const contractPath = resolveWithin(programRoot, flagValue('--contract'));
const contractBytes = readFileSync(contractPath);
const contract = JSON.parse(contractBytes.toString('utf8')) as Contract;
if (contract.schema_version !== 1)
  throw new Error('unsupported contract schema');

const entryBytes = readVerified(
  programRoot,
  contract.inputs.dictionary_entries,
);
const senseBytes = readVerified(programRoot, contract.inputs.dictionary_senses);
const sentenceBytes = readVerified(
  programRoot,
  contract.inputs.sentence_evidence,
);
readVerified(programRoot, contract.inputs.grammar_claims);
const entries = parseJsonl<Entry>(entryBytes);
const senses = parseJsonl<Sense>(senseBytes);
const sentences = parseJsonl<SentenceEvidence>(sentenceBytes);

const sensesByEntry = new Map<string, Sense[]>();
for (const sense of senses) {
  const rows = sensesByEntry.get(sense.entry_id) ?? [];
  rows.push(sense);
  sensesByEntry.set(sense.entry_id, rows);
}

const lexicalRows = entries
  .map((entry) => {
    const groupKey = normalized(entry.headword_comparison).toLocaleLowerCase(
      'und',
    );
    return {
      schema_version: 1,
      benchmark_id: `${contract.suite_id}:lexical:${entry.source_entry_id}`,
      task: 'closed_set_lexical_reconstruction',
      partition: partitionForGroup(`lexical:${groupKey}`, contract),
      leakage_group: `headword:${sha256(groupKey).slice(0, 20)}`,
      prompt_english_glosses: (sensesByEntry.get(entry.entry_id) ?? []).map(
        (sense) => sense.english_gloss_source,
      ),
      expected_anindilyakwa: entry.headword_source,
      source_entry_id: entry.source_entry_id,
      semantic_domain_source_id: entry.semantic_domain_source_id,
      review_state: 'candidate_dictionary_not_language_reviewed',
      training_exposed: false,
      permanently_excluded_from_training: true,
    };
  })
  .sort((left, right) => left.benchmark_id.localeCompare(right.benchmark_id));

const naturalRows = sentences
  .map((row) => {
    const sourceCluster = clusterKeyForCitation(row.example_source);
    return {
      schema_version: 1,
      benchmark_id: `${contract.suite_id}:natural:${row.evidence_id.split(':').at(-1)}`,
      task: 'independent_natural_sentence_translation',
      partition: partitionForGroup(`natural:${sourceCluster}`, contract),
      leakage_group: `source-cluster:${sha256(sourceCluster).slice(0, 20)}`,
      input_english: row.english_translation,
      expected_anindilyakwa: row.example,
      source_evidence_id: row.evidence_id,
      source_reference: row.example_source,
      genres: row.genres,
      review_state: 'published_evidence_benchmark_candidate_not_model_reviewed',
      training_exposed: false,
      permanently_excluded_from_training: true,
    };
  })
  .sort((left, right) => left.benchmark_id.localeCompare(right.benchmark_id));

const morphologyRows = sentences
  .map((row) => {
    const sourceCluster = clusterKeyForCitation(row.example_source);
    return {
      schema_version: 1,
      benchmark_id: `${contract.suite_id}:morphology:${row.evidence_id.split(':').at(-1)}`,
      task: 'source_backed_morphology_analysis',
      partition: partitionForGroup(`natural:${sourceCluster}`, contract),
      leakage_group: `source-cluster:${sha256(sourceCluster).slice(0, 20)}`,
      input_anindilyakwa: row.example,
      expected_interlinear_gloss: row.interlinear_gloss,
      expected_english: row.english_translation,
      annotated_verb_roots: row.verb_roots,
      annotated_verb_root_glosses: row.verb_root_glosses,
      annotated_aktionsart: row.aktionsart_labels,
      source_evidence_id: row.evidence_id,
      review_state: 'published_evidence_benchmark_candidate_not_model_reviewed',
      training_exposed: false,
      permanently_excluded_from_training: true,
    };
  })
  .sort((left, right) => left.benchmark_id.localeCompare(right.benchmark_id));

const fixedUtteranceRows = lexicalRows
  .filter((row) => /\s/u.test(row.expected_anindilyakwa))
  .map((row) => ({
    ...row,
    benchmark_id: row.benchmark_id.replace(':lexical:', ':fixed-utterance:'),
    task: 'dictionary_attested_multi_token_fixed_utterance',
    review_state: 'phrase_role_unadjudicated_benchmark_candidate',
  }));

for (const rows of [lexicalRows, naturalRows, morphologyRows]) {
  const groupPartitions = new Map<string, Set<string>>();
  for (const row of rows) {
    const partitions =
      groupPartitions.get(row.leakage_group) ?? new Set<string>();
    partitions.add(row.partition);
    groupPartitions.set(row.leakage_group, partitions);
  }
  const leaking = [...groupPartitions].filter(
    ([, partitions]) => partitions.size > 1,
  );
  if (leaking.length > 0) throw new Error('leakage group crosses partitions');
}

const partitionCounts = (rows: Array<{ partition: string }>) =>
  Object.fromEntries(
    ['development', 'test'].map((partition) => [
      partition,
      rows.filter((row) => row.partition === partition).length,
    ]),
  );
const summary = {
  schema_version: 1,
  suite_id: contract.suite_id,
  created_at_utc: contract.created_at_utc,
  language: contract.language,
  contract: {
    path: path.relative(programRoot, contractPath),
    sha256: sha256(contractBytes),
  },
  counts: {
    lexical: lexicalRows.length,
    lexical_partitions: partitionCounts(lexicalRows),
    fixed_utterance_candidates: fixedUtteranceRows.length,
    natural_sentence: naturalRows.length,
    natural_sentence_partitions: partitionCounts(naturalRows),
    morphology: morphologyRows.length,
    morphology_partitions: partitionCounts(morphologyRows),
  },
  leakage_policy: {
    lexical_group:
      'normalized source headword; duplicate headwords never cross partitions',
    natural_and_morphology_group:
      'normalized source citation with time spans and terminal printed-page locators removed; identical source clusters never cross partitions',
    exposure:
      'Every benchmark row is permanently excluded from model training, synthetic demonstrations, retrieval exemplars, prompt few-shot examples, and model selection outside its declared development/test role.',
    sealed_status:
      'The test files are frozen and hash-addressed but not blind or independently escrowed; they are test candidates, not a claim of sealed evaluation.',
  },
  route_gates: contract.route_gates,
  release_contract: contract.release_contract,
};

const outputs = new Map<string, string>([
  [
    'lexical.jsonl',
    `${lexicalRows.map((row) => JSON.stringify(row)).join('\n')}\n`,
  ],
  [
    'fixed-utterances.jsonl',
    `${fixedUtteranceRows.map((row) => JSON.stringify(row)).join('\n')}\n`,
  ],
  [
    'natural-sentences.jsonl',
    `${naturalRows.map((row) => JSON.stringify(row)).join('\n')}\n`,
  ],
  [
    'morphology.jsonl',
    `${morphologyRows.map((row) => JSON.stringify(row)).join('\n')}\n`,
  ],
  ['summary.json', `${JSON.stringify(summary, null, 2)}\n`],
]);
if (!process.argv.includes('--write')) {
  console.log(JSON.stringify(summary, null, 2));
  process.exit(0);
}
const outputRoot = resolveWithin(programRoot, contract.output_directory);
for (const [name, content] of outputs) {
  writeImmutable(path.join(outputRoot, name), content);
}
const sums = [...outputs.entries()]
  .map(([name, content]) => `${sha256(content)}  ${name}`)
  .join('\n');
writeImmutable(path.join(outputRoot, 'SHA256SUMS'), `${sums}\n`);
console.log(JSON.stringify(summary, null, 2));
