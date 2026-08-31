import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { canonicalJson } from '../lib/research/dictionarySourceCensus';
import {
  buildLexicalBenchmarkCandidateCensus,
  LexicalBenchmarkCandidateCensusContractSchema,
} from '../lib/research/lexicalBenchmarkCandidateCensus';

function flagValue(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? null) : null;
}

const programRootValue = flagValue('--program-root');
if (!programRootValue) {
  throw new Error(
    'usage: tsx scripts/build-lexical-benchmark-candidate-census.ts --program-root PATH [--contract PATH] [--write]',
  );
}

const programRoot = path.resolve(programRootValue);
const contractPath = path.resolve(
  flagValue('--contract') ??
    path.join(
      programRoot,
      'analysis/census-contracts/wajarri-lexical-benchmark-candidate-census-v0.2.0.json',
    ),
);
const write = process.argv.includes('--write');

function sha256Bytes(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function sha256File(filePath: string): string {
  return sha256Bytes(readFileSync(filePath));
}

function resolveProgramPath(relativePath: string): string {
  const absolutePath = path.resolve(programRoot, relativePath);
  const relative = path.relative(programRoot, absolutePath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`path escapes or aliases program root: ${relativePath}`);
  }
  return absolutePath;
}

function readJsonl(filePath: string): unknown[] {
  return readFileSync(filePath, 'utf8')
    .split('\n')
    .filter((line) => line.trim())
    .map((line, index) => {
      try {
        return JSON.parse(line) as unknown;
      } catch (error) {
        throw new Error(`${filePath}:${index + 1}: ${String(error)}`);
      }
    });
}

function jsonl(rows: unknown[]): string {
  return rows.map((row) => `${canonicalJson(row)}\n`).join('');
}

function prettyJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function writeImmutable(filePath: string, content: string) {
  if (existsSync(filePath)) {
    const existing = readFileSync(filePath, 'utf8');
    if (existing !== content)
      throw new Error(
        `refusing to replace non-identical immutable output: ${filePath}`,
      );
    return;
  }
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, 'utf8');
}

const contractBytes = readFileSync(contractPath);
const contract = LexicalBenchmarkCandidateCensusContractSchema.parse(
  JSON.parse(contractBytes.toString('utf8')),
);

if (
  !path.isAbsolute(contractPath) ||
  !contractPath.startsWith(`${programRoot}${path.sep}`)
)
  throw new Error('contract must live under the program root');

const manifestPath = resolveProgramPath(
  contract.dictionary_edition.manifest_path,
);
if (sha256File(manifestPath) !== contract.dictionary_edition.manifest_sha256)
  throw new Error(
    'dictionary edition manifest hash does not match census contract',
  );

const componentEntries = Object.entries(contract.components).map(
  ([key, component]) => {
    const absolutePath = resolveProgramPath(component.path);
    const actualSha256 = sha256File(absolutePath);
    if (actualSha256 !== component.sha256)
      throw new Error(
        `component hash mismatch for ${key}: ${actualSha256} != ${component.sha256}`,
      );
    return [key, { ...component, absolutePath }] as const;
  },
);
const components = Object.fromEntries(componentEntries);

const result = buildLexicalBenchmarkCandidateCensus(
  {
    entries: readJsonl(components.entries.absolutePath),
    senses: readJsonl(components.senses.absolutePath),
    forms: readJsonl(components.forms.absolutePath),
    mediaLinks: readJsonl(components.media_links.absolutePath),
    reviewQueue: readJsonl(components.review_queue.absolutePath),
    historicalCrosswalk: readJsonl(
      components.historical_crosswalk.absolutePath,
    ),
    contemporaryEvidence: readJsonl(
      components.contemporary_evidence.absolutePath,
    ),
    publishedEvidence: readJsonl(components.published_evidence.absolutePath),
  },
  contract,
);

const outputRoot = resolveProgramPath(contract.outputs.root);
const outputPaths = {
  records: path.join(outputRoot, contract.outputs.records),
  promptGroups: path.join(outputRoot, contract.outputs.prompt_groups),
  headwordGroups: path.join(outputRoot, contract.outputs.headword_groups),
  benchmarkCandidates: path.join(
    outputRoot,
    contract.outputs.benchmark_candidates,
  ),
  report: path.join(outputRoot, contract.outputs.report),
  manifest: path.join(outputRoot, contract.outputs.manifest),
};

const contents = {
  records: jsonl(result.records),
  promptGroups: jsonl(result.promptGroups),
  headwordGroups: jsonl(result.headwordGroups),
  benchmarkCandidates: jsonl(result.benchmarkCandidates),
  report: prettyJson(result.report),
};

const outputMetadata = {
  records: {
    path: path.relative(programRoot, outputPaths.records),
    sha256: sha256Bytes(contents.records),
    rows: result.records.length,
  },
  promptGroups: {
    path: path.relative(programRoot, outputPaths.promptGroups),
    sha256: sha256Bytes(contents.promptGroups),
    rows: result.promptGroups.length,
  },
  headwordGroups: {
    path: path.relative(programRoot, outputPaths.headwordGroups),
    sha256: sha256Bytes(contents.headwordGroups),
    rows: result.headwordGroups.length,
  },
  benchmarkCandidates: {
    path: path.relative(programRoot, outputPaths.benchmarkCandidates),
    sha256: sha256Bytes(contents.benchmarkCandidates),
    rows: result.benchmarkCandidates.length,
  },
  report: {
    path: path.relative(programRoot, outputPaths.report),
    sha256: sha256Bytes(contents.report),
    rows: null,
  },
};

const manifest = {
  schema_version: 1,
  census_id: contract.census_id,
  created_at_utc: contract.created_at_utc,
  language: contract.language,
  method_contract: {
    path: path.relative(programRoot, contractPath),
    sha256: sha256Bytes(contractBytes),
  },
  dictionary_edition: contract.dictionary_edition,
  inputs: Object.fromEntries(
    Object.entries(contract.components).map(([key, component]) => [
      key,
      { path: component.path, sha256: component.sha256 },
    ]),
  ),
  outputs: outputMetadata,
  validation: {
    completeSourceRecordCoverage: result.records.length,
    currentDiagnosticCandidateCoverage: result.benchmarkCandidates.length,
    currentPromptGroups: result.promptGroups.length,
    headwordGroups: result.headwordGroups.length,
    acceptedReferences: 0,
    registeredBenchmarkRows: 0,
    trainingEligibleRows: 0,
    benchmarkRegistrationAllowed: false,
    sourceStringsPreserved: true,
    historicalLayerSeparated: true,
  },
  release_status: 'not_released',
  claim_limit: contract.claim_limit,
};
const manifestContent = prettyJson(manifest);

if (write) {
  writeImmutable(outputPaths.records, contents.records);
  writeImmutable(outputPaths.promptGroups, contents.promptGroups);
  writeImmutable(outputPaths.headwordGroups, contents.headwordGroups);
  writeImmutable(outputPaths.benchmarkCandidates, contents.benchmarkCandidates);
  writeImmutable(outputPaths.report, contents.report);
  writeImmutable(outputPaths.manifest, manifestContent);
}

process.stdout.write(
  prettyJson({
    mode: write ? 'written_or_verified_identical' : 'validated_only',
    censusId: contract.census_id,
    manifestSha256: sha256Bytes(manifestContent),
    outputs: outputMetadata,
    coverage: result.report.coverage,
    structuralStrata: result.report.structuralStrata,
    benchmarkDisposition: result.report.benchmarkDisposition,
  }),
);
