import { buildEvidenceOnlyEdition } from '@/lib/research/evidenceOnlyEdition';

const hash = 'b'.repeat(64);
const closed = {
  acceptanceStatus: 'not_accepted',
  trainingEligibility: 'not_allowed',
  benchmarkEligibility: 'not_allowed',
  syntheticEligibility: 'not_allowed',
};

function fixture() {
  const parentManifestValue = {
    edition_id: 'grammar-parent-v1',
    components: {
      assertions: { path: 'assertions.jsonl', sha256: hash, rows: 1 },
      conflicts: { path: 'conflicts.jsonl', sha256: hash, rows: 0 },
      reviewQueue: { path: 'reviews.jsonl', sha256: hash, rows: 1 },
      evidenceComponents: {
        path: 'evidence-components.jsonl',
        sha256: hash,
        rows: 1,
      },
    },
  };
  const inventoryManifestValue = {
    inventory_id: 'scholarly-inventory-v1',
    components: {
      grammarAssertions: {
        path: 'new-assertions.jsonl',
        sha256: hash,
        rows: 1,
      },
      grammarExamples: {
        path: 'new-examples.jsonl',
        sha256: hash,
        rows: 1,
      },
    },
  };
  const contractValue = {
    schema_version: 1,
    artifact: 'grammar',
    edition_id: 'grammar-child-v2',
    parent_edition_id: 'grammar-parent-v1',
    created_at_utc: '2026-07-23T00:00:00.000Z',
    status: 'scholarly_source_evidence_expansion',
    scope: {
      language: 'Wajarri',
      iso_639_3: 'wbv',
      glottocode: 'waja1257',
      variety: 'source scope',
      orthography: 'source preserving',
    },
    parent_manifest: { path: 'parent.json', sha256: hash },
    evidence_inventory: {
      inventory_id: 'scholarly-inventory-v1',
      manifest_path: 'inventory.json',
      manifest_sha256: hash,
      component_bindings: [
        {
          inventory_component_key: 'grammarAssertions',
          edition_component_key: 'scholarlyAssertions',
          evidence_kind: 'scholarly_source_assertions',
        },
        {
          inventory_component_key: 'grammarExamples',
          edition_component_key: 'scholarlyExamples',
          evidence_kind: 'scholarly_source_examples',
        },
      ],
    },
    source_ledger: { path: 'sources.jsonl', sha256: hash },
    change_ledger: {
      path: 'changes.jsonl',
      sha256: hash,
      issuing_change_id: 'change-2',
      accepted_change_ids: [],
    },
    component_appends: [
      {
        parent_component_key: 'assertions',
        inventory_component_key: 'grammarAssertions',
        output_filename: 'source-assertions.jsonl',
        id_field: 'assertionId',
      },
    ],
    review_items: [
      {
        review_key: 'bound-pronoun-conflict',
        question: 'Which form is current and under what conditions?',
        evidence_component_keys: ['scholarlyAssertions'],
        evidence_record_ids: ['new-assertion-record'],
        evidence_required: ['Independent current speaker evidence'],
        priority: 'critical',
      },
    ],
    expected_counts: {
      parent_components: 4,
      inventory_components: 2,
      component_appends: 1,
      inherited_review_items: 1,
      added_review_items: 1,
      added_evidence_rows: 2,
    },
    current_pointer_path: 'grammar/CURRENT.json',
    supersedes_pointer_sha256: hash,
    release_status: 'not_released',
    evidence_policy: { acceptance: 'No row is accepted.' },
    claim_limit: 'No model or linguistic authorization.',
  };
  const parentRowsByComponent = new Map<
    string,
    Array<Record<string, unknown>>
  >([
    ['assertions', [{ assertionId: 'old-assertion' }]],
    ['conflicts', []],
    [
      'reviewQueue',
      [{ reviewItemId: 'old-review', reviewKey: 'old-review-key' }],
    ],
    [
      'evidenceComponents',
      [{ evidenceComponentKey: 'oldEvidence' }],
    ],
  ]);
  const inventoryRowsByComponent = new Map<
    string,
    Array<Record<string, unknown>>
  >([
    [
      'grammarAssertions',
      [
        {
          ...closed,
          recordId: 'new-assertion-record',
          assertionId: 'new-assertion',
        },
      ],
    ],
    [
      'grammarExamples',
      [{ ...closed, recordId: 'new-example-record' }],
    ],
  ]);
  return {
    contractValue,
    parentManifestValue,
    inventoryManifestValue,
    parentRowsByComponent,
    inventoryRowsByComponent,
    changeLedgerRows: [
      {
        change_id: 'change-2',
        parent_edition_id: 'grammar-parent-v1',
        new_edition_id: 'grammar-child-v2',
        accepted: false,
      },
    ],
  };
}

describe('evidence-only living edition', () => {
  it('appends selected evidence while aliasing unchanged parent components', () => {
    const result = buildEvidenceOnlyEdition(fixture());

    expect(result.generatedRows.get('assertions')).toHaveLength(2);
    expect(result.reviewQueue).toHaveLength(2);
    expect(result.evidenceComponents).toHaveLength(3);
    expect(result.components.conflicts.path).toBe('conflicts.jsonl');
    expect(result.components.scholarlyExamples.path).toBe(
      'new-examples.jsonl',
    );
    expect(result.counts).toMatchObject({
      addedReviewItems: 1,
      addedEvidenceComponents: 2,
      addedEvidenceRows: 2,
      newAcceptedRows: 0,
      trainingEligibleRows: 0,
    });
  });

  it('preserves a legacy review queue identified only by reviewItemId', () => {
    const input = fixture();
    delete input.parentRowsByComponent.get('reviewQueue')![0].reviewKey;

    const result = buildEvidenceOnlyEdition(input);

    expect(result.reviewQueue).toHaveLength(2);
    expect(result.reviewQueue[0]).toEqual({ reviewItemId: 'old-review' });
  });

  it('rejects an append that would duplicate an immutable record ID', () => {
    const input = fixture();
    input.inventoryRowsByComponent.get('grammarAssertions')![0].assertionId =
      'old-assertion';

    expect(() => buildEvidenceOnlyEdition(input)).toThrow(
      'duplicate assertions assertionId',
    );
  });

  it('rejects evidence rows that are not closed to model use', () => {
    const input = fixture();
    input.inventoryRowsByComponent.get('grammarExamples')![0]
      .trainingEligibility = 'allowed';

    expect(() => buildEvidenceOnlyEdition(input)).toThrow(
      'is not closed evidence',
    );
  });
});
