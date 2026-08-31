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

type CorpusRow = {
  schema_version: number;
  pair_id: string;
  source_language: string;
  target_language: string;
  source_text: string;
  target_text: string;
  pair_kind: string;
  canonical_ref: string;
  chapter_group: string;
  partition: 'train' | 'development';
  permission_evidence_class: string;
  benchmark_overlap: boolean;
};

type TrainingRow = {
  schema_version: 1;
  id: string;
  direction: 'eng-aoi';
  input_text: string;
  output_text: string;
  pair_kind: string;
  task: 'scripture_translation';
  chapter_group: string;
  canonical_ref: string;
  permission_evidence_class: string;
};

function value(flag: string): string {
  const index = process.argv.indexOf(flag);
  if (index < 0 || !process.argv[index + 1]) {
    throw new Error(`missing required ${flag}`);
  }
  return process.argv[index + 1];
}

function sha256(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function sha256File(filePath: string): string {
  return sha256(readFileSync(filePath));
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
  return `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`;
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

function normalizeText(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[\u2018\u2019]/gu, "'")
    .replace(/[\u201c\u201d]/gu, '"')
    .replace(/\u2014/gu, '-')
    .replace(/\s+/gu, ' ')
    .trim();
}

function buildRows(
  rows: CorpusRow[],
  partition: CorpusRow['partition'],
): TrainingRow[] {
  const ids = new Set<string>();
  return rows.map((row, index) => {
    if (row.partition !== partition) {
      throw new Error(
        `${partition}:${index + 1} has partition ${row.partition}`,
      );
    }
    if (
      row.source_language !== 'eng' ||
      row.target_language !== 'aoi' ||
      row.benchmark_overlap !== false
    ) {
      throw new Error(
        `${partition}:${index + 1} violates the admitted direction or benchmark boundary`,
      );
    }
    if (
      row.permission_evidence_class !==
      'operator_attestation_without_documentary_exhibition'
    ) {
      throw new Error(
        `${partition}:${index + 1} has an unexpected permission evidence class`,
      );
    }
    if (ids.has(row.pair_id)) {
      throw new Error(`duplicate pair id in ${partition}: ${row.pair_id}`);
    }
    ids.add(row.pair_id);
    const inputText = normalizeText(row.source_text);
    const outputText = normalizeText(row.target_text);
    if (!inputText || !outputText || !row.chapter_group || !row.canonical_ref) {
      throw new Error(`${partition}:${index + 1} has an empty required field`);
    }
    return {
      schema_version: 1,
      id: row.pair_id,
      direction: 'eng-aoi',
      input_text: inputText,
      output_text: outputText,
      pair_kind: row.pair_kind,
      task: 'scripture_translation',
      chapter_group: row.chapter_group,
      canonical_ref: row.canonical_ref,
      permission_evidence_class: row.permission_evidence_class,
    };
  });
}

const sourceEdition = path.resolve(value('--source-edition'));
const expectedManifestSha256 = value('--expected-manifest-sha256');
const outputDirectory = path.resolve(value('--output-dir'));
const createdAtUtc = value('--created-at-utc');
const sourceManifestPath = path.join(sourceEdition, 'MANIFEST.json');
if (sha256File(sourceManifestPath) !== expectedManifestSha256) {
  throw new Error('source corpus manifest hash mismatch');
}
const sourceManifest = JSON.parse(
  readFileSync(sourceManifestPath, 'utf8'),
) as Record<string, unknown>;
if (
  sourceManifest.edition_id !== 'anindilyakwa-owner-attested-parallel-v0.3.0'
) {
  throw new Error(
    `unexpected source edition: ${String(sourceManifest.edition_id)}`,
  );
}

const sourcePaths = {
  train: path.join(sourceEdition, 'train.jsonl'),
  development: path.join(sourceEdition, 'development.jsonl'),
};
const train = buildRows(readJsonLines<CorpusRow>(sourcePaths.train), 'train');
const development = buildRows(
  readJsonLines<CorpusRow>(sourcePaths.development),
  'development',
);
const globalIds = new Set(train.map((row) => row.id));
for (const row of development) {
  if (globalIds.has(row.id))
    throw new Error(`pair id crosses splits: ${row.id}`);
  globalIds.add(row.id);
}
const trainGroups = new Set(train.map((row) => row.chapter_group));
const crossingGroups = [
  ...new Set(
    development
      .map((row) => row.chapter_group)
      .filter((group) => trainGroups.has(group)),
  ),
];
if (crossingGroups.length) {
  throw new Error(`chapter groups cross splits: ${crossingGroups.join(', ')}`);
}

const trainContent = jsonLines(train);
const developmentContent = jsonLines(development);
const builderPath = path.resolve(process.argv[1]);
const manifest = {
  schema_version: 1,
  edition_id: 'anindilyakwa-nllb-research-view-v0.1.1',
  created_at_utc: createdAtUtc,
  status: 'PASS',
  purpose: 'model-facing research-training view; not a public dataset release',
  direction: 'eng-aoi',
  source_language_token: 'eng_Latn',
  target_language_token: 'aoi_Latn',
  task: 'scripture_translation',
  normalization: {
    unicode: 'NFKC',
    whitespace: 'collapse Unicode whitespace and trim',
    punctuation: {
      'U+2018': 'U+0027 APOSTROPHE',
      'U+2019': 'U+0027 APOSTROPHE',
      'U+201C': 'U+0022 QUOTATION MARK',
      'U+201D': 'U+0022 QUOTATION MARK',
      'U+2014': 'U+002D HYPHEN-MINUS',
    },
    scope:
      'model-facing view only; canonical source corpus text remains unchanged and hash-bound',
  },
  source_corpus: {
    edition_id: sourceManifest.edition_id,
    manifest_path: sourceManifestPath,
    manifest_sha256: expectedManifestSha256,
    files: {
      train: { path: sourcePaths.train, sha256: sha256File(sourcePaths.train) },
      development: {
        path: sourcePaths.development,
        sha256: sha256File(sourcePaths.development),
      },
    },
  },
  rows: { train: train.length, development: development.length },
  split_groups: {
    field: 'chapter_group',
    train: trainGroups.size,
    development: new Set(development.map((row) => row.chapter_group)).size,
    crossing: crossingGroups.length,
  },
  model_facing_fields: [
    'direction',
    'id',
    'input_text',
    'output_text',
    'pair_kind',
    'task',
    'chapter_group',
  ],
  components: {
    train: { path: 'train.jsonl', sha256: sha256(trainContent) },
    development: {
      path: 'development.jsonl',
      sha256: sha256(developmentContent),
    },
  },
  builder: { path: builderPath, sha256: sha256File(builderPath) },
  claim_limit:
    'Rows retain scripture-domain limitations and operator-attested permission evidence. This view establishes no model quality, linguistic review, public-release eligibility, or free-form competence.',
};
const manifestContent = `${JSON.stringify(manifest, null, 2)}\n`;
const checksums = [
  `${sha256(developmentContent)}  development.jsonl`,
  `${sha256(manifestContent)}  MANIFEST.json`,
  `${sha256(trainContent)}  train.jsonl`,
]
  .join('\n')
  .concat('\n');

writeImmutable(path.join(outputDirectory, 'train.jsonl'), trainContent);
writeImmutable(
  path.join(outputDirectory, 'development.jsonl'),
  developmentContent,
);
writeImmutable(path.join(outputDirectory, 'MANIFEST.json'), manifestContent);
writeImmutable(path.join(outputDirectory, 'SHA256SUMS'), checksums);

process.stdout.write(
  `${JSON.stringify({ output_directory: outputDirectory, ...manifest }, null, 2)}\n`,
);
