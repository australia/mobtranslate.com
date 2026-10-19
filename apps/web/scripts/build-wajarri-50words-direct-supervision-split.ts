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
import { canonicalJson } from '../lib/research/dictionarySourceCensus';
import {
  buildDirectSupervisionSplit,
  DirectSupervisionSplitContractSchema,
} from '../lib/research/directSupervisionSplit';

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
  return rows.length === 0
    ? '\n'
    : `${rows.map((row) => canonicalJson(row)).join('\n')}\n`;
}

function writeImmutableAtomic(filePath: string, content: string): void {
  if (existsSync(filePath)) {
    if (readFileSync(filePath, 'utf8') !== content)
      throw new Error(`refusing to rewrite immutable artifact: ${filePath}`);
    return;
  }
  mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  if (existsSync(temporaryPath))
    throw new Error(`temporary output already exists: ${temporaryPath}`);
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
      'usage: tsx scripts/build-wajarri-50words-direct-supervision-split.ts --program-root PATH --contract RELATIVE_PATH [--write]',
    );

  const programRoot = path.resolve(programRootArgument);
  const contractBytes = readFileSync(
    resolveWithin(programRoot, contractRelativePath),
  );
  const contract = DirectSupervisionSplitContractSchema.parse(
    JSON.parse(contractBytes.toString('utf8')),
  );

  const candidateBytes = readVerified(programRoot, contract.inputs.candidates);
  for (const reference of [
    contract.inputs.task_review,
    contract.inputs.rights_review,
    contract.inputs.dictionary_edition,
    contract.inputs.grammar_edition,
    contract.inputs.source_ledger_snapshot,
  ])
    readVerified(programRoot, reference);

  const result = buildDirectSupervisionSplit(
    contract,
    parseJsonLines(candidateBytes),
  );
  const outputRows = {
    train: result.trainRows,
    development: result.developmentRows,
    finalTest: result.finalTestRows,
    trainingReconstructionDiagnostic:
      result.trainingReconstructionDiagnosticRows,
  };
  const filenames: Record<keyof typeof outputRows, string> = {
    train: 'train.eng-wbv.jsonl',
    development: 'development.eng-wbv.jsonl',
    finalTest: 'final-test.eng-wbv.jsonl',
    trainingReconstructionDiagnostic:
      'training-reconstruction-diagnostic.eng-wbv.jsonl',
  };
  const contents = Object.fromEntries(
    (Object.keys(outputRows) as Array<keyof typeof outputRows>).map((key) => [
      key,
      jsonLines(outputRows[key]),
    ]),
  ) as Record<keyof typeof outputRows, string>;
  const components = Object.fromEntries(
    (Object.keys(outputRows) as Array<keyof typeof outputRows>).map((key) => [
      key,
      {
        path: `${contract.output_root}/${filenames[key]}`,
        sha256: sha256(contents[key]),
        rows: outputRows[key].length,
      },
    ]),
  );
  const manifest = {
    schema_version: 1,
    dataset_id: contract.split_contract_id,
    created_at_utc: contract.created_at_utc,
    language: contract.language,
    contract: {
      path: contractRelativePath,
      sha256: sha256(contractBytes),
    },
    inputs: contract.inputs,
    components,
    counts: result.report,
    split_policy: contract.policies,
    source_clusters: contract.source_clusters,
    training_state: {
      split_assigned_direct_supervision_candidates: result.report.trainRows,
      trainer_ready_rows: 0,
      program_training_gate: contract.policies.program_training_gate,
    },
    evaluation_state: {
      independent_development_rows: result.report.developmentRows,
      independent_final_test_rows: result.report.finalTestRows,
      training_reconstruction_diagnostic_rows:
        result.report.trainingReconstructionDiagnosticRows,
      training_reconstruction_is_independent: false,
    },
    synthetic_state: {
      controlled_sentence_pairs_generated: 0,
      status:
        'excluded_from_this_attested_dataset_and_closed_pending_zero_step_census_failure_analysis_coverage_cells_and_accepted_grammar',
    },
    claim_limit: contract.claim_limit,
  };
  const manifestContent = `${JSON.stringify(manifest, null, 2)}\n`;
  const manifestPath = `${contract.output_root}/MANIFEST.json`;
  const checksummedFiles = [
    ...(Object.keys(outputRows) as Array<keyof typeof outputRows>).map(
      (key) => ({
        filename: filenames[key],
        content: contents[key],
      }),
    ),
    { filename: 'MANIFEST.json', content: manifestContent },
  ];
  const checksumContent = `${checksummedFiles
    .map(({ filename, content }) => `${sha256(content)}  ${filename}`)
    .join('\n')}\n`;
  const checksumPath = `${contract.output_root}/SHA256SUMS.dataset`;

  if (process.argv.includes('--write')) {
    const outputRoot = resolveWithin(programRoot, contract.output_root);
    for (const key of Object.keys(outputRows) as Array<keyof typeof outputRows>)
      writeImmutableAtomic(
        path.join(outputRoot, filenames[key]),
        contents[key],
      );
    writeImmutableAtomic(
      resolveWithin(programRoot, manifestPath),
      manifestContent,
    );
    writeImmutableAtomic(
      resolveWithin(programRoot, checksumPath),
      checksumContent,
    );
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        mode: process.argv.includes('--write') ? 'written' : 'validated_only',
        datasetId: contract.split_contract_id,
        manifestPath,
        manifestSha256: sha256(manifestContent),
        checksumPath,
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
