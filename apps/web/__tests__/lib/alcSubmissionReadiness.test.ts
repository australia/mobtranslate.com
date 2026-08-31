// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  AlcApplicantProfileSchema,
  evaluateAlcSubmissionReadiness,
} from '../../lib/research/alcSubmissionReadiness';

function field(value: string | null, confirmed = false) {
  return {
    value,
    provenance: value ? 'fixture_candidate' : 'not_provided',
    confirmed_by_applicant: confirmed,
  };
}

function attestation(value = false) {
  return {
    value,
    confirmed_at_utc: value ? '2026-08-08T00:00:00.000Z' : null,
    note: 'Fixture attestation.',
  };
}

function profile(complete = false) {
  return {
    schema_version: 1 as const,
    profile_id: 'fixture-profile-v1',
    created_at_utc: '2026-08-08T00:00:00.000Z',
    sensitivity: 'private_applicant_intake_not_for_publication' as const,
    applicant: {
      name: field('Applicant', complete),
      contact_number: field(complete ? '0400000000' : null, complete),
      email_address: field('applicant@example.test', complete),
      institution_organisation: field('Fixture', complete),
      legal_entity_status: field(complete ? 'individual' : null, complete),
      role_position: field('Researcher', complete),
    },
    project: {
      project_type: field('private research', complete),
      funding_source: field('self-funded', complete),
      new_or_ongoing: field('ongoing', complete),
      planned_start_date: field(complete ? '2026-09-01' : null, complete),
      planned_end_date: field(complete ? '2027-09-01' : null, complete),
      access_dates: field('none for remote phase', complete),
    },
    compliance_and_logistics: {
      permit_position: field('not required for remote phase', complete),
      ethics_position: field('not required for inventory phase', complete),
      transport_arrangements: field('not applicable', complete),
      accommodation_arrangements: field('not applicable', complete),
      alc_logistical_support: field('governance coordination only', complete),
      map_and_location_scope: field('not applicable', complete),
      insurance_position: field(complete ? 'not applicable' : null, complete),
    },
    attestations: {
      identity_may_be_used_in_application: attestation(complete),
      legal_entity_description_is_accurate: attestation(complete),
      funding_description_is_accurate: attestation(complete),
      methodology_is_approved_by_applicant: attestation(complete),
      privacy_review_complete: attestation(complete),
      application_document_generation_authorized: attestation(complete),
      external_submission_authorized: attestation(complete),
    },
  };
}

function contactRoute(complete = false) {
  return {
    schema_version: 1 as const,
    snapshot_id: 'fixture-contact-route-v1',
    verified_at_utc: '2026-08-08T00:00:00.000Z',
    submission_state: {
      current_public_contact_route_identified: true,
      research_application_pathway_confirmed_with_alc: complete,
      nominated_alc_representative_identified: complete,
      application_channel_confirmed: complete,
      external_contact_made: false,
      application_submitted: false,
    },
  };
}

describe('ALC submission readiness', () => {
  it('keeps candidate identity and draft text private and unsendable', () => {
    const result = evaluateAlcSubmissionReadiness(
      profile(false),
      contactRoute(false),
    );

    expect(result.counts.missingValues).toBe(5);
    expect(result.counts.applicantConfirmedFields).toBe(0);
    expect(result.applicationDocumentReady).toBe(false);
    expect(result.externalSubmissionReady).toBe(false);
    expect(result.permittedAction).toBe(
      'retain_private_intake_and_unsent_draft_only',
    );
  });

  it('separates completed document generation from external submission', () => {
    const result = evaluateAlcSubmissionReadiness(
      profile(true),
      contactRoute(false),
    );

    expect(result.applicationDocumentReady).toBe(true);
    expect(result.externalSubmissionReady).toBe(false);
  });

  it('admits final review rendering only after every field, attestation, and route condition passes', () => {
    const result = evaluateAlcSubmissionReadiness(
      profile(true),
      contactRoute(true),
    );

    expect(result.applicationDocumentReady).toBe(true);
    expect(result.externalSubmissionReady).toBe(true);
    expect(result.permittedAction).toBe(
      'render_for_applicant_final_review_only',
    );
  });

  it('rejects a true attestation without a confirmation timestamp', () => {
    const invalid = profile(true);
    invalid.attestations.external_submission_authorized.confirmed_at_utc = null;

    expect(() => AlcApplicantProfileSchema.parse(invalid)).toThrow(
      /true attestation requires a confirmation timestamp/,
    );
  });
});
