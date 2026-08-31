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

type Contract = {
  schema_version: 1;
  edition_id: string;
  created_at_utc: string;
  language: Record<string, string>;
  source: {
    source_id: string;
    inventory_rows_path: string;
    inventory_rows_sha256: string;
    inventory_summary_path: string;
    inventory_summary_sha256: string;
    duplicate_headwords_path: string;
    duplicate_headwords_sha256: string;
    exact_duplicates_path: string;
    exact_duplicates_sha256: string;
  };
  source_ledger: { path: string; sha256: string };
  method: Record<string, string>;
  release_contract: Record<string, unknown>;
  output_directory: string;
};

type InventoryRow = {
  source_index: number;
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
  flags: {
    normalized_headword: string;
    multi_token_headword: boolean;
    question_like: boolean;
    editorial_marker: boolean;
  };
};

type DuplicateGroup = { key: string; count: number; entry_ids: string[] };

function flagValue(flag: string): string {
  const index = process.argv.indexOf(flag);
  if (index < 0 || !process.argv[index + 1]) {
    throw new Error(`missing required ${flag} PATH`);
  }
  return process.argv[index + 1];
}

function resolveWithin(root: string, relativePath: string): string {
  if (path.isAbsolute(relativePath)) throw new Error('absolute path refused');
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

function readVerified(
  root: string,
  relativePath: string,
  expectedHash: string,
): Buffer {
  const bytes = readFileSync(resolveWithin(root, relativePath));
  const actualHash = sha256(bytes);
  if (actualHash !== expectedHash) {
    throw new Error(
      `hash mismatch for ${relativePath}: ${actualHash} != ${expectedHash}`,
    );
  }
  return bytes;
}

function parseJsonLines<T>(bytes: Buffer): T[] {
  return bytes
    .toString('utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as T);
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

const programRoot = path.resolve(flagValue('--program-root'));
const contractPath = resolveWithin(programRoot, flagValue('--contract'));
const contractBytes = readFileSync(contractPath);
const contract = JSON.parse(contractBytes.toString('utf8')) as Contract;
if (contract.schema_version !== 1) throw new Error('unsupported schema');

const inventoryRows = parseJsonLines<InventoryRow>(
  readVerified(
    programRoot,
    contract.source.inventory_rows_path,
    contract.source.inventory_rows_sha256,
  ),
);
const inventorySummary = JSON.parse(
  readVerified(
    programRoot,
    contract.source.inventory_summary_path,
    contract.source.inventory_summary_sha256,
  ).toString('utf8'),
) as { counts: { source_rows: number; audio_reference_slots: number } };
const duplicateHeadwords = parseJsonLines<DuplicateGroup>(
  readVerified(
    programRoot,
    contract.source.duplicate_headwords_path,
    contract.source.duplicate_headwords_sha256,
  ),
);
const exactDuplicates = parseJsonLines<DuplicateGroup>(
  readVerified(
    programRoot,
    contract.source.exact_duplicates_path,
    contract.source.exact_duplicates_sha256,
  ),
);
readVerified(
  programRoot,
  contract.source_ledger.path,
  contract.source_ledger.sha256,
);
if (inventoryRows.length !== inventorySummary.counts.source_rows) {
  throw new Error('inventory row count does not match summary');
}
const ids = new Set(inventoryRows.map((row) => row.id));
if (ids.size !== inventoryRows.length) throw new Error('source IDs not unique');

const entries = inventoryRows.map((row) => ({
  schema_version: 1,
  entry_id: `${contract.edition_id}:entry:${row.id}`,
  edition_id: contract.edition_id,
  source_id: contract.source.source_id,
  source_entry_id: row.id,
  source_ordinal: row.source_index + 1,
  headword_source: row.hw,
  headword_comparison: row.flags.normalized_headword,
  search_key_source: row.sk,
  minimum_pattern_source: row.min,
  first_letter_primary_source: row.flp,
  first_letter_alternate_source: row.fla,
  semantic_domain_source_id: row.sd,
  lexical_identity_status: 'unadjudicated_source_record',
  status: 'candidate',
}));
const senses = inventoryRows.map((row) => ({
  schema_version: 1,
  sense_id: `${contract.edition_id}:sense:${row.id}:1`,
  entry_id: `${contract.edition_id}:entry:${row.id}`,
  source_entry_id: row.id,
  english_gloss_source: row.gl,
  sense_boundary_status: 'unadjudicated_source_gloss',
  substitutable_translation_status: 'unadjudicated',
  status: 'candidate',
}));
const forms = inventoryRows.map((row) => ({
  schema_version: 1,
  form_id: `${contract.edition_id}:form:${row.id}:headword`,
  entry_id: `${contract.edition_id}:entry:${row.id}`,
  surface_source: row.hw,
  surface_comparison: row.flags.normalized_headword,
  form_type: 'source_headword',
  orthography: contract.language.orthography,
  editorial_marker_present: row.flags.editorial_marker,
  morphological_analysis_status: 'unanalysed',
  status: 'candidate',
}));
const mediaLinks = inventoryRows.flatMap((row) =>
  (['aa', 'ae', 'as'] as const).map((channel) => ({
    schema_version: 1,
    media_link_id: `${contract.edition_id}:media:${row.id}:${channel}`,
    entry_id: `${contract.edition_id}:entry:${row.id}`,
    source_entry_id: row.id,
    source_channel: channel,
    source_reference: row[channel],
    media_kind: 'audio_reference',
    archive_path: null,
    speaker_id: 'unknown',
    consent_record_id: null,
    resolution_status: 'source_pointer_unresolved',
    status: 'candidate',
  })),
);
const semanticDomainLinks = inventoryRows.map((row) => ({
  schema_version: 1,
  link_id: `${contract.edition_id}:semantic-domain:${row.id}`,
  entry_id: `${contract.edition_id}:entry:${row.id}`,
  source_domain_id: row.sd,
  source_domain_label: null,
  resolution_status: 'source_id_preserved_label_unknown',
}));
const reviewQueue = [
  ...duplicateHeadwords.map((group) => ({
    schema_version: 1,
    review_id: `${contract.edition_id}:review:duplicate-headword:${sha256(group.key).slice(0, 16)}`,
    review_kind: 'duplicate_headword_identity',
    source_entry_ids: group.entry_ids,
    observed_key: group.key,
    decision_required:
      'distinct senses, inflectional forms, spelling variants, phrases, or duplicate records',
    status: 'pending',
  })),
  ...exactDuplicates.map((group) => ({
    schema_version: 1,
    review_id: `${contract.edition_id}:review:exact-duplicate:${sha256(group.key).slice(0, 16)}`,
    review_kind: 'exact_headword_gloss_duplicate',
    source_entry_ids: group.entry_ids,
    observed_key: group.key,
    decision_required:
      'retain as separately sourced records or supersede with explicit lineage',
    status: 'pending',
  })),
  ...inventoryRows
    .filter((row) => row.flags.editorial_marker)
    .map((row) => ({
      schema_version: 1,
      review_id: `${contract.edition_id}:review:editorial-marker:${row.id}`,
      review_kind: 'editorial_marker',
      source_entry_ids: [row.id],
      observed_key: row.hw,
      decision_required:
        'recover marker meaning and clean display form without altering source evidence',
      status: 'pending',
    })),
  ...inventoryRows
    .filter((row) => row.flags.multi_token_headword || row.flags.question_like)
    .map((row) => ({
      schema_version: 1,
      review_id: `${contract.edition_id}:review:entry-role:${row.id}`,
      review_kind: 'lexical_entry_vs_phrase_or_sentence',
      source_entry_ids: [row.id],
      observed_key: row.hw,
      decision_required:
        'classify as lexeme, multiword expression, example phrase, or sentence',
      status: 'pending',
    })),
];

const components = {
  'entries.jsonl': jsonLines(entries),
  'senses.jsonl': jsonLines(senses),
  'forms.jsonl': jsonLines(forms),
  'media-links.jsonl': jsonLines(mediaLinks),
  'semantic-domain-links.jsonl': jsonLines(semanticDomainLinks),
  'review-queue.jsonl': jsonLines(reviewQueue),
};
const manifest = {
  schema_version: 1,
  edition_id: contract.edition_id,
  created_at_utc: contract.created_at_utc,
  status: contract.release_contract.status,
  language: contract.language,
  contract: {
    path: path.relative(programRoot, contractPath),
    sha256: sha256(contractBytes),
  },
  source: contract.source,
  method: contract.method,
  components: Object.fromEntries(
    Object.entries(components).map(([name, content]) => [
      name.replace('.jsonl', '').replaceAll('-', '_'),
      {
        path: `${contract.output_directory}/${name}`,
        sha256: sha256(content),
        rows: content.trim().split('\n').length,
      },
    ]),
  ),
  counts: {
    entries: entries.length,
    senses: senses.length,
    forms: forms.length,
    media_links: mediaLinks.length,
    semantic_domain_links: semanticDomainLinks.length,
    review_items: reviewQueue.length,
    duplicate_headword_groups: duplicateHeadwords.length,
    exact_duplicate_groups: exactDuplicates.length,
  },
  release_contract: contract.release_contract,
  claim_limit:
    'Candidate source-preserving edition only. It is not a speaker-reviewed dictionary, training corpus, or free-form translation capability.',
};
const manifestContent = `${JSON.stringify(manifest, null, 2)}\n`;

if (!process.argv.includes('--write')) {
  console.log(JSON.stringify(manifest, null, 2));
  process.exit(0);
}
const outputRoot = resolveWithin(programRoot, contract.output_directory);
for (const [name, content] of Object.entries(components)) {
  writeImmutable(path.join(outputRoot, name), content);
}
writeImmutable(path.join(outputRoot, 'MANIFEST.json'), manifestContent);
const sums = [
  ...Object.entries(components).map(
    ([name, content]) => `${sha256(content)}  ${name}`,
  ),
  `${sha256(manifestContent)}  MANIFEST.json`,
].join('\n');
writeImmutable(path.join(outputRoot, 'SHA256SUMS'), `${sums}\n`);
console.log(JSON.stringify(manifest, null, 2));
