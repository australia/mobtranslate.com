import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

type Task = {
  task_id: string;
  task_kind: string;
  required_review_roles: string[];
};
type ScopeValue = 'allowed' | 'not_allowed' | 'conditional' | 'not_reviewed';
type Decision = {
  schema_version: number;
  decision_id: string;
  task_id: string;
  task_kind: string;
  reviewer: {
    reviewer_id: string;
    role: string;
    affiliation?: string | null;
    authority_basis: string;
  };
  decided_at_utc: string;
  verdict:
    | 'approve'
    | 'approve_with_revision'
    | 'reject'
    | 'defer'
    | 'not_applicable';
  scope: Record<string, ScopeValue>;
  rationale: string;
  evidence_refs: Array<{
    kind: string;
    reference: string;
    sha256?: string | null;
    note?: string | null;
  }>;
  amendments?: Record<string, unknown> | null;
  conditions?: string[];
  supersedes_decision_id?: string | null;
};

const taskFiles = [
  'dictionary-tasks.jsonl',
  'grammar-tasks.jsonl',
  'natural-sentence-tasks.jsonl',
  'source-rights-tasks.jsonl',
];
const allowedTaskKinds = new Set([
  'dictionary_entry_review',
  'grammar_claim_review',
  'natural_sentence_review',
  'source_rights_review',
]);
const allowedRoles = new Set([
  'qualified_language_reviewer',
  'cultural_reviewer',
  'source_rights_authority',
  'program_steward',
]);
const allowedVerdicts = new Set([
  'approve',
  'approve_with_revision',
  'reject',
  'defer',
  'not_applicable',
]);
const scopeKeys = [
  'research_inventory',
  'benchmark_use',
  'training_use',
  'hosted_transfer',
  'redistribution',
  'derived_weights',
  'public_inference',
];
const allowedScopeValues = new Set([
  'allowed',
  'not_allowed',
  'conditional',
  'not_reviewed',
]);

function flagValue(flag: string): string {
  const index = process.argv.indexOf(flag);
  if (index < 0 || !process.argv[index + 1]) {
    throw new Error(`missing required ${flag} PATH`);
  }
  return process.argv[index + 1];
}

function parseJsonl<T>(filePath: string): T[] {
  const content = readFileSync(filePath, 'utf8').trimEnd();
  if (!content) return [];
  return content.split('\n').map((line, index) => {
    try {
      return JSON.parse(line) as T;
    } catch (error) {
      throw new Error(
        `${filePath}:${index + 1}: invalid JSON: ${(error as Error).message}`,
      );
    }
  });
}

function nonempty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function sha256(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex');
}

const workpackRoot = path.resolve(flagValue('--workpack-root'));
const decisionsPath = path.resolve(flagValue('--decisions'));
const workpackSummaryBytes = readFileSync(
  path.join(workpackRoot, 'summary.json'),
);
const workpackSummary = JSON.parse(workpackSummaryBytes.toString('utf8')) as {
  workpack_id: string;
};
const workpackManifestBytes = readFileSync(
  path.join(workpackRoot, 'SHA256SUMS'),
);
const decisionLedgerBytes = readFileSync(decisionsPath);
const tasks: Task[] = taskFiles.flatMap((fileName) =>
  parseJsonl<Task>(path.join(workpackRoot, fileName)),
);
const decisions = parseJsonl<Decision>(decisionsPath);
const errors: string[] = [];
const taskById = new Map<string, Task>();
for (const task of tasks) {
  if (!nonempty(task.task_id)) {
    errors.push('task has an empty task_id');
    continue;
  }
  if (taskById.has(task.task_id))
    errors.push(`duplicate task_id: ${task.task_id}`);
  if (!allowedTaskKinds.has(task.task_kind)) {
    errors.push(`invalid task_kind for ${task.task_id}: ${task.task_kind}`);
  }
  if (
    !Array.isArray(task.required_review_roles) ||
    task.required_review_roles.length === 0 ||
    task.required_review_roles.some((role) => !allowedRoles.has(role))
  ) {
    errors.push(`invalid required_review_roles for ${task.task_id}`);
  }
  taskById.set(task.task_id, task);
}

const decisionById = new Map<string, Decision>();
for (const [index, decision] of decisions.entries()) {
  const prefix = `decision line ${index + 1}`;
  if (decision.schema_version !== 1) errors.push(`${prefix}: schema_version`);
  if (!nonempty(decision.decision_id)) {
    errors.push(`${prefix}: decision_id`);
  } else if (decisionById.has(decision.decision_id)) {
    errors.push(`${prefix}: duplicate decision_id ${decision.decision_id}`);
  } else {
    decisionById.set(decision.decision_id, decision);
  }
  const task = taskById.get(decision.task_id);
  if (!task) {
    errors.push(`${prefix}: unknown task_id ${decision.task_id}`);
    continue;
  }
  if (decision.task_kind !== task.task_kind) {
    errors.push(`${prefix}: task_kind does not match workpack`);
  }
  if (!decision.reviewer || !nonempty(decision.reviewer.reviewer_id)) {
    errors.push(`${prefix}: reviewer_id`);
  }
  if (!decision.reviewer || !allowedRoles.has(decision.reviewer.role)) {
    errors.push(`${prefix}: reviewer role`);
  } else if (!task.required_review_roles.includes(decision.reviewer.role)) {
    errors.push(`${prefix}: reviewer role is not required for task`);
  }
  if (!decision.reviewer || !nonempty(decision.reviewer.authority_basis)) {
    errors.push(`${prefix}: authority_basis`);
  }
  if (
    !nonempty(decision.decided_at_utc) ||
    !decision.decided_at_utc.endsWith('Z') ||
    Number.isNaN(Date.parse(decision.decided_at_utc))
  ) {
    errors.push(`${prefix}: decided_at_utc must be valid UTC`);
  }
  if (!allowedVerdicts.has(decision.verdict)) errors.push(`${prefix}: verdict`);
  if (!decision.scope || typeof decision.scope !== 'object') {
    errors.push(`${prefix}: scope`);
  } else {
    const observedScopeKeys = Object.keys(decision.scope).sort();
    if (
      JSON.stringify(observedScopeKeys) !==
      JSON.stringify([...scopeKeys].sort())
    ) {
      errors.push(`${prefix}: scope keys must match the contract exactly`);
    }
    for (const key of scopeKeys) {
      if (!allowedScopeValues.has(decision.scope[key])) {
        errors.push(`${prefix}: invalid scope value for ${key}`);
      }
    }
  }
  if (!nonempty(decision.rationale)) errors.push(`${prefix}: rationale`);
  if (
    !Array.isArray(decision.evidence_refs) ||
    decision.evidence_refs.length === 0
  ) {
    errors.push(`${prefix}: at least one evidence_ref is required`);
  } else {
    for (const evidence of decision.evidence_refs) {
      if (!nonempty(evidence.reference))
        errors.push(`${prefix}: evidence reference`);
      if (evidence.sha256 != null && !/^[0-9a-f]{64}$/u.test(evidence.sha256)) {
        errors.push(`${prefix}: evidence sha256`);
      }
    }
  }
  if (
    decision.verdict === 'approve_with_revision' &&
    (!decision.amendments || Object.keys(decision.amendments).length === 0)
  ) {
    errors.push(`${prefix}: approve_with_revision requires amendments`);
  }
  if (
    Object.values(decision.scope ?? {}).includes('conditional') &&
    (!Array.isArray(decision.conditions) || decision.conditions.length === 0)
  ) {
    errors.push(`${prefix}: conditional scope requires conditions`);
  }
  if (
    task.task_kind === 'source_rights_review' &&
    ['approve', 'approve_with_revision'].includes(decision.verdict) &&
    Object.values(decision.scope ?? {}).includes('not_reviewed')
  ) {
    errors.push(
      `${prefix}: an approving rights decision cannot leave a scope unreviewed`,
    );
  }
  if (
    task.task_kind === 'natural_sentence_review' &&
    decision.scope?.training_use !== 'not_allowed'
  ) {
    errors.push(
      `${prefix}: frozen natural benchmarks must keep training_use not_allowed`,
    );
  }
}

const supersededIds = new Set<string>();
for (const decision of decisions) {
  if (!decision.supersedes_decision_id) continue;
  const previous = decisionById.get(decision.supersedes_decision_id);
  if (!previous) {
    errors.push(
      `${decision.decision_id}: supersedes unknown decision ${decision.supersedes_decision_id}`,
    );
    continue;
  }
  if (
    previous.task_id !== decision.task_id ||
    previous.reviewer?.role !== decision.reviewer?.role
  ) {
    errors.push(
      `${decision.decision_id}: superseded decision must share task and role`,
    );
  }
  if (supersededIds.has(previous.decision_id)) {
    errors.push(`${decision.decision_id}: decision is already superseded`);
  }
  if (
    Date.parse(decision.decided_at_utc) <= Date.parse(previous.decided_at_utc)
  ) {
    errors.push(
      `${decision.decision_id}: correction must be later than prior decision`,
    );
  }
  supersededIds.add(previous.decision_id);
}

const activeDecisions = decisions.filter(
  (decision) => !supersededIds.has(decision.decision_id),
);
const activeByTaskRole = new Map<string, Decision>();
for (const decision of activeDecisions) {
  const key = `${decision.task_id}\u0000${decision.reviewer?.role}`;
  if (activeByTaskRole.has(key)) {
    errors.push(
      `${decision.task_id}: multiple active decisions for ${decision.reviewer?.role}`,
    );
  } else {
    activeByTaskRole.set(key, decision);
  }
}

const taskStates = tasks.map((task) => {
  const roleDecisions = task.required_review_roles
    .map((role) => ({
      role,
      decision: activeByTaskRole.get(`${task.task_id}\u0000${role}`) ?? null,
    }))
    .sort((left, right) => left.role.localeCompare(right.role));
  const missingRoles = roleDecisions
    .filter((row) => !row.decision)
    .map((row) => row.role);
  const verdicts = roleDecisions
    .map((row) => row.decision?.verdict)
    .filter((verdict): verdict is Decision['verdict'] => Boolean(verdict));
  let state = 'pending';
  if (verdicts.includes('reject')) state = 'rejected';
  else if (verdicts.includes('defer')) state = 'deferred';
  else if (missingRoles.length === 0 && verdicts.includes('not_applicable')) {
    state = 'not_applicable';
  } else if (
    missingRoles.length === 0 &&
    verdicts.every((verdict) =>
      ['approve', 'approve_with_revision'].includes(verdict),
    )
  ) {
    const conditional = roleDecisions.some(
      (row) =>
        row.decision?.verdict === 'approve_with_revision' ||
        Object.values(row.decision?.scope ?? {}).includes('conditional'),
    );
    state = conditional ? 'conditionally_approved' : 'approved';
  }
  return {
    task_id: task.task_id,
    task_kind: task.task_kind,
    state,
    missing_roles: missingRoles,
    active_decision_ids: roleDecisions
      .map((row) => row.decision?.decision_id)
      .filter(Boolean),
  };
});

const states = [
  'pending',
  'approved',
  'conditionally_approved',
  'rejected',
  'deferred',
  'not_applicable',
];
const countsByState = Object.fromEntries(
  states.map((state) => [
    state,
    taskStates.filter((task) => task.state === state).length,
  ]),
);
const completeForKind = (taskKind: string) => {
  const rows = taskStates.filter((task) => task.task_kind === taskKind);
  return (
    rows.length > 0 &&
    rows.every((task) => ['approved', 'not_applicable'].includes(task.state))
  );
};
const report = {
  schema_version: 1,
  validator_id: 'anindilyakwa-review-decision-validator-v1',
  validation_status: errors.length === 0 ? 'PASS' : 'FAIL',
  workpack: {
    workpack_id: workpackSummary.workpack_id,
    root: workpackRoot,
    summary_sha256: sha256(workpackSummaryBytes),
    manifest_sha256: sha256(workpackManifestBytes),
  },
  decision_ledger: {
    path: decisionsPath,
    sha256: sha256(decisionLedgerBytes),
    rows: decisions.length,
  },
  counts: {
    tasks: tasks.length,
    decisions: decisions.length,
    active_decisions: activeDecisions.length,
    superseded_decisions: supersededIds.size,
    errors: errors.length,
    tasks_by_state: countsByState,
  },
  gates: {
    dictionary_review_complete: completeForKind('dictionary_entry_review'),
    grammar_review_complete: completeForKind('grammar_claim_review'),
    natural_sentence_review_complete: completeForKind(
      'natural_sentence_review',
    ),
    source_rights_review_complete: completeForKind('source_rights_review'),
    promotion_ready: taskStates.every((task) =>
      ['approved', 'not_applicable'].includes(task.state),
    ),
  },
  interpretation_boundary:
    'Structural validation and role coverage do not authenticate reviewer identity, authority, language competence, cultural authority, or the truth of a decision. Those remain evidence obligations.',
  errors,
  task_details: taskStates,
};

console.log(JSON.stringify(report, null, 2));
if (errors.length > 0) process.exit(1);
if (
  process.argv.includes('--require-promotion-ready') &&
  !report.gates.promotion_ready
) {
  process.exit(2);
}
