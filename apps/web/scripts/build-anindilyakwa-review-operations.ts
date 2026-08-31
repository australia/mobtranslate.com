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

type InputFile = { path: string; sha256: string };
type Rule = {
  role: string;
  task_kind: string;
  priority: number;
  batch_size: number;
  estimated_minutes_per_decision: number;
};
type Contract = {
  schema_version: 1;
  operations_id: string;
  created_at_utc: string;
  workpack_id: string;
  inputs: Record<string, InputFile>;
  rules: Rule[];
  compensation_scenarios_aud_per_hour: number[];
  coordination_overhead_fraction: number;
  output_directory: string;
};
type Task = {
  task_id: string;
  task_kind: string;
  required_review_roles: string[];
};
type WorkpackSummary = {
  workpack_id: string;
  counts: {
    total_tasks: number;
    required_role_decisions: number;
  };
};

function flagValue(flag: string): string {
  const index = process.argv.indexOf(flag);
  if (index < 0 || !process.argv[index + 1]) {
    throw new Error(`missing required ${flag} PATH`);
  }
  return process.argv[index + 1];
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

function sha256(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex');
}

function verifiedBytes(root: string, input: InputFile): Buffer {
  const bytes = readFileSync(resolveWithin(root, input.path));
  if (sha256(bytes) !== input.sha256) {
    throw new Error(`input hash mismatch: ${input.path}`);
  }
  return bytes;
}

function parseJsonl<T>(bytes: Buffer): T[] {
  return bytes
    .toString('utf8')
    .trimEnd()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
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
const contractPath = resolveWithin(programRoot, flagValue('--contract'));
const contractBytes = readFileSync(contractPath);
const contract = JSON.parse(contractBytes.toString('utf8')) as Contract;
if (contract.schema_version !== 1)
  throw new Error('unsupported contract schema');
if (
  contract.coordination_overhead_fraction < 0 ||
  contract.coordination_overhead_fraction > 1
) {
  throw new Error('coordination_overhead_fraction must be between 0 and 1');
}

const summary = JSON.parse(
  verifiedBytes(programRoot, contract.inputs.summary).toString('utf8'),
) as WorkpackSummary;
if (summary.workpack_id !== contract.workpack_id) {
  throw new Error('workpack summary identity mismatch');
}
const taskInputNames = [
  'dictionary_tasks',
  'grammar_tasks',
  'natural_sentence_tasks',
  'source_rights_tasks',
];
const tasks = taskInputNames.flatMap((name) =>
  parseJsonl<Task>(verifiedBytes(programRoot, contract.inputs[name])),
);
if (tasks.length !== summary.counts.total_tasks) {
  throw new Error('task count does not match workpack summary');
}
const taskIds = new Set(tasks.map((task) => task.task_id));
if (taskIds.size !== tasks.length) throw new Error('duplicate task_id');

const rules = new Map(
  contract.rules.map((rule) => [`${rule.role}:${rule.task_kind}`, rule]),
);
if (rules.size !== contract.rules.length) throw new Error('duplicate rule');
for (const rule of contract.rules) {
  if (rule.batch_size < 1 || rule.estimated_minutes_per_decision <= 0) {
    throw new Error(`invalid batching rule: ${rule.role}:${rule.task_kind}`);
  }
}

const assignments = tasks.flatMap((task) =>
  task.required_review_roles.map((role) => {
    const rule = rules.get(`${role}:${task.task_kind}`);
    if (!rule) throw new Error(`missing rule: ${role}:${task.task_kind}`);
    return {
      task_id: task.task_id,
      task_kind: task.task_kind,
      role,
      priority: rule.priority,
      estimated_minutes: rule.estimated_minutes_per_decision,
    };
  }),
);
if (assignments.length !== summary.counts.required_role_decisions) {
  throw new Error('assignment count does not match required role decisions');
}
assignments.sort(
  (left, right) =>
    left.priority - right.priority ||
    left.role.localeCompare(right.role) ||
    left.task_kind.localeCompare(right.task_kind) ||
    left.task_id.localeCompare(right.task_id),
);

const batches: Array<{
  schema_version: 1;
  batch_id: string;
  role: string;
  task_kind: string;
  priority: number;
  task_ids: string[];
  decision_count: number;
  estimated_minutes: number;
  status: 'unassigned';
}> = [];
for (const rule of [...contract.rules].sort(
  (left, right) =>
    left.priority - right.priority ||
    left.role.localeCompare(right.role) ||
    left.task_kind.localeCompare(right.task_kind),
)) {
  const matching = assignments.filter(
    (assignment) =>
      assignment.role === rule.role && assignment.task_kind === rule.task_kind,
  );
  for (let index = 0; index < matching.length; index += rule.batch_size) {
    const rows = matching.slice(index, index + rule.batch_size);
    const batchNumber = Math.floor(index / rule.batch_size) + 1;
    batches.push({
      schema_version: 1,
      batch_id: `${contract.operations_id}:${rule.role}:${rule.task_kind}:${String(batchNumber).padStart(3, '0')}`,
      role: rule.role,
      task_kind: rule.task_kind,
      priority: rule.priority,
      task_ids: rows.map((row) => row.task_id),
      decision_count: rows.length,
      estimated_minutes: rows.reduce(
        (sum, row) => sum + row.estimated_minutes,
        0,
      ),
      status: 'unassigned',
    });
  }
}

const dimensions = [...new Set(assignments.map((row) => row.role))]
  .sort()
  .map((role) => {
    const roleRows = assignments.filter((row) => row.role === role);
    const minutes = roleRows.reduce(
      (sum, assignment) => sum + assignment.estimated_minutes,
      0,
    );
    return {
      role,
      decisions: roleRows.length,
      estimated_minutes: minutes,
      estimated_hours: Number((minutes / 60).toFixed(2)),
      batches: batches.filter((batch) => batch.role === role).length,
      by_task_kind: [...new Set(roleRows.map((row) => row.task_kind))].map(
        (taskKind) => {
          const rows = roleRows.filter((row) => row.task_kind === taskKind);
          const taskMinutes = rows.reduce(
            (sum, row) => sum + row.estimated_minutes,
            0,
          );
          return {
            task_kind: taskKind,
            decisions: rows.length,
            estimated_minutes: taskMinutes,
          };
        },
      ),
    };
  });
const directMinutes = assignments.reduce(
  (sum, assignment) => sum + assignment.estimated_minutes,
  0,
);
const totalMinutes = Math.ceil(
  directMinutes * (1 + contract.coordination_overhead_fraction),
);
const workload = {
  schema_version: 1,
  operations_id: contract.operations_id,
  created_at_utc: contract.created_at_utc,
  workpack: {
    workpack_id: contract.workpack_id,
    summary_sha256: contract.inputs.summary.sha256,
  },
  counts: {
    tasks: tasks.length,
    required_role_decisions: assignments.length,
    review_batches: batches.length,
  },
  planning_assumptions: {
    estimates_are_not_commitments: true,
    reviewer_rates_require_alc_and_reviewer_agreement: true,
    coordination_overhead_fraction: contract.coordination_overhead_fraction,
    rule_table: contract.rules,
  },
  effort: {
    direct_review_minutes: directMinutes,
    direct_review_hours: Number((directMinutes / 60).toFixed(2)),
    total_minutes_with_coordination: totalMinutes,
    total_hours_with_coordination: Number((totalMinutes / 60).toFixed(2)),
    by_role: dimensions,
  },
  compensation_scenarios: contract.compensation_scenarios_aud_per_hour.map(
    (rate) => ({
      currency: 'AUD',
      hourly_rate: rate,
      estimated_total: Number(((totalMinutes / 60) * rate).toFixed(2)),
      interpretation:
        'planning scenario only; not a proposed or accepted community/reviewer rate',
    }),
  ),
  release_boundary: {
    decisions_created: 0,
    reviewers_assigned: 0,
    reviewer_authority_authenticated: false,
    compensation_agreed: false,
    promotion_ready: false,
  },
};
const instructions = `# Anindilyakwa review operations ${contract.operations_id}\n\nThis is a scheduling and compensation-planning artifact, not a review decision or approval.\n\n- Every assignment points to a task in ${contract.workpack_id}.\n- A batch is unassigned until a documented authority accepts it.\n- Estimated minutes and AUD scenarios are planning assumptions only. ALC and reviewers determine roles, rates, compensation, conditions, and workload.\n- Reviewers write decisions only through the workpack schema and append-only ledger.\n- A coordinator must never copy one role's decision into another role.\n- Natural benchmark items remain permanently excluded from training.\n- Empty, incomplete, or unauthenticated ledgers remain non-promotable.\n`;

const outputs = new Map<string, string>([
  [
    'review-assignments.jsonl',
    `${assignments.map((row) => JSON.stringify(row)).join('\n')}\n`,
  ],
  [
    'review-batches.jsonl',
    `${batches.map((row) => JSON.stringify(row)).join('\n')}\n`,
  ],
  ['workload-and-compensation.json', `${JSON.stringify(workload, null, 2)}\n`],
  ['INSTRUCTIONS.md', instructions],
]);
if (!process.argv.includes('--write')) {
  console.log(JSON.stringify(workload, null, 2));
  process.exit(0);
}
const outputRoot = resolveWithin(programRoot, contract.output_directory);
for (const [name, content] of outputs) {
  writeImmutable(path.join(outputRoot, name), content);
}
const sums = [...outputs.entries()]
  .map(([name, content]) => `${sha256(content)}  ${name}`)
  .join('\n');
writeImmutable(path.join(outputRoot, 'SHA256SUMS'), `${sums}\n`);
console.log(JSON.stringify(workload, null, 2));
