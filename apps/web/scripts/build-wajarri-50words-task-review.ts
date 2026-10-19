import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { canonicalJson } from '../lib/research/dictionarySourceCensus';
import {
  buildWajarriFiftyWordsTaskReview,
  FiftyWordsTaskReviewContractSchema,
} from '../lib/research/wajarriFiftyWordsTaskReview';

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
      'usage: tsx scripts/build-wajarri-50words-task-review.ts --program-root PATH --contract RELATIVE_PATH [--write]',
    );
  const programRoot = path.resolve(programRootArgument);
  const contractBytes = readFileSync(
    resolveWithin(programRoot, contractRelativePath),
  );
  const contract = FiftyWordsTaskReviewContractSchema.parse(
    JSON.parse(contractBytes.toString('utf8')),
  );
  const pairingBytes = readVerified(programRoot, contract.source_pairings);
  const audioAssetBytes = readVerified(
    programRoot,
    contract.source_audio_assets,
  );
  const rightsReviewBytes = readVerified(programRoot, contract.rights_review);
  const result = buildWajarriFiftyWordsTaskReview({
    contractValue: contract,
    pairingRows: parseJsonLines(pairingBytes),
    audioAssetRows: parseJsonLines(audioAssetBytes),
    rightsReviewValue: JSON.parse(rightsReviewBytes.toString('utf8')),
  });

  const outputRows = {
    taskDecisions: result.taskDecisions,
    lexicalSenseDecisions: result.lexicalSenseDecisions,
    fixedUtteranceDecisions: result.fixedUtteranceDecisions,
    lexicalSurfaceGroups: result.lexicalSurfaceGroups,
    directSupervisionCandidates: result.directSupervisionCandidates,
    pairAudioLinks: result.pairAudioLinks,
  };
  const filenames: Record<keyof typeof outputRows, string> = {
    taskDecisions: 'task-decisions.jsonl',
    lexicalSenseDecisions: 'lexical-sense-decisions.jsonl',
    fixedUtteranceDecisions: 'fixed-utterance-decisions.jsonl',
    lexicalSurfaceGroups: 'lexical-surface-groups.jsonl',
    directSupervisionCandidates: 'direct-supervision-candidates.jsonl',
    pairAudioLinks: 'pair-audio-links.jsonl',
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
    source_pairings: contract.source_pairings,
    source_audio_assets: contract.source_audio_assets,
    rights_review: contract.rights_review,
    components,
    counts: result.report,
    decision_policy: contract.review_policy,
    training_state: {
      direct_source_pairs_reviewed: result.report.directSupervisionCandidates,
      split_assignment_complete: false,
      training_rows_ready_for_trainer: 0,
      benchmark_independence_assigned: false,
    },
    synthetic_state: {
      controlled_sentence_pairs_generated: 0,
      productive_grammar_rules_accepted: 0,
      status:
        'closed_until_productive_grammar_and_slot_compatibility_are_accepted',
    },
    claim_limit:
      'This review accepts exact source-scoped lexical concepts, fixed utterances, spellings, and audio for noncommercial direct-supervision planning. It does not infer source independence, part of speech, morphology, productive grammar, split membership, synthetic sentence eligibility, benchmark independence, or model quality.',
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
        counts: result.report,
        components,
      },
      null,
      2,
    )}\n`,
  );
}

void main();
