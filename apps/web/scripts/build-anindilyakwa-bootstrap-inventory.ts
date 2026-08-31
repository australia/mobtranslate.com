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
import yaml from 'js-yaml';

const SCRIPT_VERSION = 'anindilyakwa-bootstrap-inventory-v1';
const INVENTORY_DATE = '2026-08-08';

type TalkingDictionaryRow = {
  id: string;
  hw: string;
  sk: string;
  min: string;
  flp: string;
  fla: string;
  gl: string;
  aa: string;
  ae: string;
  as: string;
  sd: string;
};

type ProjectedYamlRow = {
  word: string;
  definitions: string[];
  translations: string[];
};

function valueAfter(flag: string): string {
  const index = process.argv.indexOf(flag);
  if (index < 0 || !process.argv[index + 1]) {
    throw new Error(`missing required ${flag} PATH`);
  }
  return path.resolve(process.argv[index + 1]);
}

function sha256(buffer: Buffer | string): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function writeNewFile(filePath: string, contents: string): void {
  if (existsSync(filePath)) {
    if (readFileSync(filePath, 'utf8') !== contents) {
      throw new Error(`refusing to rewrite immutable artifact: ${filePath}`);
    }
    return;
  }
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  writeFileSync(temporaryPath, contents, { encoding: 'utf8', flag: 'wx' });
  renameSync(temporaryPath, filePath);
}

function parseTalkingDictionary(source: string): TalkingDictionaryRow[] {
  const prefix = 'const dictionary = ';
  const start = source.indexOf(prefix);
  if (start < 0)
    throw new Error('talking dictionary array declaration not found');
  const arrayStart = source.indexOf('[', start + prefix.length);
  const arrayEnd = source.indexOf('\n  ];', arrayStart);
  if (arrayStart < 0 || arrayEnd < 0) {
    throw new Error('talking dictionary array bounds not found');
  }
  const parsed = JSON.parse(source.slice(arrayStart, arrayEnd + 4)) as unknown;
  if (!Array.isArray(parsed))
    throw new Error('talking dictionary is not an array');

  const requiredFields = [
    'id',
    'hw',
    'sk',
    'min',
    'flp',
    'fla',
    'gl',
    'aa',
    'ae',
    'as',
    'sd',
  ] as const;
  for (const [index, row] of parsed.entries()) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw new Error(`talking dictionary row ${index} is not an object`);
    }
    for (const field of requiredFields) {
      if (typeof (row as Record<string, unknown>)[field] !== 'string') {
        throw new Error(`talking dictionary row ${index} has invalid ${field}`);
      }
    }
  }
  return parsed as TalkingDictionaryRow[];
}

function parseProjectedYaml(source: string): ProjectedYamlRow[] {
  const parsed = yaml.load(source) as unknown;
  if (!Array.isArray(parsed))
    throw new Error('projected dictionary is not an array');
  for (const [index, row] of parsed.entries()) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw new Error(`projected dictionary row ${index} is not an object`);
    }
    const candidate = row as Record<string, unknown>;
    if (
      typeof candidate.word !== 'string' ||
      !Array.isArray(candidate.definitions) ||
      !candidate.definitions.every((value) => typeof value === 'string') ||
      !Array.isArray(candidate.translations) ||
      !candidate.translations.every((value) => typeof value === 'string')
    ) {
      throw new Error(`projected dictionary row ${index} has an invalid shape`);
    }
  }
  return parsed as ProjectedYamlRow[];
}

function normalized(value: string): string {
  return value.normalize('NFC').trim().toLocaleLowerCase('en');
}

function duplicateGroups(
  rows: TalkingDictionaryRow[],
  keyFor: (row: TalkingDictionaryRow) => string,
): Array<{ key: string; count: number; entry_ids: string[] }> {
  const groups = new Map<string, string[]>();
  for (const row of rows) {
    const key = keyFor(row);
    const ids = groups.get(key) ?? [];
    ids.push(row.id);
    groups.set(key, ids);
  }
  return [...groups.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([key, ids]) => ({ key, count: ids.length, entry_ids: ids }))
    .sort((left, right) => left.key.localeCompare(right.key));
}

const repositoryRoot = valueAfter('--repository-root');
const outputRoot = valueAfter('--output-root');
if (!process.argv.includes('--write')) {
  throw new Error('refusing to write without --write');
}

const talkingDictionaryPath = path.join(
  repositoryRoot,
  'apps/web/public/dictionaries/anindilyakwa/transcribe.js',
);
const projectedYamlPath = path.join(
  repositoryRoot,
  'dictionaries/anindilyakwa/dictionary.yaml',
);
const talkingDictionaryBytes = readFileSync(talkingDictionaryPath);
const projectedYamlBytes = readFileSync(projectedYamlPath);
const talkingRows = parseTalkingDictionary(
  talkingDictionaryBytes.toString('utf8'),
);
const yamlRows = parseProjectedYaml(projectedYamlBytes.toString('utf8'));

if (talkingRows.length !== yamlRows.length) {
  throw new Error(
    `row count differs: talking=${talkingRows.length}, yaml=${yamlRows.length}`,
  );
}

const idSet = new Set(talkingRows.map((row) => row.id));
if (idSet.size !== talkingRows.length)
  throw new Error('entry IDs are not unique');

const projectionMismatches = talkingRows.flatMap((sourceRow, index) => {
  const projectedRow = yamlRows[index];
  const expected = {
    word: sourceRow.hw,
    definitions: [sourceRow.gl],
    translations: [sourceRow.gl],
  };
  return JSON.stringify(projectedRow) === JSON.stringify(expected)
    ? []
    : [{ index, source_id: sourceRow.id, expected, observed: projectedRow }];
});

const duplicateHeadwords = duplicateGroups(talkingRows, (row) =>
  normalized(row.hw),
);
const duplicateExactRows = duplicateGroups(
  talkingRows,
  (row) => `${normalized(row.hw)}\u0000${normalized(row.gl)}`,
);
const semanticDomains = [...new Set(talkingRows.map((row) => row.sd))].sort();
const audioReferenceCount = talkingRows.reduce(
  (total, row) => total + [row.aa, row.ae, row.as].filter(Boolean).length,
  0,
);
const questionRows = talkingRows.filter(
  (row) => row.hw.includes('?') || row.gl.includes('?'),
);
const multiTokenRows = talkingRows.filter((row) => row.hw.trim().includes(' '));
const markerRows = talkingRows.filter((row) => /\*|\.\.\./u.test(row.hw));

const sourceHashes = {
  talking_dictionary_transcribe_js: sha256(talkingDictionaryBytes),
  projected_dictionary_yaml: sha256(projectedYamlBytes),
};
const summary = {
  schema_version: 1,
  script_version: SCRIPT_VERSION,
  inventory_date: INVENTORY_DATE,
  language: {
    name: 'Anindilyakwa',
    iso_639_3: 'aoi',
  },
  source_files: {
    talking_dictionary: {
      repository_relative_path:
        'apps/web/public/dictionaries/anindilyakwa/transcribe.js',
      sha256: sourceHashes.talking_dictionary_transcribe_js,
      role: 'richest_local_talking_dictionary_representation',
    },
    projected_yaml: {
      repository_relative_path: 'dictionaries/anindilyakwa/dictionary.yaml',
      sha256: sourceHashes.projected_dictionary_yaml,
      role: 'lossy_headword_gloss_projection',
    },
  },
  counts: {
    source_rows: talkingRows.length,
    projected_rows: yamlRows.length,
    stable_entry_ids: idSet.size,
    distinct_normalized_headwords: new Set(
      talkingRows.map((row) => normalized(row.hw)),
    ).size,
    duplicate_headword_groups: duplicateHeadwords.length,
    entries_in_duplicate_headword_groups: duplicateHeadwords.reduce(
      (total, group) => total + group.count,
      0,
    ),
    exact_headword_gloss_duplicate_groups: duplicateExactRows.length,
    entries_in_exact_duplicate_groups: duplicateExactRows.reduce(
      (total, group) => total + group.count,
      0,
    ),
    semantic_domains: semanticDomains.length,
    audio_reference_slots: audioReferenceCount,
    expected_audio_reference_slots: talkingRows.length * 3,
    question_rows: questionRows.length,
    multi_token_headword_rows: multiTokenRows.length,
    editorial_marker_rows: markerRows.length,
    projection_mismatches: projectionMismatches.length,
  },
  semantic_domain_ids: semanticDomains,
  completeness: Object.fromEntries(
    ['id', 'hw', 'sk', 'min', 'flp', 'fla', 'gl', 'aa', 'ae', 'as', 'sd'].map(
      (field) => [
        field,
        talkingRows.filter((row) =>
          Boolean(row[field as keyof TalkingDictionaryRow].trim()),
        ).length,
      ],
    ),
  ),
  interpretation: {
    projection_exact_by_row:
      projectionMismatches.length === 0 &&
      talkingRows.length === yamlRows.length,
    evidence_boundary:
      'Audio fields are reference identifiers only; this inventory does not claim that audio media files were located or licensed.',
    sentence_boundary:
      'Question and multi-token counts are mechanical discovery aids, not proof of an independently reviewed sentence corpus.',
    training_boundary:
      'No row in this inventory is promoted to sentence-generation supervision without source-role and review-state labels.',
  },
};

const materializedRows = talkingRows.map((row, index) => ({
  source_index: index,
  ...row,
  projected_yaml: yamlRows[index],
  flags: {
    normalized_headword: normalized(row.hw),
    multi_token_headword: row.hw.trim().includes(' '),
    question_like: row.hw.includes('?') || row.gl.includes('?'),
    editorial_marker: /\*|\.\.\./u.test(row.hw),
  },
}));

mkdirSync(outputRoot, { recursive: true });
writeNewFile(path.join(outputRoot, 'summary.json'), stableJson(summary));
writeNewFile(
  path.join(outputRoot, 'rows.jsonl'),
  materializedRows.map((row) => JSON.stringify(row)).join('\n') + '\n',
);
writeNewFile(
  path.join(outputRoot, 'duplicate-headwords.jsonl'),
  duplicateHeadwords.map((row) => JSON.stringify(row)).join('\n') + '\n',
);
writeNewFile(
  path.join(outputRoot, 'exact-duplicate-rows.jsonl'),
  duplicateExactRows.map((row) => JSON.stringify(row)).join('\n') + '\n',
);
writeNewFile(
  path.join(outputRoot, 'projection-mismatches.jsonl'),
  projectionMismatches.map((row) => JSON.stringify(row)).join('\n') +
    (projectionMismatches.length > 0 ? '\n' : ''),
);

const generatedFiles = [
  'duplicate-headwords.jsonl',
  'exact-duplicate-rows.jsonl',
  'projection-mismatches.jsonl',
  'rows.jsonl',
  'summary.json',
];
const sums = generatedFiles
  .map((fileName) => {
    const digest = sha256(readFileSync(path.join(outputRoot, fileName)));
    return `${digest}  ${fileName}`;
  })
  .join('\n');
writeNewFile(path.join(outputRoot, 'SHA256SUMS'), `${sums}\n`);

console.log(JSON.stringify(summary, null, 2));
