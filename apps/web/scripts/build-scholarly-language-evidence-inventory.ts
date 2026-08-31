import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { z } from 'zod';
import { canonicalJson } from '../lib/research/dictionarySourceCensus';
import {
  buildScholarlyLanguageEvidence,
  scholarlyPrimarySourceReference,
  ScholarlyLanguageEvidenceContractSchema,
} from '../lib/research/scholarlyLanguageEvidence';

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
    throw new Error(`row count mismatch for ${reference.path}`);
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
      'usage: tsx scripts/build-scholarly-language-evidence-inventory.ts --program-root PATH --contract RELATIVE_PATH [--write]',
    );
  const programRoot = path.resolve(rootArgument);
  const contractBytes = readFileSync(
    resolveWithin(programRoot, contractRelativePath),
  );
  const contract = ScholarlyLanguageEvidenceContractSchema.parse(
    JSON.parse(contractBytes.toString('utf8')),
  );
  readVerified(programRoot, scholarlyPrimarySourceReference(contract.source));
  readVerified(programRoot, contract.source.extracted_text);
  if (contract.source.landing_page)
    readVerified(programRoot, contract.source.landing_page);
  for (const reference of contract.source.response_headers)
    readVerified(programRoot, reference);

  const pageTexts = new Map<string, string>();
  for (const page of contract.source.pages) {
    pageTexts.set(page.page_key, readVerified(programRoot, page).toString('utf8'));
    if (Boolean(page.rendered_path) !== Boolean(page.rendered_sha256))
      throw new Error(`page rendering reference is incomplete: ${page.page_key}`);
    if (page.rendered_path && page.rendered_sha256)
      readVerified(programRoot, {
        path: page.rendered_path,
        sha256: page.rendered_sha256,
      });
  }
  const sourceLedgerRows = parseJsonLines(
    readVerified(programRoot, contract.source_ledger),
  );
  const dictionaryManifest = JSON.parse(
    readVerified(programRoot, contract.dictionary_context.manifest).toString(
      'utf8',
    ),
  ) as Record<string, unknown>;
  const dictionaryComponents = z
    .record(z.string(), ReferenceSchema)
    .parse(dictionaryManifest.components);
  const entryReference =
    dictionaryComponents[contract.dictionary_context.entry_component_key];
  const senseReference =
    dictionaryComponents[contract.dictionary_context.sense_component_key];
  const formReference =
    dictionaryComponents[contract.dictionary_context.form_component_key];
  if (!entryReference || !senseReference || !formReference)
    throw new Error('dictionary context lacks required components');

  const result = buildScholarlyLanguageEvidence({
    contractValue: contract,
    pageTexts,
    sourceLedgerRows,
    dictionaryManifestValue: dictionaryManifest,
    dictionaryEntries: readRows(programRoot, entryReference),
    dictionarySenses: readRows(programRoot, senseReference),
    dictionaryForms: readRows(programRoot, formReference),
  });
  const relativeRoot = `analysis/inventories/${contract.inventory_id}`;
  const componentFiles = {
    grammarAssertions: 'grammar-assertions.jsonl',
    grammarExamples: 'grammar-examples.jsonl',
    grammarConflicts: 'grammar-conflicts.jsonl',
    dictionaryEvidenceLinks: 'dictionary-evidence-links.jsonl',
    citationChain: 'citation-chain.jsonl',
  } as const;
  const componentContents = Object.fromEntries(
    Object.entries(componentFiles).map(([key]) => [
      key,
      jsonLines(
        result.components[key as keyof typeof result.components] as unknown[],
      ),
    ]),
  ) as Record<keyof typeof componentFiles, string>;
  const components = Object.fromEntries(
    Object.entries(componentFiles).map(([key, filename]) => [
      key,
      {
        path: `${relativeRoot}/${filename}`,
        sha256: sha256(componentContents[key as keyof typeof componentFiles]),
        rows:
          result.components[key as keyof typeof result.components].length,
      },
    ]),
  );
  const spansContent = jsonLines(result.evidenceSpans);
  const evidenceSpans = {
    path: `${relativeRoot}/evidence-spans.jsonl`,
    sha256: sha256(spansContent),
    rows: result.evidenceSpans.length,
  };
  const report = {
    schema_version: 1,
    inventory_id: contract.inventory_id,
    source_id: contract.source.source_id,
    dictionary_context: contract.dictionary_context,
    validation: result.validation,
    epistemic_policy:
      contract.source.evidence_profile === 'publisher_snippet'
        ? {
            snippet_scope:
              'Each observation is limited to a publisher-indexed public search snippet and its declared printed-page number. Missing surrounding prose, tables, examples, and qualifications remain unknown.',
            citation_chain:
              'The snippet witness is direct evidence of visible chapter wording, not full-chapter inspection and not underlying fieldwork or speaker evidence.',
            acceptance:
              'All rows remain review candidates. A truncated public snippet cannot by itself establish a complete paradigm, productive rule, dictionary sense, or natural translation.',
            model_use:
              'No inventory row is benchmark, synthetic-data, training, hosted-transfer, or derived-weight eligible.',
          }
        : {
            article_analysis:
              'Published author analysis is distinguished from reproduced examples, reports of earlier documentation, and reported personal communication.',
            citation_chain:
              'Every observation records whether its underlying cited source is locally verified, indirectly represented, or unavailable.',
            acceptance:
              'All rows remain evidence candidates. Source publication, string agreement, or morphological plausibility does not by itself accept a dictionary form or grammar rule.',
            model_use:
              'No inventory row is benchmark, synthetic-data, training, hosted-transfer, or derived-weight eligible.',
          },
    claim_limit: contract.claim_limit,
  };
  const reportContent = `${JSON.stringify(report, null, 2)}\n`;
  const manifest = {
    schema_version: 1,
    inventory_id: contract.inventory_id,
    created_at_utc: contract.created_at_utc,
    status: contract.status,
    scope: contract.scope,
    method_contract: {
      path: contractRelativePath,
      sha256: sha256(contractBytes),
    },
    source: contract.source,
    source_ledger: contract.source_ledger,
    dictionary_context: contract.dictionary_context,
    components: { ...components, evidenceSpans },
    report: {
      path: `${relativeRoot}/REPORT.json`,
      sha256: sha256(reportContent),
    },
    validation: {
      grammar_assertions: result.validation.grammarAssertions,
      grammar_examples: result.validation.grammarExamples,
      grammar_conflicts: result.validation.grammarConflicts,
      dictionary_evidence_links: result.validation.dictionaryEvidenceLinks,
      citation_chain: result.validation.citationChain,
      evidence_spans: result.validation.evidenceSpans,
      accepted_rows: 0,
      training_eligible_rows: 0,
    },
    claim_limit: contract.claim_limit,
  };
  const manifestContent = `${JSON.stringify(manifest, null, 2)}\n`;
  const manifestPath = `${relativeRoot}/MANIFEST.json`;

  if (process.argv.includes('--write')) {
    for (const key of Object.keys(componentFiles) as Array<
      keyof typeof componentFiles
    >)
      writeImmutable(
        resolveWithin(programRoot, components[key].path),
        componentContents[key],
      );
    writeImmutable(
      resolveWithin(programRoot, evidenceSpans.path),
      spansContent,
    );
    writeImmutable(
      resolveWithin(programRoot, `${relativeRoot}/REPORT.json`),
      reportContent,
    );
    writeImmutable(
      resolveWithin(programRoot, manifestPath),
      manifestContent,
    );
  }
  process.stdout.write(
    `${JSON.stringify(
      {
        mode: process.argv.includes('--write') ? 'written' : 'validated_only',
        inventoryId: contract.inventory_id,
        manifestPath,
        manifestSha256: sha256(manifestContent),
        validation: result.validation,
        components: manifest.components,
      },
      null,
      2,
    )}\n`,
  );
}

void main();
