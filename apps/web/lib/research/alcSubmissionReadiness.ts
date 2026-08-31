import { z } from 'zod';

const CandidateFieldSchema = z.object({
  value: z.string().trim().min(1).nullable(),
  provenance: z.string().trim().min(1),
  confirmed_by_applicant: z.boolean(),
});

const AttestationSchema = z
  .object({
    value: z.boolean(),
    confirmed_at_utc: z.string().datetime().nullable(),
    note: z.string().trim().min(1),
  })
  .superRefine((attestation, context) => {
    if (attestation.value && !attestation.confirmed_at_utc) {
      context.addIssue({
        code: 'custom',
        path: ['confirmed_at_utc'],
        message: 'a true attestation requires a confirmation timestamp',
      });
    }
  });

export const AlcApplicantProfileSchema = z.object({
  schema_version: z.literal(1),
  profile_id: z.string().trim().min(1),
  created_at_utc: z.string().datetime(),
  sensitivity: z.literal('private_applicant_intake_not_for_publication'),
  applicant: z.object({
    name: CandidateFieldSchema,
    contact_number: CandidateFieldSchema,
    email_address: CandidateFieldSchema,
    institution_organisation: CandidateFieldSchema,
    legal_entity_status: CandidateFieldSchema,
    role_position: CandidateFieldSchema,
  }),
  project: z.object({
    project_type: CandidateFieldSchema,
    funding_source: CandidateFieldSchema,
    new_or_ongoing: CandidateFieldSchema,
    planned_start_date: CandidateFieldSchema,
    planned_end_date: CandidateFieldSchema,
    access_dates: CandidateFieldSchema,
  }),
  compliance_and_logistics: z.object({
    permit_position: CandidateFieldSchema,
    ethics_position: CandidateFieldSchema,
    transport_arrangements: CandidateFieldSchema,
    accommodation_arrangements: CandidateFieldSchema,
    alc_logistical_support: CandidateFieldSchema,
    map_and_location_scope: CandidateFieldSchema,
    insurance_position: CandidateFieldSchema,
  }),
  attestations: z.object({
    identity_may_be_used_in_application: AttestationSchema,
    legal_entity_description_is_accurate: AttestationSchema,
    funding_description_is_accurate: AttestationSchema,
    methodology_is_approved_by_applicant: AttestationSchema,
    privacy_review_complete: AttestationSchema,
    application_document_generation_authorized: AttestationSchema,
    external_submission_authorized: AttestationSchema,
  }),
});

export const AlcContactRouteSchema = z.object({
  schema_version: z.literal(1),
  snapshot_id: z.string().trim().min(1),
  verified_at_utc: z.string().datetime(),
  submission_state: z.object({
    current_public_contact_route_identified: z.boolean(),
    research_application_pathway_confirmed_with_alc: z.boolean(),
    nominated_alc_representative_identified: z.boolean(),
    application_channel_confirmed: z.boolean(),
    external_contact_made: z.boolean(),
    application_submitted: z.boolean(),
  }),
});

export type AlcApplicantProfile = z.infer<typeof AlcApplicantProfileSchema>;
export type AlcContactRoute = z.infer<typeof AlcContactRouteSchema>;

type CandidateField = z.infer<typeof CandidateFieldSchema>;

type FieldDefinition = {
  fieldId: string;
  officialFormSection: string;
  field: CandidateField;
};

function requiredFields(profile: AlcApplicantProfile): FieldDefinition[] {
  return [
    {
      fieldId: 'applicant.name',
      officialFormSection: 'Applicant Details',
      field: profile.applicant.name,
    },
    {
      fieldId: 'applicant.contact_number',
      officialFormSection: 'Applicant Details',
      field: profile.applicant.contact_number,
    },
    {
      fieldId: 'applicant.email_address',
      officialFormSection: 'Applicant Details',
      field: profile.applicant.email_address,
    },
    {
      fieldId: 'applicant.institution_organisation',
      officialFormSection: 'Applicant Details',
      field: profile.applicant.institution_organisation,
    },
    {
      fieldId: 'applicant.legal_entity_status',
      officialFormSection: 'Applicant Details attachment',
      field: profile.applicant.legal_entity_status,
    },
    {
      fieldId: 'applicant.role_position',
      officialFormSection: 'Applicant Details',
      field: profile.applicant.role_position,
    },
    {
      fieldId: 'project.project_type',
      officialFormSection: 'Project details',
      field: profile.project.project_type,
    },
    {
      fieldId: 'project.funding_source',
      officialFormSection: 'Project details',
      field: profile.project.funding_source,
    },
    {
      fieldId: 'project.new_or_ongoing',
      officialFormSection: 'Project details',
      field: profile.project.new_or_ongoing,
    },
    {
      fieldId: 'project.planned_start_date',
      officialFormSection: 'Project timeframe',
      field: profile.project.planned_start_date,
    },
    {
      fieldId: 'project.planned_end_date',
      officialFormSection: 'Project timeframe',
      field: profile.project.planned_end_date,
    },
    {
      fieldId: 'project.access_dates',
      officialFormSection: 'Project timeframe',
      field: profile.project.access_dates,
    },
    {
      fieldId: 'compliance.permit_position',
      officialFormSection: 'Permits',
      field: profile.compliance_and_logistics.permit_position,
    },
    {
      fieldId: 'compliance.ethics_position',
      officialFormSection: 'Ethics',
      field: profile.compliance_and_logistics.ethics_position,
    },
    {
      fieldId: 'logistics.transport_arrangements',
      officialFormSection: 'Transport',
      field: profile.compliance_and_logistics.transport_arrangements,
    },
    {
      fieldId: 'logistics.accommodation_arrangements',
      officialFormSection: 'Accommodation',
      field: profile.compliance_and_logistics.accommodation_arrangements,
    },
    {
      fieldId: 'logistics.alc_support',
      officialFormSection: 'ALC logistical support',
      field: profile.compliance_and_logistics.alc_logistical_support,
    },
    {
      fieldId: 'logistics.map_and_location_scope',
      officialFormSection: 'Map and study locations',
      field: profile.compliance_and_logistics.map_and_location_scope,
    },
    {
      fieldId: 'compliance.insurance_position',
      officialFormSection: 'Relevant attachments',
      field: profile.compliance_and_logistics.insurance_position,
    },
  ];
}

export function evaluateAlcSubmissionReadiness(
  profileInput: unknown,
  contactRouteInput: unknown,
) {
  const profile = AlcApplicantProfileSchema.parse(profileInput);
  const contactRoute = AlcContactRouteSchema.parse(contactRouteInput);
  const fields = requiredFields(profile).map((definition) => ({
    fieldId: definition.fieldId,
    officialFormSection: definition.officialFormSection,
    candidatePresent: definition.field.value !== null,
    applicantConfirmed: definition.field.confirmed_by_applicant,
    ready:
      definition.field.value !== null &&
      definition.field.confirmed_by_applicant,
    provenance: definition.field.provenance,
  }));
  const attestations = Object.entries(profile.attestations).map(
    ([attestationId, attestation]) => ({
      attestationId,
      ready: attestation.value && Boolean(attestation.confirmed_at_utc),
      value: attestation.value,
      confirmedAtUtc: attestation.confirmed_at_utc,
      note: attestation.note,
    }),
  );
  const fieldValuesComplete = fields.every((field) => field.candidatePresent);
  const fieldConfirmationsComplete = fields.every(
    (field) => field.applicantConfirmed,
  );
  const documentAttestationIds = new Set([
    'identity_may_be_used_in_application',
    'legal_entity_description_is_accurate',
    'funding_description_is_accurate',
    'methodology_is_approved_by_applicant',
    'privacy_review_complete',
    'application_document_generation_authorized',
  ]);
  const documentAttestationsComplete = attestations
    .filter((attestation) =>
      documentAttestationIds.has(attestation.attestationId),
    )
    .every((attestation) => attestation.ready);
  const applicationDocumentReady =
    fieldValuesComplete &&
    fieldConfirmationsComplete &&
    documentAttestationsComplete;
  const sendAttestation = attestations.find(
    (attestation) =>
      attestation.attestationId === 'external_submission_authorized',
  );
  const route = contactRoute.submission_state;
  const externalSubmissionReady =
    applicationDocumentReady &&
    Boolean(sendAttestation?.ready) &&
    route.current_public_contact_route_identified &&
    route.research_application_pathway_confirmed_with_alc &&
    route.nominated_alc_representative_identified &&
    route.application_channel_confirmed;

  return {
    profileId: profile.profile_id,
    sensitivity: profile.sensitivity,
    fields,
    attestations,
    counts: {
      requiredFields: fields.length,
      candidateValuesPresent: fields.filter((field) => field.candidatePresent)
        .length,
      applicantConfirmedFields: fields.filter(
        (field) => field.applicantConfirmed,
      ).length,
      missingValues: fields.filter((field) => !field.candidatePresent).length,
      unconfirmedFields: fields.filter((field) => !field.applicantConfirmed)
        .length,
      requiredAttestations: attestations.length,
      completedAttestations: attestations.filter(
        (attestation) => attestation.ready,
      ).length,
    },
    missingFieldIds: fields
      .filter((field) => !field.candidatePresent)
      .map((field) => field.fieldId),
    unconfirmedFieldIds: fields
      .filter((field) => !field.applicantConfirmed)
      .map((field) => field.fieldId),
    incompleteAttestationIds: attestations
      .filter((attestation) => !attestation.ready)
      .map((attestation) => attestation.attestationId),
    contactRoute: route,
    applicationDocumentReady,
    externalSubmissionReady,
    permittedAction: externalSubmissionReady
      ? 'render_for_applicant_final_review_only'
      : 'retain_private_intake_and_unsent_draft_only',
  };
}
