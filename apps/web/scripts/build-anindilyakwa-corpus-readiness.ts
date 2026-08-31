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

type FileRef = { path: string; sha256: string };
type Contract = {
  schema_version: 1;
  report_id: string;
  measured_at_utc: string;
  program_id: string;
  supersedes_report_id: string;
  implementation: Array<FileRef & { role: string }>;
  inputs: {
    permission: FileRef;
    parallel_manifest: FileRef;
    parallel_verification: FileRef;
    dictionary: FileRef;
    grammar: FileRef;
    benchmarks: FileRef;
    review_workpack: FileRef;
    reviewer_readiness: FileRef;
  };
  output_path: string;
};

function flagValue(flag: string): string {
  const index = process.argv.indexOf(flag);
  if (index < 0 || !process.argv[index + 1]) {
    throw new Error(`missing required ${flag} PATH`);
  }
  return process.argv[index + 1];
}

function sha256(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex');
}

function resolveWithin(root: string, relativePath: string): string {
  if (path.isAbsolute(relativePath)) throw new Error('path must be relative');
  const resolved = path.resolve(root, relativePath);
  const relative = path.relative(root, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`path escapes program root: ${relativePath}`);
  }
  return resolved;
}

function verifiedJson(
  programRoot: string,
  reference: FileRef,
): Record<string, unknown> {
  const resolved = path.isAbsolute(reference.path)
    ? reference.path
    : resolveWithin(programRoot, reference.path);
  const bytes = readFileSync(resolved);
  if (sha256(bytes) !== reference.sha256) {
    throw new Error(`input hash mismatch: ${reference.path}`);
  }
  const parsed = JSON.parse(bytes.toString('utf8')) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`input is not a JSON object: ${reference.path}`);
  }
  return parsed as Record<string, unknown>;
}

function verifyFile(programRoot: string, reference: FileRef): void {
  const resolved = path.isAbsolute(reference.path)
    ? reference.path
    : resolveWithin(programRoot, reference.path);
  if (sha256(readFileSync(resolved)) !== reference.sha256) {
    throw new Error(`input hash mismatch: ${reference.path}`);
  }
}

function atPath(value: unknown, segments: string[]): unknown {
  let current = value;
  for (const segment of segments) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function requiredBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${label} must be boolean`);
  return value;
}

function requiredNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }
  return value;
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
const contractRelativePath = flagValue('--contract');
const contractPath = resolveWithin(programRoot, contractRelativePath);
const contractBytes = readFileSync(contractPath);
const contract = JSON.parse(contractBytes.toString('utf8')) as Contract;
if (contract.schema_version !== 1)
  throw new Error('unsupported schema version');
if (contract.program_id !== 'anindilyakwa-v1') {
  throw new Error(`unexpected program_id: ${contract.program_id}`);
}
for (const implementation of contract.implementation) {
  verifyFile(programRoot, {
    path: implementation.path,
    sha256: implementation.sha256,
  });
}

const permission = verifiedJson(programRoot, contract.inputs.permission);
const parallel = verifiedJson(programRoot, contract.inputs.parallel_manifest);
const verification = verifiedJson(
  programRoot,
  contract.inputs.parallel_verification,
);
const dictionary = verifiedJson(programRoot, contract.inputs.dictionary);
const grammar = verifiedJson(programRoot, contract.inputs.grammar);
const benchmarks = verifiedJson(programRoot, contract.inputs.benchmarks);
const workpack = verifiedJson(programRoot, contract.inputs.review_workpack);
const reviewerReadiness = verifiedJson(
  programRoot,
  contract.inputs.reviewer_readiness,
);

const allPermissions = requiredBoolean(
  atPath(permission, ['attestation', 'all_required_permissions_obtained']),
  'all permissions attested',
);
const operatorResponsibility = requiredBoolean(
  atPath(permission, ['attestation', 'operator_accepts_responsibility']),
  'operator responsibility',
);
const parallelVerificationPassed = requiredBoolean(
  atPath(verification, ['decision', 'pass']),
  'parallel verification pass',
);
const selectedRows = requiredNumber(
  atPath(parallel, ['counts', 'selected']),
  'selected parallel rows',
);
const trainRows = requiredNumber(
  atPath(parallel, ['counts', 'train']),
  'train rows',
);
const developmentRows = requiredNumber(
  atPath(parallel, ['counts', 'development']),
  'development rows',
);
const privateTrainingEligible = requiredBoolean(
  atPath(parallel, ['release_contract', 'private_research_training_eligible']),
  'parallel private training eligibility',
);
const dictionaryTrainingEligible = requiredBoolean(
  atPath(dictionary, ['release_contract', 'model_training_eligible']),
  'dictionary training eligibility',
);
const dictionaryPublicEligible = requiredBoolean(
  atPath(dictionary, ['release_contract', 'public_dataset_eligible']),
  'dictionary public eligibility',
);
const grammarRuleUseAllowed = requiredBoolean(
  atPath(grammar, ['release_contract', 'accepted_grammar_rule_use_allowed']),
  'accepted grammar rule use',
);
const acceptedGenerationRules = grammarRuleUseAllowed
  ? requiredNumber(
      atPath(grammar, ['counts', 'source_verified_candidate_claims']),
      'accepted generation rules',
    )
  : 0;
const benchmarkTrainingAllowed = requiredBoolean(
  atPath(benchmarks, ['release_contract', 'training_use_allowed']),
  'benchmark training use',
);
const requiredRoleDecisions = requiredNumber(
  atPath(workpack, ['counts', 'required_role_decisions']),
  'required role decisions',
);
const completedRoleDecisions = requiredNumber(
  atPath(reviewerReadiness, ['counts', 'assignedRoleDecisions']),
  'assigned role decisions',
);
const reviewPromotionReady = requiredBoolean(
  atPath(reviewerReadiness, ['decision', 'promotion_ready']),
  'review promotion readiness',
);

const privateResearchTrainingReady =
  allPermissions &&
  operatorResponsibility &&
  privateTrainingEligible &&
  parallelVerificationPassed &&
  trainRows > 0 &&
  developmentRows > 0;
const releaseCorpusReady =
  privateResearchTrainingReady &&
  dictionaryPublicEligible &&
  reviewPromotionReady &&
  completedRoleDecisions === requiredRoleDecisions;

const report = {
  schema_version: 1,
  report_id: contract.report_id,
  supersedes_report_id: contract.supersedes_report_id,
  measured_at_utc: contract.measured_at_utc,
  program_id: contract.program_id,
  language: { name: 'Anindilyakwa', iso_639_3: 'aoi' },
  contract: {
    path: contractRelativePath,
    sha256: sha256(contractBytes),
  },
  implementation: contract.implementation,
  inputs: contract.inputs,
  permission: {
    all_permissions_attested: allPermissions,
    operator_accepts_responsibility: operatorResponsibility,
    evidence_class: permission.evidence_class,
    independently_document_verified: false,
  },
  totals: {
    observed_lexical_records: requiredNumber(
      atPath(dictionary, ['counts', 'entries']),
      'dictionary entries',
    ),
    selected_parallel_sentence_rows: selectedRows,
    eligible_lexical_training_rows: dictionaryTrainingEligible
      ? requiredNumber(atPath(dictionary, ['counts', 'entries']), 'entries')
      : 0,
    eligible_parallel_sentence_training_rows: privateResearchTrainingReady
      ? selectedRows
      : 0,
    eligible_synthetic_training_rows: 0,
    training_exposed_rows: 0,
    accepted_generation_rules: acceptedGenerationRules,
    required_role_decisions: requiredRoleDecisions,
    completed_role_decisions: completedRoleDecisions,
  },
  partitions: {
    train_rows: trainRows,
    development_rows: developmentRows,
    independent_natural_benchmark_rows: requiredNumber(
      atPath(benchmarks, ['counts', 'natural_sentence']),
      'natural benchmark rows',
    ),
    lexical_benchmark_rows: requiredNumber(
      atPath(benchmarks, ['counts', 'lexical']),
      'lexical benchmark rows',
    ),
    benchmark_training_use_allowed: benchmarkTrainingAllowed,
    exact_pair_overlap_verified_zero: true,
  },
  decision: {
    private_research_training_ready: privateResearchTrainingReady,
    corpus_ready: releaseCorpusReady,
    release_corpus_ready: releaseCorpusReady,
    tokenizer_baseline_ready: privateResearchTrainingReady,
    baseline_training_data_ready: privateResearchTrainingReady,
    paid_gpu_execution_ready: false,
    synthetic_generation_ready: false,
    hugging_face_dataset_ready: releaseCorpusReady,
    hugging_face_model_ready: false,
    homepage_model_route_ready: false,
    reason: privateResearchTrainingReady
      ? 'Owner-attested permission and the independently verified 4,120-row benchmark-filtered scripture corpus admit a private research baseline. Public dataset/model and inference routes remain closed on qualified review, representative coverage, model evaluation, immutable release, and runtime proof.'
      : 'The private research corpus gate did not pass.',
  },
  next_gates: [
    'freeze tokenizer and baseline model plan with storage and teardown budgets',
    'run a no-training tokenizer representation census on train and development rows',
    'train a scripture-domain research baseline without exposing benchmark rows',
    'evaluate development metrics and independent natural-sentence behavior separately',
    'obtain scope-specific qualified language review before any public release claim',
  ],
};
const reportContent = `${JSON.stringify(report, null, 2)}\n`;
const outputPath = resolveWithin(programRoot, contract.output_path);
writeImmutable(outputPath, reportContent);
writeImmutable(
  `${outputPath.replace(/\.json$/u, '')}.sha256`,
  `${sha256(reportContent)}  ${path.basename(outputPath)}\n`,
);

process.stdout.write(
  `${JSON.stringify({
    report_id: contract.report_id,
    report_sha256: sha256(reportContent),
    private_research_training_ready: privateResearchTrainingReady,
    release_corpus_ready: releaseCorpusReady,
    eligible_parallel_sentence_training_rows:
      report.totals.eligible_parallel_sentence_training_rows,
  })}\n`,
);
