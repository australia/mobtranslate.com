import { createHash } from 'node:crypto';
import { z } from 'zod';

const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/u);
const Sha1Base32Schema = z.string().regex(/^[A-Z2-7]{32}$/u);
const KeySchema = z.string().regex(/^[a-z0-9][a-z0-9.-]*$/u);
const ClosedUseSchema = z.object({
  training_use: z.literal('not_allowed'),
  benchmark_use: z.literal('not_allowed'),
  hosted_transfer: z.literal('not_allowed'),
  automatic_linguistic_acceptance: z.literal(false),
});

const ArtifactReferenceSchema = z.object({
  path: z.string().min(1),
  sha256: Sha256Schema,
  media_type: z.string().min(1),
});

const EvidenceSpanSchema = z.object({
  artifact_key: z.string().regex(/^[A-Za-z][A-Za-z0-9]*$/u),
  line_start: z.number().int().positive(),
  line_end: z.number().int().positive(),
  required_substrings: z.array(z.string().min(1)).min(1),
});

const CandidateRecordSchema = ClosedUseSchema.extend({
  record_id: KeySchema,
  source_id: z.string().min(1),
  collection_id: z.string().min(1),
  finding_aid_page: z.number().int().positive(),
  field_recording_number_source: z.string().min(1),
  description_source: z.string().min(1),
  catalog_language_status: z.enum([
    'wajarri',
    'catalog_spelling_wajarra',
    'language_unresolved_within_wajarri_sequence',
    'mixed_wajarri_other_languages',
  ]),
  named_people: z.array(z.string().min(1)),
  content_classes: z.array(KeySchema).min(1),
  duration_seconds: z.number().nonnegative().optional(),
  catalog_grouping_status: z.enum([
    'single_catalog_row',
    'source_range_preserved_as_one_group',
    'collection_level_catalog_record',
  ]),
  catalog_access_notes: z.array(z.string().min(1)).optional(),
  source_bytes_acquired: z.literal(true),
  audio_acquired: z.literal(false),
  transcript_acquired: z.literal(false),
  timing_points_available: z.boolean(),
  rights_status: z.enum([
    'restricted_permission_required',
    'open_listening_copy_permission_required',
    'open_listening_copy_copyright_act_only',
  ]),
  evidence: EvidenceSpanSchema,
});

const RelatedLanguageExclusionSchema = ClosedUseSchema.extend({
  exclusion_id: KeySchema,
  source_id: z.string().min(1),
  collection_id: z.string().min(1),
  excluded_language_source: z.string().min(1),
  exclusion_reason: z.string().min(1),
  included_in_target_candidate_pool: z.literal(false),
  source_bytes_acquired: z.literal(true),
  rights_status: z.literal('restricted_permission_required'),
  evidence: EvidenceSpanSchema,
});

const SourceArtifactBaseSchema = z.object({
  artifact_key: z.string().regex(/^[A-Za-z][A-Za-z0-9]*$/u),
  text_artifact_key: z.string().regex(/^[A-Za-z][A-Za-z0-9]*$/u),
  source_id: z.string().min(1),
  collection_id: z.string().min(1),
  source_role: z.enum(['target_candidate', 'related_language_exclusion']),
  url: z.string().url(),
  physical_pages: z.number().int().positive(),
  pdf: ArtifactReferenceSchema.extend({
    media_type: z.literal('application/pdf'),
  }),
  extracted_text: ArtifactReferenceSchema.extend({
    media_type: z.literal('text/plain'),
  }),
  renderings: z.array(
    ArtifactReferenceSchema.extend({
      media_type: z.literal('image/png'),
      physical_page: z.number().int().positive(),
    }),
  ),
  acquisition_artifacts: z.array(ArtifactReferenceSchema),
});

const WaybackSourceArtifactSchema = SourceArtifactBaseSchema.extend({
  capture_kind: z.literal('wayback_source_pdf').optional(),
  wayback_capture_timestamp: z.string().regex(/^\d{14}$/u),
  payload_sha1_base32: Sha1Base32Schema,
  wayback_cdx_digest: Sha1Base32Schema.nullable(),
  payload_digest_verification: z.enum([
    'wayback_cdx_sha1_base32_exact_match',
    'computed_sha1_only_cdx_unavailable',
  ]),
});

const BrowserCatalogArtifactSchema = SourceArtifactBaseSchema.extend({
  capture_kind: z.literal('browser_rendered_catalog_record'),
  captured_at_utc: z.string().datetime(),
  capture_tool: z.string().min(1),
  catalog_entity_id: z.string().min(1),
});

const SourceArtifactSchema = z.union([
  BrowserCatalogArtifactSchema,
  WaybackSourceArtifactSchema,
]);

const ReportFindingSchema = z.object({
  finding_id: KeySchema,
  classification: KeySchema,
  finding: z.string().min(1),
  linguistic_evidentiary_force: KeySchema,
});

export const ArchivalFindingAidInventoryContractSchema = z
  .object({
    schema_version: z.literal(1),
    inventory_id: KeySchema,
    created_at_utc: z.string().datetime(),
    language: z.object({
      name: z.string().min(1),
      iso_639_3: z.string().length(3),
      glottocode: z.string().min(1),
    }),
    parent_inventory: z.object({
      inventory_id: KeySchema,
      manifest: ArtifactReferenceSchema,
      aiatsis_recording_candidates: ArtifactReferenceSchema.extend({
        rows: z.number().int().nonnegative(),
      }),
      inherited_components: z.record(
        z.string(),
        ArtifactReferenceSchema.extend({
          rows: z.number().int().nonnegative(),
        }),
      ),
    }),
    source_ledger: z.object({
      path: z.string().min(1),
      historical_sha256: Sha256Schema,
      build_scope: z.literal('current_after_verified_prefix').optional(),
    }),
    source_artifacts: z.array(SourceArtifactSchema).min(1),
    candidate_records: z.array(CandidateRecordSchema),
    related_language_exclusions: z.array(RelatedLanguageExclusionSchema),
    expected_counts: z.object({
      parent_candidate_groups: z.number().int().nonnegative(),
      new_candidate_groups: z.number().int().nonnegative(),
      cumulative_candidate_groups: z.number().int().nonnegative(),
      target_candidate_sources: z.number().int().nonnegative(),
      related_language_exclusion_sources: z.number().int().nonnegative(),
      related_language_exclusions: z.number().int().nonnegative(),
      catalog_explicit_target_groups: z.number().int().nonnegative(),
      catalog_spelling_variant_groups: z.number().int().nonnegative(),
      language_unresolved_groups: z.number().int().nonnegative(),
      mixed_wajarri_other_language_groups: z
        .number()
        .int()
        .nonnegative()
        .optional(),
      candidate_groups_with_duration: z.number().int().nonnegative(),
      accepted_linguistic_rows: z.literal(0),
      training_eligible_rows: z.literal(0),
      benchmark_eligible_rows: z.literal(0),
    }),
    report_findings: z.array(ReportFindingSchema).min(1).optional(),
    release_status: z.literal('not_released'),
    claim_limit: z.string().min(1),
  })
  .superRefine((value, context) => {
    const sourceKeys = new Set<string>();
    const sourceIds = new Set<string>();
    for (const source of value.source_artifacts) {
      if (sourceKeys.has(source.artifact_key))
        context.addIssue({
          code: 'custom',
          path: ['source_artifacts'],
          message: `duplicate source artifact key: ${source.artifact_key}`,
        });
      sourceKeys.add(source.artifact_key);
      sourceKeys.add(source.text_artifact_key);
      if (sourceIds.has(source.source_id))
        context.addIssue({
          code: 'custom',
          path: ['source_artifacts'],
          message: `duplicate source id: ${source.source_id}`,
        });
      sourceIds.add(source.source_id);
      if (
        'payload_digest_verification' in source &&
        source.payload_digest_verification ===
          'wayback_cdx_sha1_base32_exact_match' &&
        source.wayback_cdx_digest === null
      )
        context.addIssue({
          code: 'custom',
          path: ['source_artifacts'],
          message: `${source.source_id} declares a digest match without a CDX digest`,
        });
    }

    const recordIds = new Set<string>();
    for (const record of value.candidate_records) {
      if (recordIds.has(record.record_id))
        context.addIssue({
          code: 'custom',
          path: ['candidate_records'],
          message: `duplicate record id: ${record.record_id}`,
        });
      recordIds.add(record.record_id);
      const source = value.source_artifacts.find(
        (item) => item.source_id === record.source_id,
      );
      if (!source || source.source_role !== 'target_candidate')
        context.addIssue({
          code: 'custom',
          path: ['candidate_records'],
          message: `candidate ${record.record_id} lacks a target-candidate source`,
        });
      if (source && source.collection_id !== record.collection_id)
        context.addIssue({
          code: 'custom',
          path: ['candidate_records'],
          message: `collection mismatch for ${record.record_id}`,
        });
      if (!sourceKeys.has(record.evidence.artifact_key))
        context.addIssue({
          code: 'custom',
          path: ['candidate_records'],
          message: `unknown evidence artifact for ${record.record_id}`,
        });
    }

    const exclusionIds = new Set<string>();
    for (const exclusion of value.related_language_exclusions) {
      if (exclusionIds.has(exclusion.exclusion_id))
        context.addIssue({
          code: 'custom',
          path: ['related_language_exclusions'],
          message: `duplicate exclusion id: ${exclusion.exclusion_id}`,
        });
      exclusionIds.add(exclusion.exclusion_id);
      const source = value.source_artifacts.find(
        (item) => item.source_id === exclusion.source_id,
      );
      if (!source || source.source_role !== 'related_language_exclusion')
        context.addIssue({
          code: 'custom',
          path: ['related_language_exclusions'],
          message: `exclusion ${exclusion.exclusion_id} lacks an exclusion source`,
        });
      if (source && source.collection_id !== exclusion.collection_id)
        context.addIssue({
          code: 'custom',
          path: ['related_language_exclusions'],
          message: `collection mismatch for ${exclusion.exclusion_id}`,
        });
      if (!sourceKeys.has(exclusion.evidence.artifact_key))
        context.addIssue({
          code: 'custom',
          path: ['related_language_exclusions'],
          message: `unknown evidence artifact for ${exclusion.exclusion_id}`,
        });
    }
  });

export type ArchivalFindingAidInventoryContract = z.infer<
  typeof ArchivalFindingAidInventoryContractSchema
>;

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function lineSpan(text: string, start: number, end: number): string {
  if (end < start) throw new Error(`invalid evidence span ${start}-${end}`);
  const lines = text.split('\n');
  if (start < 1 || end > lines.length)
    throw new Error(
      `evidence span ${start}-${end} exceeds ${lines.length} lines`,
    );
  return lines.slice(start - 1, end).join('\n');
}

function closedRows(rows: Array<Record<string, unknown>>, label: string): void {
  for (const [index, row] of rows.entries()) {
    if (
      row.training_use !== 'not_allowed' ||
      row.benchmark_use !== 'not_allowed' ||
      row.hosted_transfer !== 'not_allowed'
    )
      throw new Error(`${label} row ${index + 1} is not closed to model use`);
  }
}

function evidenceAnchor(
  recordId: string,
  evidence: z.infer<typeof EvidenceSpanSchema>,
  sourceTexts: Map<string, string>,
): Record<string, unknown> {
  const text = sourceTexts.get(evidence.artifact_key);
  if (!text) throw new Error(`missing source text ${evidence.artifact_key}`);
  const sourceSpan = lineSpan(text, evidence.line_start, evidence.line_end);
  for (const required of evidence.required_substrings)
    if (!sourceSpan.includes(required))
      throw new Error(
        `${recordId} evidence lacks required substring: ${required}`,
      );
  return {
    artifactKey: evidence.artifact_key,
    lineStart: evidence.line_start,
    lineEnd: evidence.line_end,
    sourceSpan,
    sourceSpanSha256: sha256(sourceSpan),
  };
}

export function buildArchivalFindingAidInventory({
  contractValue,
  parentCandidateRows,
  parentManifestValue,
  sourceLedgerRows,
  sourceTexts,
}: {
  contractValue: unknown;
  parentCandidateRows: Array<Record<string, unknown>>;
  parentManifestValue: Record<string, unknown>;
  sourceLedgerRows: Array<Record<string, unknown>>;
  sourceTexts: Map<string, string>;
}): {
  components: {
    aiatsisRecordingCandidates: Array<Record<string, unknown>>;
    relatedLanguageExclusions: Array<Record<string, unknown>>;
    sourceArtifactVerification: Array<Record<string, unknown>>;
  };
  validation: Record<string, number | boolean>;
} {
  const contract =
    ArchivalFindingAidInventoryContractSchema.parse(contractValue);
  if (
    parentManifestValue.inventory_id !== contract.parent_inventory.inventory_id
  )
    throw new Error('parent inventory identity mismatch');
  if (
    parentCandidateRows.length !==
      contract.parent_inventory.aiatsis_recording_candidates.rows ||
    parentCandidateRows.length !==
      contract.expected_counts.parent_candidate_groups
  )
    throw new Error('parent candidate row count mismatch');
  closedRows(parentCandidateRows, 'parent candidate');

  const sourceLedger = new Map(
    sourceLedgerRows.map((row) => [String(row.source_id), row]),
  );
  for (const source of contract.source_artifacts) {
    const ledger = sourceLedger.get(source.source_id);
    if (!ledger) throw new Error(`source ledger lacks ${source.source_id}`);
    if (
      ledger.local_path !== source.pdf.path ||
      ledger.sha256 !== source.pdf.sha256
    )
      throw new Error(
        `source ledger artifact mismatch for ${source.source_id}`,
      );
    for (const field of [
      'training_use',
      'redistribution',
      'derived_weights',
      'hosted_transfer',
    ])
      if (ledger[field] !== 'not_allowed')
        throw new Error(`${source.source_id} ledger ${field} is not blocked`);
  }

  const newRows = contract.candidate_records.map((record) => {
    const { evidence, ...rest } = record;
    return {
      ...rest,
      evidence_anchor: evidenceAnchor(record.record_id, evidence, sourceTexts),
    };
  });
  const exclusions = contract.related_language_exclusions.map((record) => {
    const { evidence, ...rest } = record;
    return {
      ...rest,
      evidence_anchor: evidenceAnchor(
        record.exclusion_id,
        evidence,
        sourceTexts,
      ),
    };
  });
  const cumulative = [...parentCandidateRows, ...newRows];
  const cumulativeIds = new Set(cumulative.map((row) => String(row.record_id)));
  if (cumulativeIds.size !== cumulative.length)
    throw new Error('cumulative candidate inventory has duplicate record IDs');
  closedRows(cumulative, 'cumulative candidate');
  closedRows(exclusions, 'related-language exclusion');

  const baseCounts = {
    newCandidateGroups: newRows.length,
    cumulativeCandidateGroups: cumulative.length,
    targetCandidateSources: contract.source_artifacts.filter(
      (source) => source.source_role === 'target_candidate',
    ).length,
    relatedLanguageExclusionSources: contract.source_artifacts.filter(
      (source) => source.source_role === 'related_language_exclusion',
    ).length,
    relatedLanguageExclusions: exclusions.length,
    catalogExplicitTargetGroups: newRows.filter(
      (row) => row.catalog_language_status === 'wajarri',
    ).length,
    catalogSpellingVariantGroups: newRows.filter(
      (row) => row.catalog_language_status === 'catalog_spelling_wajarra',
    ).length,
    languageUnresolvedGroups: newRows.filter(
      (row) =>
        row.catalog_language_status ===
        'language_unresolved_within_wajarri_sequence',
    ).length,
    candidateGroupsWithDuration: newRows.filter(
      (row) => row.duration_seconds !== undefined,
    ).length,
  };
  const expected = contract.expected_counts;
  const counts =
    expected.mixed_wajarri_other_language_groups === undefined
      ? baseCounts
      : {
          ...baseCounts,
          mixedWajarriOtherLanguageGroups: newRows.filter(
            (row) =>
              row.catalog_language_status === 'mixed_wajarri_other_languages',
          ).length,
        };
  const comparisons: Array<[number, number, string]> = [
    [counts.newCandidateGroups, expected.new_candidate_groups, 'new groups'],
    [
      counts.cumulativeCandidateGroups,
      expected.cumulative_candidate_groups,
      'cumulative groups',
    ],
    [
      counts.targetCandidateSources,
      expected.target_candidate_sources,
      'target sources',
    ],
    [
      counts.relatedLanguageExclusionSources,
      expected.related_language_exclusion_sources,
      'exclusion sources',
    ],
    [
      counts.relatedLanguageExclusions,
      expected.related_language_exclusions,
      'exclusions',
    ],
    [
      counts.catalogExplicitTargetGroups,
      expected.catalog_explicit_target_groups,
      'explicit target groups',
    ],
    [
      counts.catalogSpellingVariantGroups,
      expected.catalog_spelling_variant_groups,
      'spelling-variant groups',
    ],
    [
      counts.languageUnresolvedGroups,
      expected.language_unresolved_groups,
      'language-unresolved groups',
    ],
    [
      counts.candidateGroupsWithDuration,
      expected.candidate_groups_with_duration,
      'groups with duration',
    ],
  ];
  for (const [actual, wanted, label] of comparisons)
    if (actual !== wanted)
      throw new Error(`${label} mismatch: ${actual} != ${wanted}`);
  if (
    expected.mixed_wajarri_other_language_groups !== undefined &&
    'mixedWajarriOtherLanguageGroups' in counts &&
    counts.mixedWajarriOtherLanguageGroups !==
      expected.mixed_wajarri_other_language_groups
  )
    throw new Error(
      `mixed-language groups mismatch: ${counts.mixedWajarriOtherLanguageGroups} != ${expected.mixed_wajarri_other_language_groups}`,
    );

  const sourceArtifactVerification = contract.source_artifacts.map((source) =>
    source.capture_kind === 'browser_rendered_catalog_record'
      ? {
          source_id: source.source_id,
          collection_id: source.collection_id,
          source_role: source.source_role,
          capture_kind: source.capture_kind,
          captured_at_utc: source.captured_at_utc,
          capture_tool: source.capture_tool,
          catalog_entity_id: source.catalog_entity_id,
          pdf_path: source.pdf.path,
          pdf_sha256: source.pdf.sha256,
          physical_pages: source.physical_pages,
          catalog_record_capture_acquired: true,
          described_audio_acquired: false,
          training_use: 'not_allowed',
          benchmark_use: 'not_allowed',
          hosted_transfer: 'not_allowed',
        }
      : {
          source_id: source.source_id,
          collection_id: source.collection_id,
          source_role: source.source_role,
          pdf_path: source.pdf.path,
          pdf_sha256: source.pdf.sha256,
          physical_pages: source.physical_pages,
          payload_sha1_base32: source.payload_sha1_base32,
          wayback_cdx_digest: source.wayback_cdx_digest,
          payload_digest_verification: source.payload_digest_verification,
          source_bytes_acquired: true,
          audio_acquired: false,
          training_use: 'not_allowed',
          benchmark_use: 'not_allowed',
          hosted_transfer: 'not_allowed',
        },
  );

  return {
    components: {
      aiatsisRecordingCandidates: cumulative,
      relatedLanguageExclusions: exclusions,
      sourceArtifactVerification,
    },
    validation: {
      parentCandidateGroups: parentCandidateRows.length,
      ...counts,
      sourceArtifacts: sourceArtifactVerification.length,
      acceptedLinguisticRows: 0,
      trainingEligibleRows: 0,
      benchmarkEligibleRows: 0,
      hostedTransferEligibleRows: 0,
      automaticLinguisticAcceptanceRows: 0,
    },
  };
}
