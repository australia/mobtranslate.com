// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { evaluateReviewerAssignmentReadiness } from '../../lib/research/reviewerAssignmentReadiness';

const batch = {
  schema_version: 1,
  batch_id: 'batch-1',
  role: 'source_rights_authority',
  task_kind: 'source_rights_review',
  priority: 1,
  task_ids: ['task-1'],
  decision_count: 1,
  estimated_minutes: 30,
  status: 'unassigned',
};

function registry(
  evidenceVerifier = 'independent-verifier',
  scopeTaskIds = ['task-1'],
) {
  return {
    schema_version: 1,
    registry_id: 'registry-v1',
    created_at_utc: '2026-08-08T00:00:00.000Z',
    sensitivity: 'private_reviewer_governance_not_for_publication',
    reviewers: [
      {
        reviewer_id: 'reviewer-1',
        reviewer_kind: 'person',
        status: 'active',
        private_identity_reference: 'private/reviewer-1.json',
        public_attribution_preference: 'to_be_agreed',
        roles: [
          {
            role: 'source_rights_authority',
            status: 'eligible',
            task_kinds: ['source_rights_review'],
            decision_scopes: [
              'research_inventory',
              'benchmark_use',
              'training_use',
              'hosted_transfer',
              'redistribution',
              'derived_weights',
              'public_inference',
            ],
            task_scope: {
              mode: 'explicit_task_ids',
              task_ids: scopeTaskIds,
            },
            authority_basis: 'Authorized source representative.',
            authority_evidence: [
              {
                evidence_id: 'authority-1',
                kind: 'source_owner_authorization',
                reference: 'private/authority-1.pdf',
                sha256: 'a'.repeat(64),
                verification_status: 'verified',
                verified_by_reviewer_id: evidenceVerifier,
                verified_at_utc: '2026-08-08T00:00:00.000Z',
              },
            ],
            role_accepted_at_utc: '2026-08-08T00:00:00.000Z',
            compensation: {
              status: 'agreed',
              terms_reference: 'private/terms-1.pdf',
              agreed_at_utc: '2026-08-08T00:00:00.000Z',
            },
            consent: {
              participation: true,
              decision_processing: true,
              confidential_data_handling: true,
              withdrawal_process_understood: true,
              consented_at_utc: '2026-08-08T00:00:00.000Z',
            },
            conflicts: {
              declaration: 'No conflict identified.',
              status: 'cleared',
              reviewed_by_reviewer_id: 'independent-verifier',
              reviewed_at_utc: '2026-08-08T00:00:00.000Z',
              management_conditions: [],
            },
          },
        ],
      },
    ],
    release_contract: {},
  };
}

function ledger(withAssignment = true) {
  return {
    schema_version: 1,
    assignment_ledger_id: 'assignment-ledger-v1',
    created_at_utc: '2026-08-08T00:00:00.000Z',
    operations_id: 'operations-v1',
    assignments: withAssignment
      ? [
          {
            schema_version: 1,
            assignment_id: 'assignment-1',
            batch_id: 'batch-1',
            reviewer_id: 'reviewer-1',
            role: 'source_rights_authority',
            status: 'active',
            assigned_at_utc: '2026-08-08T00:00:00.000Z',
            accepted_at_utc: '2026-08-08T00:00:00.000Z',
            supersedes_assignment_id: null,
          },
        ]
      : [],
    release_contract: {},
  };
}

describe('reviewer qualification and batch assignment', () => {
  it('keeps an empty registry structurally valid but assignment-ineligible', () => {
    const emptyRegistry = {
      ...registry(),
      reviewers: [],
    };
    const result = evaluateReviewerAssignmentReadiness(
      emptyRegistry,
      ledger(false),
      [batch],
    );

    expect(result.errors).toEqual([]);
    expect(result.counts.reviewers).toBe(0);
    expect(result.counts.assignedRoleDecisions).toBe(0);
    expect(result.assignmentReady).toBe(false);
  });

  it('rejects self-verified authority', () => {
    const result = evaluateReviewerAssignmentReadiness(
      registry('reviewer-1'),
      ledger(),
      [batch],
    );

    expect(result.roleStatuses[0].reasons).toContain(
      'authority_not_independently_verified',
    );
    expect(result.errors).toContain(
      'assignment reviewer role is not eligible: assignment-1',
    );
    expect(result.assignmentReady).toBe(false);
  });

  it('rejects an assignment outside explicit source-rights scope', () => {
    const result = evaluateReviewerAssignmentReadiness(
      registry('independent-verifier', ['different-task']),
      ledger(),
      [batch],
    );

    expect(result.errors).toContain(
      'assignment exceeds reviewer task scope: assignment-1',
    );
    expect(result.assignmentReady).toBe(false);
  });

  it('admits only an accepted assignment backed by verified authority, terms, consent, conflicts, and exact scope', () => {
    const result = evaluateReviewerAssignmentReadiness(registry(), ledger(), [
      batch,
    ]);

    expect(result.errors).toEqual([]);
    expect(result.counts.eligibleReviewerRoles).toBe(1);
    expect(result.counts.assignedBatches).toBe(1);
    expect(result.counts.assignedRoleDecisions).toBe(1);
    expect(result.assignmentReady).toBe(true);
    expect(result.permittedAction).toBe('begin_assigned_review_batches');
  });
});
