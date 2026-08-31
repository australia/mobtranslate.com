import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { z } from 'zod';
import { canonicalJson } from '../lib/research/dictionarySourceCensus';
import {
  buildSyntheticConstructionReview,
  SyntheticConstructionReviewContractSchema,
} from '../lib/research/syntheticConstructionReview';

const ComponentReferenceSchema = z.object({
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
    throw new Error(`path must be relative to program root: ${relativePath}`);
  const resolved = path.resolve(root, relativePath);
  const relative = path.relative(root, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative))
    throw new Error(`path escapes program root: ${relativePath}`);
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
  const text = bytes.toString('utf8');
  if (!text.endsWith('\n')) throw new Error('JSONL must end with a newline');
  return text
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

function readRows(
  root: string,
  reference: { path: string; sha256: string; rows: number },
): Array<Record<string, unknown>> {
  const rows = parseJsonLines(readVerified(root, reference));
  if (rows.length !== reference.rows)
    throw new Error(
      `row count mismatch for ${reference.path}: ${rows.length} != ${reference.rows}`,
    );
  return rows;
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

async function main(): Promise<void> {
  const rootArgument = flagValue('--program-root');
  const contractRelativePath = flagValue('--contract');
  if (!rootArgument || !contractRelativePath)
    throw new Error(
      'usage: tsx scripts/build-synthetic-construction-review.ts --program-root PATH --contract RELATIVE_PATH [--write]',
    );
  const programRoot = path.resolve(rootArgument);
  const contractBytes = readFileSync(
    resolveWithin(programRoot, contractRelativePath),
  );
  const contract = SyntheticConstructionReviewContractSchema.parse(
    JSON.parse(contractBytes.toString('utf8')),
  );

  const sourceLedgerRows = parseJsonLines(
    readVerified(programRoot, contract.source_ledger),
  );
  const dictionaryManifestBytes = readVerified(
    programRoot,
    contract.dictionary_context.manifest,
  );
  const dictionaryManifest = JSON.parse(
    dictionaryManifestBytes.toString('utf8'),
  ) as Record<string, unknown>;
  const components = z
    .record(z.string(), ComponentReferenceSchema)
    .parse(dictionaryManifest.components);
  const entryReference =
    components[contract.dictionary_context.entry_component_key];
  const senseReference =
    components[contract.dictionary_context.sense_component_key];
  const formReference =
    components[contract.dictionary_context.form_component_key];
  if (!entryReference || !senseReference || !formReference)
    throw new Error('dictionary context lacks required components');

  const grammarManifest = JSON.parse(
    readVerified(programRoot, contract.grammar_context.manifest).toString(
      'utf8',
    ),
  ) as Record<string, unknown>;
  if (grammarManifest.edition_id !== contract.grammar_context.edition_id)
    throw new Error('grammar edition ID does not match its manifest');

  for (const artifact of contract.source_review_artifacts)
    readVerified(programRoot, artifact);

  const evidenceRowsByComponent = new Map<
    string,
    Array<Record<string, unknown>>
  >();
  for (const component of contract.evidence_components)
    evidenceRowsByComponent.set(
      component.component_id,
      readRows(programRoot, component),
    );

  const result = buildSyntheticConstructionReview({
    contractValue: contract,
    sourceLedgerRows,
    dictionaryManifestValue: dictionaryManifest,
    dictionaryEntries: readRows(programRoot, entryReference),
    dictionarySenses: readRows(programRoot, senseReference),
    dictionaryForms: readRows(programRoot, formReference),
    evidenceRowsByComponent,
  });
  const contents = {
    constructionFamilies: jsonLines(result.constructionFamilies),
    lexicalRealizations: jsonLines(result.lexicalRealizations),
    explicitBindings: jsonLines(result.explicitBindings),
    candidatePairPreviews: jsonLines(result.candidatePairPreviews),
    evidenceIndex: jsonLines(result.evidenceIndex),
  };
  const filenames = {
    constructionFamilies: 'construction-families.jsonl',
    lexicalRealizations: 'lexical-realizations.jsonl',
    explicitBindings: 'explicit-bindings.jsonl',
    candidatePairPreviews: 'candidate-pair-previews.jsonl',
    evidenceIndex: 'evidence-index.jsonl',
  } as const;
  const componentsOut = Object.fromEntries(
    (Object.keys(contents) as Array<keyof typeof contents>).map((key) => [
      key,
      {
        path: `${contract.output_root}/${filenames[key]}`,
        sha256: sha256(contents[key]),
        rows: contents[key].split('\n').filter(Boolean).length,
      },
    ]),
  );
  const report = {
    schema_version: 1,
    review_id: contract.review_id,
    status: contract.status,
    scope: contract.scope,
    validation: result.validation,
    policy: contract.policy,
    interpretation: {
      candidate_pairs:
        'Rendered previews are explicit linguist-review candidates. They are not coverage-commissioned synthetic corpus rows.',
      lexical_rows:
        'Every target surface is copied exactly from a hash-bound dictionary form; the review performs no inflection or unseen-form generation.',
      bindings:
        'Only listed bindings are rendered. No noun-predicate Cartesian product is inferred.',
      next_gate:
        'The frozen zero-step census, reviewed living-book child components, coverage commission, renderer validation, and separate training approval remain required.',
    },
    claim_limit: contract.claim_limit,
  };
  const reportContent = `${JSON.stringify(report, null, 2)}\n`;
  const manifest = {
    schema_version: 1,
    review_id: contract.review_id,
    created_at_utc: contract.created_at_utc,
    status: contract.status,
    scope: contract.scope,
    method_contract: {
      path: contractRelativePath,
      sha256: sha256(contractBytes),
    },
    source_ledger: contract.source_ledger,
    dictionary_context: contract.dictionary_context,
    grammar_context: contract.grammar_context,
    evidence_components: contract.evidence_components,
    source_review_artifacts: contract.source_review_artifacts,
    components: componentsOut,
    report: {
      path: `${contract.output_root}/REPORT.json`,
      sha256: sha256(reportContent),
    },
    validation: result.validation,
    policy: contract.policy,
    claim_limit: contract.claim_limit,
  };
  const manifestContent = `${JSON.stringify(manifest, null, 2)}\n`;
  const manifestPath = `${contract.output_root}/MANIFEST.json`;

  if (process.argv.includes('--write')) {
    for (const key of Object.keys(contents) as Array<keyof typeof contents>)
      writeImmutable(
        resolveWithin(programRoot, componentsOut[key].path),
        contents[key],
      );
    writeImmutable(
      resolveWithin(programRoot, `${contract.output_root}/REPORT.json`),
      reportContent,
    );
    writeImmutable(resolveWithin(programRoot, manifestPath), manifestContent);
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        mode: process.argv.includes('--write') ? 'written' : 'validated_only',
        reviewId: contract.review_id,
        manifestPath,
        manifestSha256: sha256(manifestContent),
        validation: result.validation,
        components: componentsOut,
      },
      null,
      2,
    )}\n`,
  );
}

void main();
