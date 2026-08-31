import { buildArchivalFindingAidInventory } from '@/lib/research/archivalFindingAidInventory';

const hash = 'a'.repeat(64);
const sourceId = 'src-wbv-test-finding-aid';
const exclusionSourceId = 'src-related-test-finding-aid';

function source(
  id: string,
  role: 'target_candidate' | 'related_language_exclusion',
  captureKind: 'wayback' | 'browser' = 'wayback',
) {
  const common = {
    artifact_key: `${role === 'target_candidate' ? 'target' : 'excluded'}Pdf`,
    text_artifact_key: `${role === 'target_candidate' ? 'target' : 'excluded'}Text`,
    source_id: id,
    collection_id:
      role === 'target_candidate' ? 'COLLECTION-1' : 'COLLECTION-2',
    source_role: role,
    url: 'https://example.test/finding-aid.pdf',
    physical_pages: 2,
    pdf: {
      path: `${id}.pdf`,
      sha256: hash,
      media_type: 'application/pdf' as const,
    },
    extracted_text: {
      path: `${id}.txt`,
      sha256: hash,
      media_type: 'text/plain' as const,
    },
    renderings: [],
    acquisition_artifacts: [],
  };
  return captureKind === 'browser'
    ? {
        ...common,
        capture_kind: 'browser_rendered_catalog_record' as const,
        captured_at_utc: '2026-07-23T00:00:00.000Z',
        capture_tool: 'agent-browser Chromium print-to-PDF',
        catalog_entity_id: 'SD_ILS:1',
      }
    : {
        ...common,
        wayback_capture_timestamp: '20260723000000',
        payload_sha1_base32: 'A'.repeat(32),
        wayback_cdx_digest: 'A'.repeat(32),
        payload_digest_verification:
          'wayback_cdx_sha1_base32_exact_match' as const,
      };
}

function fixture() {
  const closed = {
    training_use: 'not_allowed' as const,
    benchmark_use: 'not_allowed' as const,
    hosted_transfer: 'not_allowed' as const,
    automatic_linguistic_acceptance: false as const,
  };
  return {
    contractValue: {
      schema_version: 1,
      inventory_id: 'test-finding-aid-inventory-v0.2.0',
      created_at_utc: '2026-07-23T00:00:00.000Z',
      language: { name: 'Test', iso_639_3: 'tst', glottocode: 'test1234' },
      parent_inventory: {
        inventory_id: 'test-finding-aid-inventory-v0.1.0',
        manifest: {
          path: 'parent.json',
          sha256: hash,
          media_type: 'application/json',
        },
        aiatsis_recording_candidates: {
          path: 'parent.jsonl',
          sha256: hash,
          media_type: 'application/x-ndjson',
          rows: 1,
        },
        inherited_components: {},
      },
      source_ledger: { path: 'sources.jsonl', historical_sha256: hash },
      source_artifacts: [
        source(sourceId, 'target_candidate'),
        source(exclusionSourceId, 'related_language_exclusion'),
      ],
      candidate_records: [
        {
          ...closed,
          record_id: 'candidate-1',
          source_id: sourceId,
          collection_id: 'COLLECTION-1',
          finding_aid_page: 2,
          field_recording_number_source: '01 WAJ',
          description_source: 'Wajarri narrative with Speaker',
          catalog_language_status: 'wajarri' as const,
          named_people: ['Speaker'],
          content_classes: ['narrative'],
          duration_seconds: 10,
          catalog_grouping_status: 'single_catalog_row' as const,
          source_bytes_acquired: true as const,
          audio_acquired: false as const,
          transcript_acquired: false as const,
          timing_points_available: true,
          rights_status: 'restricted_permission_required' as const,
          evidence: {
            artifact_key: 'targetText',
            line_start: 2,
            line_end: 2,
            required_substrings: ['Wajarri narrative'],
          },
        },
      ],
      related_language_exclusions: [
        {
          ...closed,
          exclusion_id: 'exclusion-1',
          source_id: exclusionSourceId,
          collection_id: 'COLLECTION-2',
          excluded_language_source: 'Related Language',
          exclusion_reason: 'The source explicitly names another language.',
          included_in_target_candidate_pool: false as const,
          source_bytes_acquired: true as const,
          rights_status: 'restricted_permission_required' as const,
          evidence: {
            artifact_key: 'excludedText',
            line_start: 2,
            line_end: 2,
            required_substrings: ['Related Language'],
          },
        },
      ],
      expected_counts: {
        parent_candidate_groups: 1,
        new_candidate_groups: 1,
        cumulative_candidate_groups: 2,
        target_candidate_sources: 1,
        related_language_exclusion_sources: 1,
        related_language_exclusions: 1,
        catalog_explicit_target_groups: 1,
        catalog_spelling_variant_groups: 0,
        language_unresolved_groups: 0,
        candidate_groups_with_duration: 1,
        accepted_linguistic_rows: 0 as const,
        training_eligible_rows: 0 as const,
        benchmark_eligible_rows: 0 as const,
      },
      release_status: 'not_released' as const,
      claim_limit: 'Catalog evidence only.',
    },
    parentCandidateRows: [
      {
        record_id: 'parent-1',
        training_use: 'not_allowed',
        benchmark_use: 'not_allowed',
        hosted_transfer: 'not_allowed',
      },
    ],
    parentManifestValue: { inventory_id: 'test-finding-aid-inventory-v0.1.0' },
    sourceLedgerRows: [sourceId, exclusionSourceId].map((id) => ({
      source_id: id,
      local_path: `${id}.pdf`,
      sha256: hash,
      training_use: 'not_allowed',
      redistribution: 'not_allowed',
      derived_weights: 'not_allowed',
      hosted_transfer: 'not_allowed',
    })),
    sourceTexts: new Map([
      ['targetText', 'heading\nWajarri narrative with Speaker\n'],
      ['excludedText', 'heading\nRelated Language elicitation\n'],
    ]),
  };
}

describe('archival finding-aid inventory', () => {
  it('extends a closed parent inventory with anchored catalog groups and exclusions', () => {
    const result = buildArchivalFindingAidInventory(fixture());

    expect(result.validation).toEqual(
      expect.objectContaining({
        parentCandidateGroups: 1,
        newCandidateGroups: 1,
        cumulativeCandidateGroups: 2,
        relatedLanguageExclusions: 1,
        acceptedLinguisticRows: 0,
        trainingEligibleRows: 0,
      }),
    );
    expect(result.components.aiatsisRecordingCandidates[1]).toEqual(
      expect.objectContaining({
        record_id: 'candidate-1',
        timing_points_available: true,
        evidence_anchor: expect.objectContaining({
          sourceSpan: 'Wajarri narrative with Speaker',
        }),
      }),
    );
  });

  it('rejects a catalog row whose declared evidence text is absent', () => {
    const input = fixture();
    input.contractValue.candidate_records[0].evidence.required_substrings = [
      'not in source',
    ];

    expect(() => buildArchivalFindingAidInventory(input)).toThrow(
      'evidence lacks required substring',
    );
  });

  it('rejects inherited rows that are open to training', () => {
    const input = fixture();
    input.parentCandidateRows[0].training_use = 'allowed';

    expect(() => buildArchivalFindingAidInventory(input)).toThrow(
      'is not closed to model use',
    );
  });

  it('distinguishes browser-rendered catalog records and counts mixed-language groups', () => {
    const input = fixture();
    input.contractValue.source_artifacts[0] = source(
      sourceId,
      'target_candidate',
      'browser',
    );
    input.contractValue.candidate_records[0].catalog_language_status =
      'mixed_wajarri_other_languages';
    input.contractValue.candidate_records[0].catalog_grouping_status =
      'collection_level_catalog_record';
    input.contractValue.candidate_records[0].rights_status =
      'open_listening_copy_permission_required';
    input.contractValue.expected_counts.catalog_explicit_target_groups = 0;
    Object.assign(input.contractValue.expected_counts, {
      mixed_wajarri_other_language_groups: 1,
    });

    const result = buildArchivalFindingAidInventory(input);

    expect(result.validation).toEqual(
      expect.objectContaining({ mixedWajarriOtherLanguageGroups: 1 }),
    );
    expect(result.components.sourceArtifactVerification[0]).toEqual(
      expect.objectContaining({
        capture_kind: 'browser_rendered_catalog_record',
        catalog_record_capture_acquired: true,
        described_audio_acquired: false,
      }),
    );
  });
});
