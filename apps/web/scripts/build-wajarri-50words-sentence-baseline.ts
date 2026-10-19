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
import { fileURLToPath } from 'node:url';
import { canonicalJson } from '../lib/research/dictionarySourceCensus';
import {
  buildFixedUtteranceSentenceBaseline,
  FixedUtteranceSentenceBaselineContractSchema,
} from '../lib/research/fixedUtteranceSentenceBaseline';

function flagValue(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? null) : null;
}

function sha256(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex');
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

function countJsonLines(bytes: Buffer): number {
  return bytes
    .toString('utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0).length;
}

function readVerified(
  root: string,
  reference: { path: string; sha256: string; rows?: number },
): Buffer {
  const bytes = readFileSync(resolveWithin(root, reference.path));
  const actualHash = sha256(bytes);
  if (actualHash !== reference.sha256)
    throw new Error(
      `hash mismatch for ${reference.path}: ${actualHash} != ${reference.sha256}`,
    );
  if (reference.rows !== undefined) {
    const actualRows = countJsonLines(bytes);
    if (actualRows !== reference.rows)
      throw new Error(
        `row count mismatch for ${reference.path}: ${actualRows} != ${reference.rows}`,
      );
  }
  return bytes;
}

function parseJsonLines(bytes: Buffer): unknown[] {
  return bytes
    .toString('utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as unknown);
}

function jsonLines(rows: unknown[]): string {
  return `${rows.map((row) => canonicalJson(row)).join('\n')}\n`;
}

function writeImmutableAtomic(filePath: string, content: string): void {
  if (existsSync(filePath)) {
    if (readFileSync(filePath, 'utf8') !== content)
      throw new Error(`refusing to rewrite immutable artifact: ${filePath}`);
    return;
  }
  mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  writeFileSync(temporaryPath, content, {
    encoding: 'utf8',
    mode: 0o664,
    flag: 'wx',
  });
  renameSync(temporaryPath, filePath);
}

async function main(): Promise<void> {
  const programRootArgument = flagValue('--program-root');
  const contractRelativePath = flagValue('--contract');
  if (!programRootArgument || !contractRelativePath)
    throw new Error(
      'usage: tsx scripts/build-wajarri-50words-sentence-baseline.ts --program-root PATH --contract RELATIVE_PATH [--write]',
    );

  const programRoot = path.resolve(programRootArgument);
  const contractBytes = readFileSync(
    resolveWithin(programRoot, contractRelativePath),
  );
  const contract = FixedUtteranceSentenceBaselineContractSchema.parse(
    JSON.parse(contractBytes.toString('utf8')),
  );
  const invokedBuilderSha256 = sha256(
    readFileSync(fileURLToPath(import.meta.url)),
  );
  if (invokedBuilderSha256 !== contract.implementation.builder.sha256)
    throw new Error(
      `invoked builder hash mismatch: ${invokedBuilderSha256} != ${contract.implementation.builder.sha256}`,
    );

  const decisionBytes = readVerified(
    programRoot,
    contract.inputs.fixed_utterance_decisions,
  );
  for (const reference of [
    contract.inputs.task_review_manifest,
    contract.inputs.rights_review,
    contract.inputs.split_contract,
    contract.inputs.attested_dataset_manifest,
    contract.inputs.dictionary_edition,
    contract.inputs.grammar_edition,
    contract.inputs.source_ledger_snapshot,
    contract.implementation.library,
    contract.implementation.builder,
    contract.implementation.tests,
  ])
    readVerified(programRoot, reference);

  const result = buildFixedUtteranceSentenceBaseline(
    contract,
    parseJsonLines(decisionBytes),
  );
  const rowsContent = jsonLines(result.rows);
  const sourceGroupsContent = jsonLines(result.sourceGroups);
  const report = {
    schema_version: 1,
    benchmark_release_id: contract.benchmark_release_id,
    suite_key: contract.suite.suite_key,
    counts: result.report,
    metric_contract: contract.metric_contract,
    policy: contract.policy,
    claim_limit: contract.claim_limit,
  };
  const reportContent = `${JSON.stringify(report, null, 2)}\n`;
  const componentContents = {
    rows: {
      filename: 'ROWS.jsonl',
      content: rowsContent,
      rows: result.rows.length,
    },
    source_groups: {
      filename: 'SOURCE-GROUPS.jsonl',
      content: sourceGroupsContent,
      rows: result.sourceGroups.length,
    },
    report: { filename: 'REPORT.json', content: reportContent },
  };
  const components = Object.fromEntries(
    Object.entries(componentContents).map(([key, component]) => [
      key,
      {
        path: `${contract.output_root}/${component.filename}`,
        sha256: sha256(component.content),
        ...('rows' in component ? { rows: component.rows } : {}),
      },
    ]),
  );
  const manifest = {
    schema_version: 1,
    benchmark_release_id: contract.benchmark_release_id,
    created_at_utc: contract.created_at_utc,
    language: contract.language,
    method_contract: {
      path: contractRelativePath,
      sha256: sha256(contractBytes),
    },
    inputs: contract.inputs,
    implementation: contract.implementation,
    suite: contract.suite,
    components,
    counts: result.report,
    metric_contract: contract.metric_contract,
    policy: contract.policy,
    claim_limit: contract.claim_limit,
  };
  const manifestContent = `${JSON.stringify(manifest, null, 2)}\n`;
  const checksumEntries = [
    ...Object.values(componentContents).map((component) => ({
      filename: component.filename,
      content: component.content,
    })),
    { filename: 'MANIFEST.json', content: manifestContent },
  ];
  const checksumContent = `${checksumEntries
    .map(({ filename, content }) => `${sha256(content)}  ${filename}`)
    .join('\n')}\n`;

  if (process.argv.includes('--write')) {
    const outputRoot = resolveWithin(programRoot, contract.output_root);
    for (const component of Object.values(componentContents))
      writeImmutableAtomic(
        path.join(outputRoot, component.filename),
        component.content,
      );
    writeImmutableAtomic(
      path.join(outputRoot, 'MANIFEST.json'),
      manifestContent,
    );
    writeImmutableAtomic(
      path.join(outputRoot, 'SHA256SUMS.benchmark'),
      checksumContent,
    );
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        mode: process.argv.includes('--write') ? 'written' : 'validated_only',
        benchmarkReleaseId: contract.benchmark_release_id,
        manifestPath: `${contract.output_root}/MANIFEST.json`,
        manifestSha256: sha256(manifestContent),
        checksumPath: `${contract.output_root}/SHA256SUMS.benchmark`,
        checksumSha256: sha256(checksumContent),
        counts: result.report,
        components,
      },
      null,
      2,
    )}\n`,
  );
}

void main();
