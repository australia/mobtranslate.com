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

import { evaluateReviewerAssignmentReadiness } from '../lib/research/reviewerAssignmentReadiness';

type InputFile = { path: string; sha256: string };
type Contract = {
  schema_version: 1;
  assessment_id: string;
  assessed_at_utc: string;
  program_id: string;
  inputs: {
    reviewer_registry: InputFile;
    assignment_ledger: InputFile;
    review_batches: InputFile;
    operations_summary: InputFile;
    workpack_summary: InputFile;
  };
  implementation: Array<InputFile & { role: string }>;
  output_directory: string;
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

function verifiedBytes(root: string, input: InputFile): Buffer {
  const bytes = readFileSync(resolveWithin(root, input.path));
  if (sha256(bytes) !== input.sha256) {
    throw new Error(`input hash mismatch: ${input.path}`);
  }
  return bytes;
}

function verifyExternal(input: InputFile): void {
  if (!path.isAbsolute(input.path)) {
    throw new Error('implementation path must be absolute');
  }
  const bytes = readFileSync(input.path);
  if (sha256(bytes) !== input.sha256) {
    throw new Error(`implementation hash mismatch: ${input.path}`);
  }
}

function parseJson(bytes: Buffer, label: string): Record<string, unknown> {
  const parsed = JSON.parse(bytes.toString('utf8')) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${label} is not a JSON object`);
  }
  return parsed as Record<string, unknown>;
}

function parseJsonl(bytes: Buffer): unknown[] {
  return bytes
    .toString('utf8')
    .trimEnd()
    .split('\n')
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line) as unknown;
      } catch (error) {
        throw new Error(
          `review batch line ${index + 1}: ${(error as Error).message}`,
        );
      }
    });
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
if (contract.schema_version !== 1) {
  throw new Error('unsupported contract schema');
}
if (contract.program_id !== 'anindilyakwa-v1') {
  throw new Error(`unexpected program_id: ${contract.program_id}`);
}
for (const implementation of contract.implementation) {
  verifyExternal(implementation);
}

const registry = parseJson(
  verifiedBytes(programRoot, contract.inputs.reviewer_registry),
  'reviewer registry',
);
const assignmentLedger = parseJson(
  verifiedBytes(programRoot, contract.inputs.assignment_ledger),
  'assignment ledger',
);
const batches = parseJsonl(
  verifiedBytes(programRoot, contract.inputs.review_batches),
);
const operations = parseJson(
  verifiedBytes(programRoot, contract.inputs.operations_summary),
  'operations summary',
);
const workpack = parseJson(
  verifiedBytes(programRoot, contract.inputs.workpack_summary),
  'workpack summary',
);
const evaluation = evaluateReviewerAssignmentReadiness(
  registry,
  assignmentLedger,
  batches,
);
const operationsCounts = operations.counts as Record<string, unknown>;
const workpackCounts = workpack.counts as Record<string, unknown>;
if (
  operationsCounts.review_batches !== evaluation.counts.batches ||
  operationsCounts.required_role_decisions !==
    evaluation.counts.requiredRoleDecisions ||
  workpackCounts.required_role_decisions !==
    evaluation.counts.requiredRoleDecisions
) {
  throw new Error('batch or role-decision counts do not reconcile');
}

const summary = {
  schema_version: 1,
  assessment_id: contract.assessment_id,
  assessed_at_utc: contract.assessed_at_utc,
  program_id: contract.program_id,
  contract: {
    path: contractRelativePath,
    sha256: sha256(contractBytes),
  },
  implementation: contract.implementation,
  inputs: contract.inputs,
  counts: evaluation.counts,
  role_demand: evaluation.roleDemand,
  role_statuses: evaluation.roleStatuses,
  validation_errors: evaluation.errors,
  decision: {
    all_batches_assigned: evaluation.allBatchesAssigned,
    assignment_ready: evaluation.assignmentReady,
    permitted_action: evaluation.permittedAction,
    review_decisions_authorized: false,
    promotion_ready: false,
    claim_limit:
      'The empty reviewer registry is a valid planning baseline only. No reviewer identity, authority, compensation, consent, conflict clearance, batch assignment, review decision, or promotion is created by this assessment.',
  },
};
const outputRoot = resolveWithin(programRoot, contract.output_directory);
const summaryContent = `${JSON.stringify(summary, null, 2)}\n`;
writeImmutable(path.join(outputRoot, 'summary.json'), summaryContent);
writeImmutable(
  path.join(outputRoot, 'SHA256SUMS'),
  `${sha256(summaryContent)}  summary.json\n`,
);
process.stdout.write(
  `${JSON.stringify({
    assessment_id: contract.assessment_id,
    reviewers: evaluation.counts.reviewers,
    eligible_reviewer_roles: evaluation.counts.eligibleReviewerRoles,
    assigned_batches: evaluation.counts.assignedBatches,
    assigned_role_decisions: evaluation.counts.assignedRoleDecisions,
    assignment_ready: evaluation.assignmentReady,
    validation_errors: evaluation.counts.errors,
    output: contract.output_directory,
  })}\n`,
);
if (
  process.argv.includes('--require-assignment-ready') &&
  !evaluation.assignmentReady
) {
  process.exitCode = 2;
}
