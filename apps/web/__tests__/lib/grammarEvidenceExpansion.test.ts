import {
  buildGrammarEvidenceExpansion,
  type GrammarEvidenceExpansionContract,
} from '@/lib/research/grammarEvidenceExpansion';

const component = (path: string, rows: number) => ({
  path,
  sha256: '1'.repeat(64),
  rows,
});

function fixtureContract(): GrammarEvidenceExpansionContract {
  return {
    schema_version: 1,
    edition_id: 'fixture-grammar-v0.4.0',
    parent_edition_id: 'fixture-grammar-v0.3.0',
    created_at_utc: '2026-07-22T00:00:00.000Z',
    status: 'source_evidence_expansion',
    scope: {
      language: 'Fixture',
      iso_639_3: 'fix',
      glottocode: 'fixt1234',
      variety: 'fixture',
      orthography: 'source preserving',
    },
    parent_edition: {
      manifest_path: 'grammar/parent/EDITION.json',
      manifest_sha256: '2'.repeat(64),
    },
    evidence_inventory: {
      inventory_id: 'fixture-inventory-v0.1.0',
      manifest_path: 'analysis/inventory/MANIFEST.json',
      manifest_sha256: '3'.repeat(64),
      required_component_keys: [
        'tableBlocks',
        'morphotacticStatements',
        'numberedExamples',
        'curatedExamples',
      ],
    },
    catalog_artifacts: [
      {
        evidence_key: 'catalogRecord',
        source_id: 'src-catalog',
        path: 'sources/catalog.pdf',
        sha256: '4'.repeat(64),
        evidence_role: 'Catalogue evidence only.',
        training_use: 'not_allowed',
      },
    ],
    source_ledger: {
      path: 'sources/SOURCE-LEDGER.jsonl',
      sha256: '5'.repeat(64),
    },
    change_ledger: {
      path: 'grammar/CHANGE-LEDGER.jsonl',
      sha256: '6'.repeat(64),
      issuing_change_id: 'fixture-change-0001',
      accepted_change_ids: [],
    },
    current_pointer_path: 'grammar/CURRENT.json',
    supersedes_pointer_sha256: '7'.repeat(64),
    review_items: [
      {
        review_key: 'review-new-evidence',
        question: 'What does the evidence support?',
        evidence_component_keys: ['tableBlocks', 'catalogRecord'],
        evidence_required: ['Independent review.'],
        priority: 'critical',
      },
    ],
    release_status: 'not_released',
  };
}

function fixtureInput() {
  const contract = fixtureContract();
  const parentManifestValue = {
    edition_id: contract.parent_edition_id,
    components: {
      assertions: component('parent/assertions.jsonl', 4),
      syntheses: component('parent/syntheses.jsonl', 3),
      conflicts: component('parent/conflicts.jsonl', 1),
      reviewQueue: component('parent/review.jsonl', 1),
    },
    counts: {
      accepted_for_analysis_syntheses: 2,
      unresolved_conflicts: 1,
      training_eligible_rows: 0,
    },
  };
  const inventoryManifestValue = {
    inventory_id: contract.evidence_inventory.inventory_id,
    components: Object.fromEntries(
      contract.evidence_inventory.required_component_keys.map((key) => [
        key,
        component(`inventory/${key}.jsonl`, 1),
      ]),
    ),
    validation: {
      numbered_examples: 3,
      numbered_example_occurrences: 4,
      table_blocks: 1,
      morphotactic_statements: 1,
      curated_examples: 1,
      silent_ocr_corrections: 0,
      accepted_rows: 0,
      training_eligible_rows: 0,
    },
  };
  const inventoryRowsByComponent = new Map(
    contract.evidence_inventory.required_component_keys.map((key) => [
      key,
      [
        {
          acceptanceStatus: 'not_accepted',
          trainingEligibility: 'not_allowed',
        },
      ],
    ]),
  );
  return {
    contractValue: contract,
    parentManifestValue,
    inventoryManifestValue,
    parentReviewRows: [
      {
        reviewKey: 'inherited-review',
        status: 'pending',
      },
    ],
    inventoryRowsByComponent,
    changeLedgerRows: [
      {
        change_id: contract.change_ledger.issuing_change_id,
        new_edition_id: contract.edition_id,
        parent_edition_id: contract.parent_edition_id,
      },
    ],
  };
}

describe('grammar evidence expansion', () => {
  it('inherits accepted analysis while adding only closed evidence and review rows', () => {
    const result = buildGrammarEvidenceExpansion(fixtureInput());

    expect(result.reviewQueue).toHaveLength(2);
    expect(result.evidenceComponents).toHaveLength(5);
    expect(result.counts).toMatchObject({
      acceptedForAnalysisSyntheses: 2,
      unresolvedConflicts: 1,
      newAcceptedRows: 0,
      trainingEligibleRows: 0,
    });
    expect(result.evidenceComponents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          evidenceComponentKey: 'catalogRecord',
          acceptanceStatus: 'catalog_evidence_only',
          trainingEligibility: 'not_allowed',
        }),
      ]),
    );
  });

  it('fails closed if any inventory row becomes training eligible', () => {
    const input = fixtureInput();
    input.inventoryRowsByComponent.set('tableBlocks', [
      {
        acceptanceStatus: 'not_accepted',
        trainingEligibility: 'allowed',
      },
    ]);

    expect(() => buildGrammarEvidenceExpansion(input)).toThrow(
      'row 1 is training eligible',
    );
  });

  it('requires an append-only issuing change that names the exact lineage', () => {
    const input = fixtureInput();
    input.changeLedgerRows = [];

    expect(() => buildGrammarEvidenceExpansion(input)).toThrow(
      'issuing change is absent',
    );
  });

  it('does not permit a new review item to overwrite an inherited key', () => {
    const input = fixtureInput();
    const contract = input.contractValue;
    contract.review_items[0]!.review_key = 'inherited-review';

    expect(() => buildGrammarEvidenceExpansion(input)).toThrow(
      'new review keys already exist',
    );
  });
});
