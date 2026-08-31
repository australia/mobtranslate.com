import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { canonicalJson } from '../lib/research/dictionarySourceCensus';
import {
  buildPublicParallelWitnessReview,
  PublicParallelWitnessReviewContractSchema,
} from '../lib/research/publicParallelWitnessReview';

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
  const programRootArgument = flagValue('--program-root');
  const contractRelativePath = flagValue('--contract');
  if (!programRootArgument || !contractRelativePath)
    throw new Error(
      'usage: tsx scripts/build-wajarri-public-parallel-witness-review.ts --program-root PATH --contract RELATIVE_PATH [--write]',
    );
  const programRoot = path.resolve(programRootArgument);
  const contractBytes = readFileSync(
    resolveWithin(programRoot, contractRelativePath),
  );
  const contract = PublicParallelWitnessReviewContractSchema.parse(
    JSON.parse(contractBytes.toString('utf8')),
  );

  const sourceTextById = new Map(
    contract.source_texts.map((source) => [
      source.source_id,
      readVerified(programRoot, source.artifact).toString('utf8'),
    ]),
  );
  const externalRowsByPath = new Map<string, unknown[]>();
  for (const record of contract.external_records) {
    if (externalRowsByPath.has(record.artifact.path)) continue;
    externalRowsByPath.set(
      record.artifact.path,
      parseJsonLines(readVerified(programRoot, record.artifact)),
    );
  }
  const result = buildPublicParallelWitnessReview({
    contractValue: contract,
    sourceTextById,
    externalRowsByPath,
  });

  const outputRows = {
    locatedSpans: result.locatedSpans,
    evidenceUnits: result.evidenceUnits,
    externalCorroborations: result.externalCorroborations,
    constructionCandidates: result.constructionCandidates,
  };
  const filenames: Record<keyof typeof outputRows, string> = {
    locatedSpans: 'located-spans.jsonl',
    evidenceUnits: 'evidence-units.jsonl',
    externalCorroborations: 'external-corroborations.jsonl',
    constructionCandidates: 'construction-candidates.jsonl',
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
    review_id: contract.review_id,
    created_at_utc: contract.created_at_utc,
    contract: {
      path: contractRelativePath,
      sha256: sha256(contractBytes),
    },
    source_texts: contract.source_texts,
    external_artifacts: [
      ...new Map(
        contract.external_records.map((record) => [
          record.artifact.path,
          record.artifact,
        ]),
      ).values(),
    ],
    components,
    counts: result.counts,
    review_policy: contract.review_policy,
    synthetic_state: {
      productive_templates: 0,
      generated_candidates: 0,
      reviewed_sentence_pairs: 0,
      training_eligible_sentence_pairs: 0,
      generation_open: false,
      next_step:
        'Resolve accepted grammar slots, compatible lexeme classes, rights, source-family dependence, and census-derived coverage cells before compiling a sentence commission.',
    },
    claim_limit:
      'This review records exact source-scoped bilingual witnesses and construction hypotheses. It does not convert document-level translations into line pairs, infer productive grammar, authorize training, generate a synthetic sentence pair, or establish translation quality.',
  };
  const manifestContent = `${JSON.stringify(manifest, null, 2)}\n`;
  const manifestPath = `${contract.output_root}/MANIFEST.json`;

  if (process.argv.includes('--write')) {
    const outputRoot = resolveWithin(programRoot, contract.output_root);
    for (const key of Object.keys(outputRows) as Array<keyof typeof outputRows>)
      writeImmutable(path.join(outputRoot, filenames[key]), contents[key]);
    writeImmutable(resolveWithin(programRoot, manifestPath), manifestContent);
  }
  process.stdout.write(
    `${JSON.stringify(
      {
        mode: process.argv.includes('--write') ? 'written' : 'validated_only',
        reviewId: contract.review_id,
        manifestPath,
        manifestSha256: sha256(manifestContent),
        counts: result.counts,
        components,
      },
      null,
      2,
    )}\n`,
  );
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
