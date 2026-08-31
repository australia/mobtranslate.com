import { z } from 'zod';

export const ReviewRoleSchema = z.enum([
  'qualified_language_reviewer',
  'cultural_reviewer',
  'source_rights_authority',
  'program_steward',
]);

export const ReviewTaskKindSchema = z.enum([
  'dictionary_entry_review',
  'grammar_claim_review',
  'natural_sentence_review',
  'source_rights_review',
]);

const DecisionScopeSchema = z.enum([
  'research_inventory',
  'benchmark_use',
  'training_use',
  'hosted_transfer',
  'redistribution',
  'derived_weights',
  'public_inference',
]);

const ReviewerRoleSchema = z.object({
  role: ReviewRoleSchema,
  status: z.enum(['candidate', 'eligible', 'suspended', 'withdrawn']),
  task_kinds: z.array(ReviewTaskKindSchema).min(1),
  decision_scopes: z.array(DecisionScopeSchema).min(1),
  task_scope: z.discriminatedUnion('mode', [
    z.object({
      mode: z.literal('all_tasks_of_kind'),
      task_ids: z.array(z.never()).max(0),
    }),
    z.object({
      mode: z.literal('explicit_task_ids'),
      task_ids: z.array(z.string().min(1)).min(1),
    }),
  ]),
  authority_basis: z.string().trim().min(1),
  authority_evidence: z
    .array(
      z.object({
        evidence_id: z.string().trim().min(1),
        kind: z.enum([
          'alc_nomination',
          'traditional_owner_authorization',
          'source_owner_authorization',
          'institutional_appointment',
          'program_appointment',
          'credential_and_experience_record',
        ]),
        reference: z.string().trim().min(1),
        sha256: z
          .string()
          .regex(/^[0-9a-f]{64}$/)
          .nullable(),
        verification_status: z.enum(['pending', 'verified', 'rejected']),
        verified_by_reviewer_id: z.string().trim().min(1).nullable(),
        verified_at_utc: z.string().datetime().nullable(),
      }),
    )
    .min(1),
  role_accepted_at_utc: z.string().datetime().nullable(),
  compensation: z.object({
    status: z.enum(['not_discussed', 'proposed', 'agreed', 'waived']),
    terms_reference: z.string().trim().min(1).nullable(),
    agreed_at_utc: z.string().datetime().nullable(),
  }),
  consent: z.object({
    participation: z.boolean(),
    decision_processing: z.boolean(),
    confidential_data_handling: z.boolean(),
    withdrawal_process_understood: z.boolean(),
    consented_at_utc: z.string().datetime().nullable(),
  }),
  conflicts: z.object({
    declaration: z.string().trim().min(1),
    status: z.enum(['unreviewed', 'cleared', 'managed', 'unresolved']),
    reviewed_by_reviewer_id: z.string().trim().min(1).nullable(),
    reviewed_at_utc: z.string().datetime().nullable(),
    management_conditions: z.array(z.string().trim().min(1)),
  }),
});

export const ReviewerRegistrySchema = z.object({
  schema_version: z.literal(1),
  registry_id: z.string().trim().min(1),
  created_at_utc: z.string().datetime(),
  sensitivity: z.literal('private_reviewer_governance_not_for_publication'),
  reviewers: z.array(
    z.object({
      reviewer_id: z.string().trim().min(1),
      reviewer_kind: z.enum(['person']),
      status: z.enum(['candidate', 'active', 'suspended', 'withdrawn']),
      private_identity_reference: z.string().trim().min(1),
      public_attribution_preference: z.enum([
        'full_name',
        'role_only',
        'anonymous',
        'to_be_agreed',
      ]),
      roles: z.array(ReviewerRoleSchema).min(1),
    }),
  ),
  release_contract: z.record(z.string(), z.unknown()),
});

export const BatchAssignmentLedgerSchema = z.object({
  schema_version: z.literal(1),
  assignment_ledger_id: z.string().trim().min(1),
  created_at_utc: z.string().datetime(),
  operations_id: z.string().trim().min(1),
  assignments: z.array(
    z.object({
      schema_version: z.literal(1),
      assignment_id: z.string().trim().min(1),
      batch_id: z.string().trim().min(1),
      reviewer_id: z.string().trim().min(1),
      role: ReviewRoleSchema,
      status: z.enum(['offered', 'active', 'completed', 'withdrawn']),
      assigned_at_utc: z.string().datetime(),
      accepted_at_utc: z.string().datetime().nullable(),
      supersedes_assignment_id: z.string().trim().min(1).nullable(),
    }),
  ),
  release_contract: z.record(z.string(), z.unknown()),
});

export const ReviewBatchSchema = z.object({
  schema_version: z.literal(1),
  batch_id: z.string().trim().min(1),
  role: ReviewRoleSchema,
  task_kind: ReviewTaskKindSchema,
  priority: z.number().int().positive(),
  task_ids: z.array(z.string().trim().min(1)).min(1),
  decision_count: z.number().int().positive(),
  estimated_minutes: z.number().int().nonnegative(),
  status: z.string().trim().min(1),
});

type ReviewerRegistry = z.infer<typeof ReviewerRegistrySchema>;
type ReviewerRole = z.infer<typeof ReviewerRoleSchema>;
type ReviewBatch = z.infer<typeof ReviewBatchSchema>;

function roleEligibilityReasons(
  reviewerId: string,
  reviewerStatus: string,
  role: ReviewerRole,
): string[] {
  const reasons: string[] = [];
  if (reviewerStatus !== 'active') reasons.push('reviewer_not_active');
  if (role.status !== 'eligible') reasons.push('role_not_eligible');
  if (!role.role_accepted_at_utc) reasons.push('role_not_accepted');
  const verifiedEvidence = role.authority_evidence.filter(
    (item) =>
      item.verification_status === 'verified' &&
      item.verified_by_reviewer_id &&
      item.verified_by_reviewer_id !== reviewerId &&
      item.verified_at_utc,
  );
  if (verifiedEvidence.length === 0) {
    reasons.push('authority_not_independently_verified');
  }
  if (
    !['agreed', 'waived'].includes(role.compensation.status) ||
    !role.compensation.terms_reference ||
    !role.compensation.agreed_at_utc
  ) {
    reasons.push('compensation_not_agreed_or_documented');
  }
  if (
    !role.consent.participation ||
    !role.consent.decision_processing ||
    !role.consent.confidential_data_handling ||
    !role.consent.withdrawal_process_understood ||
    !role.consent.consented_at_utc
  ) {
    reasons.push('reviewer_consent_incomplete');
  }
  if (
    !['cleared', 'managed'].includes(role.conflicts.status) ||
    !role.conflicts.reviewed_by_reviewer_id ||
    role.conflicts.reviewed_by_reviewer_id === reviewerId ||
    !role.conflicts.reviewed_at_utc
  ) {
    reasons.push('conflict_review_incomplete');
  }
  if (
    role.role === 'source_rights_authority' &&
    role.task_scope.mode !== 'explicit_task_ids'
  ) {
    reasons.push('source_rights_authority_requires_explicit_task_scope');
  }
  return reasons;
}

function assignmentCoversBatch(
  role: ReviewerRole,
  batch: ReviewBatch,
): boolean {
  if (!role.task_kinds.includes(batch.task_kind)) return false;
  if (role.task_scope.mode === 'all_tasks_of_kind') return true;
  const taskIds = new Set(role.task_scope.task_ids);
  return batch.task_ids.every((taskId) => taskIds.has(taskId));
}

export function evaluateReviewerAssignmentReadiness(
  registryInput: unknown,
  assignmentLedgerInput: unknown,
  batchInputs: unknown[],
) {
  const registry = ReviewerRegistrySchema.parse(registryInput);
  const ledger = BatchAssignmentLedgerSchema.parse(assignmentLedgerInput);
  const batches = batchInputs.map((batch) => ReviewBatchSchema.parse(batch));
  const errors: string[] = [];
  const reviewerIds = new Set<string>();
  const eligibleRoleKeys = new Set<string>();
  const roleStatuses: Array<{
    reviewerId: string;
    role: z.infer<typeof ReviewRoleSchema>['role'];
    eligible: boolean;
    reasons: string[];
  }> = [];
  const reviewerById = new Map<string, ReviewerRegistry['reviewers'][number]>();
  for (const reviewer of registry.reviewers) {
    if (reviewerIds.has(reviewer.reviewer_id)) {
      errors.push(`duplicate reviewer_id: ${reviewer.reviewer_id}`);
      continue;
    }
    reviewerIds.add(reviewer.reviewer_id);
    reviewerById.set(reviewer.reviewer_id, reviewer);
    const observedRoles = new Set<string>();
    for (const role of reviewer.roles) {
      if (observedRoles.has(role.role)) {
        errors.push(
          `duplicate role ${role.role} for reviewer ${reviewer.reviewer_id}`,
        );
        continue;
      }
      observedRoles.add(role.role);
      const reasons = roleEligibilityReasons(
        reviewer.reviewer_id,
        reviewer.status,
        role,
      );
      const eligible = reasons.length === 0;
      if (eligible)
        eligibleRoleKeys.add(`${reviewer.reviewer_id}:${role.role}`);
      roleStatuses.push({
        reviewerId: reviewer.reviewer_id,
        role: role.role,
        eligible,
        reasons,
      });
    }
  }

  const batchById = new Map<string, ReviewBatch>();
  for (const batch of batches) {
    if (batchById.has(batch.batch_id)) {
      errors.push(`duplicate batch_id: ${batch.batch_id}`);
    } else {
      batchById.set(batch.batch_id, batch);
    }
    if (batch.decision_count !== batch.task_ids.length) {
      errors.push(`batch decision count mismatch: ${batch.batch_id}`);
    }
  }

  const assignmentIds = new Set<string>();
  const activeBatchIds = new Set<string>();
  const validActiveAssignments: typeof ledger.assignments = [];
  for (const assignment of ledger.assignments) {
    if (assignmentIds.has(assignment.assignment_id)) {
      errors.push(`duplicate assignment_id: ${assignment.assignment_id}`);
      continue;
    }
    assignmentIds.add(assignment.assignment_id);
    if (!['active', 'completed'].includes(assignment.status)) continue;
    if (!assignment.accepted_at_utc) {
      errors.push(
        `accepted assignment has no acceptance: ${assignment.assignment_id}`,
      );
      continue;
    }
    const batch = batchById.get(assignment.batch_id);
    if (!batch) {
      errors.push(
        `assignment references unknown batch: ${assignment.batch_id}`,
      );
      continue;
    }
    if (activeBatchIds.has(assignment.batch_id)) {
      errors.push(
        `multiple active assignments for batch: ${assignment.batch_id}`,
      );
      continue;
    }
    const reviewer = reviewerById.get(assignment.reviewer_id);
    const role = reviewer?.roles.find((item) => item.role === assignment.role);
    if (!reviewer || !role) {
      errors.push(
        `assignment reviewer role not found: ${assignment.assignment_id}`,
      );
      continue;
    }
    if (assignment.role !== batch.role) {
      errors.push(
        `assignment role does not match batch: ${assignment.assignment_id}`,
      );
      continue;
    }
    if (!eligibleRoleKeys.has(`${assignment.reviewer_id}:${assignment.role}`)) {
      errors.push(
        `assignment reviewer role is not eligible: ${assignment.assignment_id}`,
      );
      continue;
    }
    if (!assignmentCoversBatch(role, batch)) {
      errors.push(
        `assignment exceeds reviewer task scope: ${assignment.assignment_id}`,
      );
      continue;
    }
    activeBatchIds.add(assignment.batch_id);
    validActiveAssignments.push(assignment);
  }

  const assignedDecisionCount = validActiveAssignments.reduce(
    (total, assignment) =>
      total + (batchById.get(assignment.batch_id)?.decision_count ?? 0),
    0,
  );
  const roleDemand = Object.values(ReviewRoleSchema.enum).map((role) => {
    const roleBatches = batches.filter((batch) => batch.role === role);
    return {
      role,
      batches: roleBatches.length,
      decisions: roleBatches.reduce(
        (total, batch) => total + batch.decision_count,
        0,
      ),
      eligibleReviewers: new Set(
        roleStatuses
          .filter((status) => status.role === role && status.eligible)
          .map((status) => status.reviewerId),
      ).size,
      assignedBatches: validActiveAssignments.filter(
        (assignment) => assignment.role === role,
      ).length,
    };
  });
  const allBatchesAssigned =
    batches.length > 0 && activeBatchIds.size === batches.length;

  return {
    registryId: registry.registry_id,
    assignmentLedgerId: ledger.assignment_ledger_id,
    counts: {
      reviewers: registry.reviewers.length,
      eligibleReviewerRoles: roleStatuses.filter((status) => status.eligible)
        .length,
      batches: batches.length,
      requiredRoleDecisions: batches.reduce(
        (total, batch) => total + batch.decision_count,
        0,
      ),
      validActiveAssignments: validActiveAssignments.length,
      assignedBatches: activeBatchIds.size,
      assignedRoleDecisions: assignedDecisionCount,
      errors: errors.length,
    },
    roleDemand,
    roleStatuses,
    errors,
    allBatchesAssigned,
    assignmentReady: errors.length === 0 && allBatchesAssigned,
    permittedAction:
      errors.length === 0 && allBatchesAssigned
        ? 'begin_assigned_review_batches'
        : 'recruit_verify_and_assign_reviewers_only',
  };
}
