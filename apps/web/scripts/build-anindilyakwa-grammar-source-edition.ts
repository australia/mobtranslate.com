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

type Unit = {
  unit_id: string;
  kind: 'chapter' | 'appendix';
  label: string;
  title: string;
  start_source_page: number;
};

type ClaimSpec = {
  claim_id: string;
  topic: string;
  assertion: string;
  line_start: number;
  line_end: number;
  expected_source_page: number;
  required_anchor: string;
};

type Contract = {
  schema_version: 1;
  contract_id: string;
  created_at_utc: string;
  language: { name: string; iso_639_3: string };
  source: {
    text_path: string;
    text_sha256: string;
    pdf_path: string;
    pdf_sha256: string;
    rights_state: string;
  };
  linked_example_inventory: {
    path: string;
    sha256: string;
    expected_count: number;
  };
  units: Unit[];
  claims: ClaimSpec[];
  review_topics: Array<{ review_id: string; topic: string; question: string }>;
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

const textPath = resolveWithin(programRoot, contract.source.text_path);
const textBytes = readFileSync(textPath);
if (sha256(textBytes) !== contract.source.text_sha256) {
  throw new Error('thesis text hash mismatch');
}
const pdfBytes = readFileSync(
  resolveWithin(programRoot, contract.source.pdf_path),
);
if (sha256(pdfBytes) !== contract.source.pdf_sha256) {
  throw new Error('thesis PDF hash mismatch');
}
const exampleBytes = readFileSync(
  resolveWithin(programRoot, contract.linked_example_inventory.path),
);
if (sha256(exampleBytes) !== contract.linked_example_inventory.sha256) {
  throw new Error('linked example inventory hash mismatch');
}

const text = textBytes.toString('utf8');
const rawPages = text.split('\f');
if (rawPages.at(-1) !== '') {
  throw new Error(
    'expected the extracted thesis to end at a form-feed boundary',
  );
}
const pages = rawPages.slice(0, -1);
const globalLines = text.split('\n');
const lineToPage: number[] = [];
let pageOrdinal = 1;
for (let index = 0; index < globalLines.length; index += 1) {
  pageOrdinal += (globalLines[index].match(/\f/gu) ?? []).length;
  lineToPage[index + 1] = pageOrdinal;
}

let cumulativeBytes = 0;
const pageIndex = pages.map((pageText, index) => {
  const pageBytes = Buffer.from(pageText, 'utf8');
  const sourcePageOrdinal = index + 1;
  const pageLines = globalLines
    .map((_, lineIndex) => lineIndex + 1)
    .filter((lineNumber) => lineToPage[lineNumber] === sourcePageOrdinal);
  const record = {
    schema_version: 1,
    source_page_ordinal: sourcePageOrdinal,
    byte_start_in_extracted_text: cumulativeBytes,
    byte_end_exclusive_in_extracted_text: cumulativeBytes + pageBytes.length,
    global_line_start: pageLines.at(0) ?? null,
    global_line_end: pageLines.at(-1) ?? null,
    page_text_sha256: sha256(pageBytes),
    printed_page_identity: null,
    identity_note:
      'Physical source-page ordinal in the hash-pinned PDF text extraction; not asserted to equal a printed page label.',
  };
  cumulativeBytes += pageBytes.length + 1;
  return record;
});

for (let index = 0; index < contract.units.length; index += 1) {
  const unit = contract.units[index];
  const next = contract.units[index + 1];
  if (unit.start_source_page < 1 || unit.start_source_page > pages.length) {
    throw new Error(`unit page out of range: ${unit.unit_id}`);
  }
  if (next && next.start_source_page <= unit.start_source_page) {
    throw new Error('unit starts must be strictly increasing');
  }
}
const units = contract.units.map((unit, index) => ({
  schema_version: 1,
  ...unit,
  end_source_page:
    (contract.units[index + 1]?.start_source_page ?? pages.length + 1) - 1,
  evidence_class: 'source_structure_index',
  training_eligible: false,
}));

const claims = contract.claims.map((claim) => {
  if (
    claim.line_start < 1 ||
    claim.line_end < claim.line_start ||
    claim.line_end > globalLines.length
  ) {
    throw new Error(`claim line range is invalid: ${claim.claim_id}`);
  }
  const span = globalLines
    .slice(claim.line_start - 1, claim.line_end)
    .join('\n');
  if (!span.includes(claim.required_anchor)) {
    throw new Error(`claim anchor mismatch: ${claim.claim_id}`);
  }
  const startPage = lineToPage[claim.line_start];
  const endPage = lineToPage[claim.line_end];
  if (startPage !== claim.expected_source_page) {
    throw new Error(
      `claim source-page mismatch: ${claim.claim_id}: ${startPage}`,
    );
  }
  return {
    schema_version: 1,
    claim_id: claim.claim_id,
    topic: claim.topic,
    assertion: claim.assertion,
    evidence: {
      source_text_path: contract.source.text_path,
      source_text_sha256: contract.source.text_sha256,
      global_line_start: claim.line_start,
      global_line_end: claim.line_end,
      source_page_start: startPage,
      source_page_end: endPage,
      source_span_sha256: sha256(span),
    },
    evidence_class: 'explicit_scholarly_statement',
    review_state: 'source_verified_candidate_not_community_accepted',
    training_eligible: false,
  };
});

const exampleRows = exampleBytes
  .toString('utf8')
  .trimEnd()
  .split('\n')
  .filter(Boolean)
  .map((line) => JSON.parse(line) as { evidence_id: string });
if (exampleRows.length !== contract.linked_example_inventory.expected_count) {
  throw new Error(`unexpected linked example count: ${exampleRows.length}`);
}
const exampleLinks = exampleRows
  .map((row) => ({
    schema_version: 1,
    evidence_id: row.evidence_id,
    linked_inventory_path: contract.linked_example_inventory.path,
    linked_inventory_sha256: contract.linked_example_inventory.sha256,
    relationship: 'published_example_supports_grammar_research',
    review_state: 'published_scholarly_evidence_not_model_reviewed',
    training_exposed: false,
    training_eligible: false,
  }))
  .sort((left, right) => left.evidence_id.localeCompare(right.evidence_id));

const reviewItems = contract.review_topics.map((item) => ({
  schema_version: 1,
  ...item,
  state: 'open',
  required_review_roles: ['qualified_language_reviewer', 'program_steward'],
  blocks_accepted_grammar_rule: true,
  blocks_training_use: true,
}));

const summary = {
  schema_version: 1,
  contract_id: contract.contract_id,
  created_at_utc: contract.created_at_utc,
  language: contract.language,
  contract: {
    path: path.relative(programRoot, contractPath),
    sha256: sha256(contractBytes),
  },
  source: contract.source,
  counts: {
    source_pages: pages.length,
    chapters: units.filter((unit) => unit.kind === 'chapter').length,
    appendices: units.filter((unit) => unit.kind === 'appendix').length,
    source_verified_candidate_claims: claims.length,
    linked_published_examples: exampleLinks.length,
    open_review_items: reviewItems.length,
  },
  release_contract: contract.release_contract,
  interpretation: {
    achievement:
      'Creates an immutable page and line address space, a source-structure index, a small explicit-claim layer, and links to published examples.',
    limitation:
      'This is a candidate scholarly source edition, not an accepted pedagogical grammar, speaker certification, permission for model training, or a sentence-generation gate.',
  },
};

const outputRoot = resolveWithin(programRoot, contract.output_directory);
const outputs = new Map<string, string>([
  [
    'page-index.jsonl',
    `${pageIndex.map((row) => JSON.stringify(row)).join('\n')}\n`,
  ],
  ['units.jsonl', `${units.map((row) => JSON.stringify(row)).join('\n')}\n`],
  ['claims.jsonl', `${claims.map((row) => JSON.stringify(row)).join('\n')}\n`],
  [
    'example-links.jsonl',
    `${exampleLinks.map((row) => JSON.stringify(row)).join('\n')}\n`,
  ],
  [
    'review-items.jsonl',
    `${reviewItems.map((row) => JSON.stringify(row)).join('\n')}\n`,
  ],
  ['summary.json', `${JSON.stringify(summary, null, 2)}\n`],
]);
if (!process.argv.includes('--write')) {
  console.log(JSON.stringify(summary, null, 2));
  process.exit(0);
}
for (const [name, content] of outputs) {
  writeImmutable(path.join(outputRoot, name), content);
}
const sums = [...outputs.entries()]
  .map(([name, content]) => `${sha256(content)}  ${name}`)
  .join('\n');
writeImmutable(path.join(outputRoot, 'SHA256SUMS'), `${sums}\n`);
console.log(JSON.stringify(summary, null, 2));
