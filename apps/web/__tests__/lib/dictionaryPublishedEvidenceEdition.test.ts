// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  buildDictionaryPublishedEvidenceEdition,
  type DictionaryPublishedEvidenceContract,
} from '@/lib/research/dictionaryPublishedEvidenceEdition';

const reference = (path: string, rows: number) => ({
  path,
  sha256: 'a'.repeat(64),
  rows,
});

function fixture() {
  const contract: DictionaryPublishedEvidenceContract = {
    schema_version: 1,
    edition_id: 'fixture-dictionary-v0.2.0',
    parent_edition_id: 'fixture-dictionary-v0.1.0',
    created_at_utc: '2026-07-22T09:00:00.000Z',
    status: 'published_source_evidence_expansion',
    scope: {
      language: 'Fixture',
      iso_639_3: 'fix',
      glottocode: 'fixt1234',
      variety: 'unknown',
      orthographies: ['source'],
    },
    parent_manifest: {
      path: 'dictionary/parent/EDITION.json',
      sha256: 'b'.repeat(64),
    },
    evidence_inventory: {
      inventory_id: 'fixture-inventory-v0.1.0',
      manifest_path: 'analysis/inventory/MANIFEST.json',
      manifest_sha256: 'c'.repeat(64),
      lexical_component_key: 'lexicalPairings',
    },
    current_dictionary_source_id: 'src-current',
    source_ledger: { path: 'sources/ledger.jsonl', sha256: 'd'.repeat(64) },
    change_ledger: {
      path: 'dictionary/ledger.jsonl',
      sha256: 'e'.repeat(64),
      issuing_change_id: 'change-1',
      accepted_change_ids: [],
    },
    expected_counts: {
      evidence_links: 1,
      exact_current_headwords: 1,
      exact_normalized_glosses: 0,
      token_set_equal_glosses: 1,
      other_gloss_relations: 0,
      added_review_items: 1,
    },
    current_pointer_path: 'dictionary/CURRENT.json',
    supersedes_pointer_sha256: 'f'.repeat(64),
    release_status: 'not_released',
  };
  return {
    contractValue: contract,
    parentManifestValue: {
      edition_id: contract.parent_edition_id,
      components: { entries: reference('entries.jsonl', 1) },
      counts: { trainingEligibleRows: 0 },
    },
    inventoryManifestValue: {
      inventory_id: contract.evidence_inventory.inventory_id,
      components: { lexicalPairings: reference('lexical.jsonl', 1) },
      validation: { accepted_rows: 0, training_eligible_rows: 0 },
    },
    parentEntries: [
      {
        entryCandidateId: 'entry-1',
        sourceId: 'src-current',
        headwordComparison: 'marlu',
      },
    ],
    parentSenses: [
      {
        senseCandidateId: 'sense-1',
        entryCandidateId: 'entry-1',
        translationSource: 'kangaroo, red',
        translationComparison: 'kangaroo, red',
        definitionSource: 'red kangaroo',
      },
    ],
    parentReviewQueue: [{ reviewItemId: 'review-parent' }],
    lexicalPairingRows: [
      {
        inventoryId: contract.evidence_inventory.inventory_id,
        recordId: 'pairing-1',
        sourceId: 'src-newsletter',
        sourceForm: 'marlu',
        englishGlossSource: 'red kangaroo',
        sourceQuote: 'marlu - red kangaroo',
        pairingStatus: 'explicit_published_pairing',
        sourceIndependence: 'same_project_corroboration',
        automaticAcceptance: false,
        acceptanceStatus: 'not_accepted',
        trainingEligibility: 'not_allowed',
      },
    ],
    changeLedgerRows: [
      {
        change_id: contract.change_ledger.issuing_change_id,
        new_edition_id: contract.edition_id,
        parent_edition_id: contract.parent_edition_id,
        status: 'candidate',
      },
    ],
  };
}

describe('dictionary published evidence edition', () => {
  it('links exact headwords but leaves lexical and sense identity unaccepted', () => {
    const result = buildDictionaryPublishedEvidenceEdition(fixture());
    expect(result.report).toMatchObject({
      evidenceLinks: 1,
      exactCurrentHeadwords: 1,
      tokenSetEqualGlosses: 1,
      addedReviewItems: 1,
      acceptedLexicalRows: 0,
      trainingEligibleRows: 0,
    });
    expect(result.publishedEvidenceLinks[0]).toMatchObject({
      exactCurrentEntryCandidateId: 'entry-1',
      lexicalIdentityStatus: 'unadjudicated',
      automaticMergeAllowed: false,
    });
  });

  it('fails rather than choosing between duplicate exact headwords', () => {
    const input = fixture();
    input.parentEntries.push({
      entryCandidateId: 'entry-2',
      sourceId: 'src-current',
      headwordComparison: 'marlu',
    });
    expect(() => buildDictionaryPublishedEvidenceEdition(input)).toThrow(
      'has 2 exact current headword candidates',
    );
  });

  it('requires the append-only change to name the exact edition lineage', () => {
    const input = fixture();
    input.changeLedgerRows[0]!.new_edition_id = 'another-edition';
    expect(() => buildDictionaryPublishedEvidenceEdition(input)).toThrow(
      'does not identify this candidate lineage',
    );
  });
});
