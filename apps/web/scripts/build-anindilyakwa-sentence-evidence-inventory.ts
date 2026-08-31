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

type CanonicalSheet = {
  sheet_id: string;
  role: string;
  path: string;
  sha256: string;
};

type Contract = {
  schema_version: 1;
  contract_id: string;
  created_at_utc: string;
  language: { name: string; iso_639_3: string };
  publication: Record<string, unknown>;
  source_archive: { path: string; sha256: string; url: string };
  extraction: Record<string, unknown>;
  canonical_sheets: CanonicalSheet[];
  selection: {
    required_nonempty_columns: string[];
    deduplication_key: string[];
    preserve_columns: string[];
    exclude_exact_header_echo_rows?: boolean;
  };
  release_contract: Record<string, unknown>;
  output_directory: string;
};

function flagValue(flag: string): string {
  const index = process.argv.indexOf(flag);
  if (index < 0 || !process.argv[index + 1]) {
    throw new Error(`missing required ${flag} PATH`);
  }
  return process.argv[index + 1];
}

function resolveWithin(root: string, relativePath: string): string {
  if (path.isAbsolute(relativePath)) {
    throw new Error(`path must be relative to program root: ${relativePath}`);
  }
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

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
      continue;
    }
    if (character === '"') {
      quoted = true;
    } else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n') {
      row.push(field.replace(/\r$/u, ''));
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }
  if (quoted) throw new Error('CSV ends inside a quoted field');
  if (field.length > 0 || row.length > 0) {
    row.push(field.replace(/\r$/u, ''));
    rows.push(row);
  }
  return rows;
}

function normalized(value: string): string {
  return value.normalize('NFC').replace(/\s+/gu, ' ').trim();
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

const archiveBytes = readFileSync(
  resolveWithin(programRoot, contract.source_archive.path),
);
if (sha256(archiveBytes) !== contract.source_archive.sha256) {
  throw new Error('source archive hash mismatch');
}

type EvidenceObservation = {
  schema_version: 1;
  evidence_id: string;
  sheet_id: string;
  sheet_role: string;
  source_row_number: number;
  verb_root: string;
  verb_root_gloss: string;
  aktionsart: string;
  example: string;
  interlinear_gloss: string;
  english_translation: string;
  example_source: string;
  genre: string;
  review_state: 'published_scholarly_evidence_not_model_reviewed';
  training_exposed: false;
};

const observations: EvidenceObservation[] = [];
const sheetSummaries: Array<Record<string, unknown>> = [];
for (const sheet of contract.canonical_sheets) {
  const sheetBytes = readFileSync(resolveWithin(programRoot, sheet.path));
  if (sha256(sheetBytes) !== sheet.sha256) {
    throw new Error(`sheet hash mismatch: ${sheet.sheet_id}`);
  }
  const csvRows = parseCsv(sheetBytes.toString('utf8'));
  const headers = csvRows[0] ?? [];
  const firstHeaderIndex = new Map<string, number>();
  headers.forEach((header, index) => {
    if (!firstHeaderIndex.has(header)) firstHeaderIndex.set(header, index);
  });
  const requiredHeaders = new Set([
    ...contract.selection.required_nonempty_columns,
    ...contract.selection.deduplication_key,
    ...contract.selection.preserve_columns,
  ]);
  for (const header of requiredHeaders) {
    if (!firstHeaderIndex.has(header)) {
      throw new Error(`${sheet.sheet_id} lacks required column ${header}`);
    }
  }
  const get = (row: string[], header: string): string =>
    normalized(row[firstHeaderIndex.get(header)!] ?? '');
  let selectedRows = 0;
  let excludedHeaderEchoRows = 0;
  for (let rowIndex = 1; rowIndex < csvRows.length; rowIndex += 1) {
    const row = csvRows[rowIndex];
    if (
      contract.selection.exclude_exact_header_echo_rows &&
      contract.selection.required_nonempty_columns.every(
        (header) => get(row, header) === header,
      )
    ) {
      excludedHeaderEchoRows += 1;
      continue;
    }
    if (
      !contract.selection.required_nonempty_columns.every(
        (header) => get(row, header).length > 0,
      )
    ) {
      continue;
    }
    selectedRows += 1;
    const identity = contract.selection.deduplication_key
      .map((header) => get(row, header))
      .join('\u0000');
    observations.push({
      schema_version: 1,
      evidence_id: `aoi-sentence-evidence:${sha256(identity).slice(0, 24)}`,
      sheet_id: sheet.sheet_id,
      sheet_role: sheet.role,
      source_row_number: rowIndex + 1,
      verb_root: get(row, 'Verb root'),
      verb_root_gloss: get(row, 'Verb root gloss'),
      aktionsart: get(row, 'Aktionsart'),
      example: get(row, 'Example'),
      interlinear_gloss: get(row, 'Example gloss'),
      english_translation: get(row, 'Example translation'),
      example_source: get(row, 'Example source'),
      genre: get(row, 'Genre type of example'),
      review_state: 'published_scholarly_evidence_not_model_reviewed',
      training_exposed: false,
    });
  }
  sheetSummaries.push({
    sheet_id: sheet.sheet_id,
    role: sheet.role,
    path: sheet.path,
    sha256: sheet.sha256,
    csv_rows_excluding_header: Math.max(csvRows.length - 1, 0),
    selected_rows: selectedRows,
    excluded_exact_header_echo_rows: excludedHeaderEchoRows,
  });
}

const grouped = new Map<string, EvidenceObservation[]>();
for (const observation of observations) {
  const rows = grouped.get(observation.evidence_id) ?? [];
  rows.push(observation);
  grouped.set(observation.evidence_id, rows);
}
const evidence = [...grouped.entries()]
  .map(([evidenceId, rows]) => ({
    schema_version: 1,
    evidence_id: evidenceId,
    example: rows[0].example,
    interlinear_gloss: rows[0].interlinear_gloss,
    english_translation: rows[0].english_translation,
    example_source: rows[0].example_source,
    verb_roots: [
      ...new Set(rows.map((row) => row.verb_root).filter(Boolean)),
    ].sort(),
    verb_root_glosses: [
      ...new Set(rows.map((row) => row.verb_root_gloss).filter(Boolean)),
    ].sort(),
    aktionsart_labels: [
      ...new Set(rows.map((row) => row.aktionsart).filter(Boolean)),
    ].sort(),
    genres: [...new Set(rows.map((row) => row.genre).filter(Boolean))].sort(),
    observations: rows.map((row) => ({
      sheet_id: row.sheet_id,
      sheet_role: row.sheet_role,
      source_row_number: row.source_row_number,
    })),
    review_state: 'published_scholarly_evidence_not_model_reviewed',
    training_exposed: false,
  }))
  .sort((left, right) => left.evidence_id.localeCompare(right.evidence_id));

const genreCounts = new Map<string, number>();
const sourceCollectionCounts = new Map<string, number>();
for (const row of evidence) {
  for (const genre of row.genres) {
    genreCounts.set(genre, (genreCounts.get(genre) ?? 0) + 1);
  }
  const collection = row.example_source.split(',')[1]?.trim() || 'unparsed';
  sourceCollectionCounts.set(
    collection,
    (sourceCollectionCounts.get(collection) ?? 0) + 1,
  );
}
const sortedCounts = (counts: Map<string, number>) =>
  [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort(
      (left, right) =>
        right.count - left.count || left.key.localeCompare(right.key),
    );

const summary = {
  schema_version: 1,
  contract_id: contract.contract_id,
  created_at_utc: contract.created_at_utc,
  language: contract.language,
  contract: {
    path: path.relative(programRoot, contractPath),
    sha256: sha256(contractBytes),
  },
  publication: contract.publication,
  source_archive: contract.source_archive,
  extraction: contract.extraction,
  sheets: sheetSummaries,
  counts: {
    selected_observations: observations.length,
    unique_sentence_evidence: evidence.length,
    duplicate_observations: observations.length - evidence.length,
    unique_with_interlinear_gloss: evidence.filter(
      (row) => row.interlinear_gloss.length > 0,
    ).length,
    unique_source_references: new Set(
      evidence.map((row) => row.example_source).filter(Boolean),
    ).size,
    unique_genre_labels: genreCounts.size,
  },
  genres: sortedCounts(genreCounts),
  source_collections: sortedCounts(sourceCollectionCounts),
  release_contract: contract.release_contract,
  interpretation: {
    quality:
      'Authentic published examples with scholarly annotations and recording references; substantially stronger than dictionary-derived sentence-like rows.',
    limitation:
      'The inventory does not assert that publication consent includes generative-model training, public dataset redistribution, or unrestricted inference.',
    next_gate:
      'Complete cultural/model-use review, then freeze leakage-safe train, development, and independent benchmark partitions before any exposure.',
  },
};

const outputRoot = resolveWithin(programRoot, contract.output_directory);
const evidenceContent = `${evidence.map((row) => JSON.stringify(row)).join('\n')}\n`;
const observationsContent = `${observations
  .map((row) => JSON.stringify(row))
  .join('\n')}\n`;
const summaryContent = `${JSON.stringify(summary, null, 2)}\n`;
if (!process.argv.includes('--write')) {
  console.log(JSON.stringify(summary, null, 2));
  process.exit(0);
}
writeImmutable(path.join(outputRoot, 'evidence.jsonl'), evidenceContent);
writeImmutable(
  path.join(outputRoot, 'observations.jsonl'),
  observationsContent,
);
writeImmutable(path.join(outputRoot, 'summary.json'), summaryContent);
const sums = [
  ['evidence.jsonl', evidenceContent],
  ['observations.jsonl', observationsContent],
  ['summary.json', summaryContent],
]
  .map(([name, content]) => `${sha256(content)}  ${name}`)
  .join('\n');
writeImmutable(path.join(outputRoot, 'SHA256SUMS'), `${sums}\n`);
console.log(JSON.stringify(summary, null, 2));
