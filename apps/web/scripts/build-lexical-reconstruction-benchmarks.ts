import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { z } from 'zod';
import { canonicalJson } from '../lib/research/dictionarySourceCensus';
import {
  buildLexicalReconstructionBenchmark,
  LexicalReconstructionBenchmarkContractSchema,
} from '../lib/research/lexicalReconstructionBenchmark';

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
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative))
    throw new Error(`path escapes or aliases program root: ${relativePath}`);
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
  return bytes
    .toString('utf8')
    .split(/\r?\n/u)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

function jsonLines(rows: unknown[]): string {
  return `${rows.map((row) => canonicalJson(row)).join('\n')}\n`;
}

function prettyJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
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
      'usage: tsx scripts/build-lexical-reconstruction-benchmarks.ts --program-root PATH --contract RELATIVE_PATH [--write]',
    );
  const programRoot = path.resolve(rootArgument);
  const contractPath = resolveWithin(programRoot, contractRelativePath);
  const contractBytes = readFileSync(contractPath);
  const contract = LexicalReconstructionBenchmarkContractSchema.parse(
    JSON.parse(contractBytes.toString('utf8')),
  );

  const dictionaryBytes = readVerified(programRoot, {
    path: contract.dictionary_edition.manifest_path,
    sha256: contract.dictionary_edition.manifest_sha256,
  });
  const dictionary = z
    .object({
      edition_id: z.string().min(1),
      components: z.record(z.string(), ComponentReferenceSchema),
      counts: z.object({
        acceptedLexicalRows: z.literal(0),
        trainingEligibleRows: z.literal(0),
      }),
      reference_policy: z.object({
        evaluation_scope: z.literal(
          'internal_closed_set_source_reconstruction',
        ),
        semantic_translation_acceptance: z.literal(false),
        training_eligibility: z.literal(false),
        redistribution_authorized: z.literal(false),
      }),
    })
    .passthrough()
    .parse(JSON.parse(dictionaryBytes.toString('utf8')));
  if (dictionary.edition_id !== contract.dictionary_edition.edition_id)
    throw new Error('dictionary edition ID does not match benchmark contract');

  for (const [contractKey, component] of Object.entries(contract.components)) {
    const dictionaryKey =
      contractKey === 'dispositions'
        ? 'reconstructionReferenceDispositions'
        : contractKey === 'context_groups'
          ? 'reconstructionContextGroups'
          : 'reconstructionPromptGroups';
    const dictionaryReference = dictionary.components[dictionaryKey];
    if (
      !dictionaryReference ||
      dictionaryReference.path !== component.path ||
      dictionaryReference.sha256 !== component.sha256 ||
      dictionaryReference.rows !== component.rows
    )
      throw new Error(`dictionary component mismatch for ${contractKey}`);
  }

  const readRows = (reference: z.infer<typeof ComponentReferenceSchema>) => {
    const bytes = readVerified(programRoot, reference);
    const rows = parseJsonLines(bytes);
    if (rows.length !== reference.rows)
      throw new Error(`row count mismatch for ${reference.path}`);
    return rows;
  };
  const result = buildLexicalReconstructionBenchmark({
    contractValue: contract,
    dispositions: readRows(contract.components.dispositions),
    contextGroups: readRows(contract.components.context_groups),
    promptGroups: readRows(contract.components.prompt_groups),
  });

  const buildSuite = (
    suite: typeof contract.suites.source_context,
    rows: typeof result.contextRows | typeof result.promptRows,
    ambiguousRows: number,
  ) => {
    const rowsPath = `${suite.output_directory}/ROWS.jsonl`;
    const rowsContent = jsonLines(rows);
    const manifestPath = `${suite.output_directory}/MANIFEST.json`;
    const manifest = {
      schema_version: 1,
      suite_key: suite.suite_key,
      benchmark_release_id: contract.benchmark_release_id,
      created_at_utc: contract.created_at_utc,
      language: contract.language,
      role: suite.role,
      sampling_unit: suite.sampling_unit,
      population: {
        design: 'complete_declared_source_population_not_a_random_sample',
        rows: rows.length,
        source_record_coverage: result.report.sourceRecordCoverage,
        unique_target_surface_coverage:
          result.report.uniqueTargetSurfaceCoverage,
        ambiguous_reference_set_rows: ambiguousRows,
      },
      dictionary_edition: contract.dictionary_edition,
      method_contract: {
        path: contractRelativePath,
        sha256: sha256(contractBytes),
      },
      rows: {
        path: rowsPath,
        sha256: sha256(rowsContent),
        rows: rows.length,
      },
      metric_contract: contract.metric_contract,
      policy: contract.policy,
      sealed: false,
      status: 'active_internal_regression',
      release_status: 'not_released',
      claim_limit: contract.claim_limit,
    };
    const manifestContent = prettyJson(manifest);
    return {
      rowsPath,
      rowsContent,
      manifestPath,
      manifestContent,
      manifestSha256: sha256(manifestContent),
      rowsSha256: sha256(rowsContent),
      rows: rows.length,
    };
  };
  const contextSuite = buildSuite(
    contract.suites.source_context,
    result.contextRows,
    result.report.sourceContextAmbiguousRows,
  );
  const promptSuite = buildSuite(
    contract.suites.prompt_group,
    result.promptRows,
    result.report.promptGroupAmbiguousRows,
  );
  const reportPath = `${contract.output_root}/REPORT.json`;
  const reportContent = prettyJson({
    schema_version: 1,
    benchmark_release_id: contract.benchmark_release_id,
    ...result.report,
    population_interpretation:
      contract.metric_contract.population_interpretation,
    claim_limit: contract.claim_limit,
  });
  const releaseManifestPath = `${contract.output_root}/MANIFEST.json`;
  const releaseManifest = {
    schema_version: 1,
    benchmark_release_id: contract.benchmark_release_id,
    created_at_utc: contract.created_at_utc,
    language: contract.language,
    dictionary_edition: contract.dictionary_edition,
    method_contract: {
      path: contractRelativePath,
      sha256: sha256(contractBytes),
    },
    suites: {
      source_context: {
        suite_key: contract.suites.source_context.suite_key,
        manifest_path: contextSuite.manifestPath,
        manifest_sha256: contextSuite.manifestSha256,
        rows: contextSuite.rows,
      },
      prompt_group: {
        suite_key: contract.suites.prompt_group.suite_key,
        manifest_path: promptSuite.manifestPath,
        manifest_sha256: promptSuite.manifestSha256,
        rows: promptSuite.rows,
      },
    },
    report: {
      path: reportPath,
      sha256: sha256(reportContent),
    },
    validation: {
      ...result.report,
      completeSourceRecordCoverage: true,
      completeTargetSurfaceCoverage: true,
      acceptedReferenceSetsNonempty: true,
      semanticTranslationReferences: 0,
      trainingEligibleRows: 0,
      sealedRows: 0,
    },
    policy: contract.policy,
    release_status: 'not_released',
    claim_limit: contract.claim_limit,
  };
  const releaseManifestContent = prettyJson(releaseManifest);

  if (process.argv.includes('--write')) {
    for (const suite of [contextSuite, promptSuite]) {
      writeImmutable(
        resolveWithin(programRoot, suite.rowsPath),
        suite.rowsContent,
      );
      writeImmutable(
        resolveWithin(programRoot, suite.manifestPath),
        suite.manifestContent,
      );
    }
    writeImmutable(resolveWithin(programRoot, reportPath), reportContent);
    writeImmutable(
      resolveWithin(programRoot, releaseManifestPath),
      releaseManifestContent,
    );
  }

  process.stdout.write(
    prettyJson({
      mode: process.argv.includes('--write')
        ? 'written_or_verified_identical'
        : 'validated_only',
      benchmarkReleaseId: contract.benchmark_release_id,
      releaseManifestPath,
      releaseManifestSha256: sha256(releaseManifestContent),
      reportPath,
      reportSha256: sha256(reportContent),
      contextSuite: {
        rowsPath: contextSuite.rowsPath,
        rowsSha256: contextSuite.rowsSha256,
        rows: contextSuite.rows,
        manifestPath: contextSuite.manifestPath,
        manifestSha256: contextSuite.manifestSha256,
      },
      promptSuite: {
        rowsPath: promptSuite.rowsPath,
        rowsSha256: promptSuite.rowsSha256,
        rows: promptSuite.rows,
        manifestPath: promptSuite.manifestPath,
        manifestSha256: promptSuite.manifestSha256,
      },
      report: result.report,
    }),
  );
}

void main();
