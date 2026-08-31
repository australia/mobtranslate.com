// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  buildEvidenceGapRequirementsEdition,
  type EvidenceGapRequirementsContract,
} from '@/lib/research/evidenceGapRequirementsEdition';

function fixture() {
  const contract: EvidenceGapRequirementsContract = {
    schema_version: 1,
    requirements_edition_id: 'fixture-requirements-v0.2.0',
    parent_requirements_edition_id: 'fixture-requirements-v0.1.0',
    created_at_utc: '2026-07-22T09:00:00.000Z',
    language: { name: 'Fixture', iso_639_3: 'fix', glottocode: 'fixt1234' },
    parent: {
      manifest_path: 'analysis/parent/MANIFEST.json',
      manifest_sha256: 'a'.repeat(64),
      requirements_path: 'analysis/parent/requirements.jsonl',
      requirements_sha256: 'b'.repeat(64),
      requirements_rows: 1,
    },
    bound_inputs: {
      dictionary: {
        edition_id: 'dictionary-v0.2.0',
        manifest_path: 'dictionary/v0.2.0.json',
        manifest_sha256: 'c'.repeat(64),
      },
      grammar: {
        edition_id: 'grammar-v0.2.0',
        manifest_path: 'grammar/v0.2.0.json',
        manifest_sha256: 'd'.repeat(64),
      },
      contemporary_inventory: {
        inventory_id: 'inventory-v0.1.0',
        manifest_path: 'inventory/v0.1.0.json',
        manifest_sha256: 'e'.repeat(64),
      },
    },
    expected_parent_bindings: {
      dictionary_edition_id: 'dictionary-v0.1.0',
      dictionary_manifest_sha256: 'f'.repeat(64),
      grammar_edition_id: 'grammar-v0.1.0',
      grammar_manifest_sha256: '1'.repeat(64),
    },
    amendments: [
      {
        requirement_id: 'fixture.requirement',
        add_component_keys: ['discourseClusters'],
        replace_blockers: ['One unresolved source cluster exists.'],
      },
    ],
    expected_counts: {
      requirements: 1,
      critical: 1,
      high: 0,
      blocked_direct_conflict: 0,
      blocked_evidence_review: 0,
      blocked_human_review: 0,
      blocked_natural_data: 1,
      closed: 0,
    },
    count_policy: 'Measured gaps only.',
    claim_limit: 'Requirements only.',
    release_status: 'not_released',
  };
  return {
    contractValue: contract,
    parentManifestValue: {
      requirements_edition_id: contract.parent_requirements_edition_id,
    },
    parentRequirementRows: [
      {
        schemaVersion: 1,
        requirementId: 'fixture.requirement',
        capability: 'sentence_translation',
        evidenceBasis: {
          dictionaryEditionId:
            contract.expected_parent_bindings.dictionary_edition_id,
          dictionaryManifestSha256:
            contract.expected_parent_bindings.dictionary_manifest_sha256,
          grammarEditionId:
            contract.expected_parent_bindings.grammar_edition_id,
          grammarManifestSha256:
            contract.expected_parent_bindings.grammar_manifest_sha256,
          componentKeys: ['historicalExamples'],
        },
        blockers: ['No source cluster exists.'],
        status: 'blocked_natural_data',
        priority: 'critical',
      },
    ],
    dictionaryManifestValue: {
      edition_id: contract.bound_inputs.dictionary.edition_id,
      counts: { trainingEligibleRows: 0 },
    },
    grammarManifestValue: {
      edition_id: contract.bound_inputs.grammar.edition_id,
      counts: { trainingEligibleRows: 0 },
    },
    inventoryManifestValue: {
      inventory_id: contract.bound_inputs.contemporary_inventory.inventory_id,
      validation: { accepted_rows: 0, training_eligible_rows: 0 },
    },
  };
}

describe('evidence-gap requirements edition', () => {
  it('rebinds every row and applies only explicit blocker amendments', () => {
    const result = buildEvidenceGapRequirementsEdition(fixture());
    expect(result.requirements[0]).toMatchObject({
      requirementsEditionId: 'fixture-requirements-v0.2.0',
      blockers: ['One unresolved source cluster exists.'],
      evidenceBasis: {
        dictionaryEditionId: 'dictionary-v0.2.0',
        grammarEditionId: 'grammar-v0.2.0',
        componentKeys: ['historicalExamples', 'discourseClusters'],
      },
    });
    expect(result.summary).toMatchObject({
      requirements: 1,
      amendedRequirements: 1,
      syntheticRowsAuthorized: 0,
      modelTrainingAuthorized: false,
    });
  });

  it('fails if a parent row does not carry the frozen parent hashes', () => {
    const input = fixture();
    input.parentRequirementRows[0]!.evidenceBasis.dictionaryManifestSha256 =
      '0'.repeat(64);
    expect(() => buildEvidenceGapRequirementsEdition(input)).toThrow(
      'parent binding mismatch',
    );
  });

  it('rejects an amendment for a nonexistent requirement', () => {
    const input = fixture();
    input.contractValue.amendments[0]!.requirement_id = 'missing.requirement';
    expect(() => buildEvidenceGapRequirementsEdition(input)).toThrow(
      'references unknown requirement',
    );
  });
});
