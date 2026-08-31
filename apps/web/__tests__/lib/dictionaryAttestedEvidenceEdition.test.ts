// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  buildDictionaryAttestedEvidenceEdition,
  type DictionaryAttestedEvidenceContract,
} from '@/lib/research/dictionaryAttestedEvidenceEdition';

const component = (name: string, rows: number) => ({
  path: `dictionary/${name}.jsonl`,
  sha256: '1'.repeat(64),
  rows,
});

function contract(): DictionaryAttestedEvidenceContract {
  return {
    schema_version: 1,
    edition_id: 'fixture-dictionary-v0.2.0',
    parent_edition_id: 'fixture-dictionary-v0.1.0',
    created_at_utc: '2026-07-22T17:00:00.000Z',
    status: 'attested_source_evidence_expansion',
    scope: {
      language: 'Fixture',
      iso_639_3: 'fix',
      glottocode: 'fixt1234',
      variety: 'unadjudicated',
      orthographies: ['source-preserving'],
    },
    parent_manifest: {
      path: 'dictionary/parent.json',
      sha256: 'a'.repeat(64),
    },
    evidence_inventory: {
      inventory_id: 'fixture-inventory-v0.1.0',
      manifest_path: 'analysis/MANIFEST.json',
      manifest_sha256: 'b'.repeat(64),
      lexical_component_key: 'lexicalPairings',
      phrase_translation_component_key: 'phraseTranslationPairings',
    },
    current_dictionary_source_id: 'src-current',
    source_ledger: {
      path: 'sources/SOURCE-LEDGER.jsonl',
      sha256: 'c'.repeat(64),
    },
    change_ledger: {
      path: 'dictionary/CHANGE-LEDGER.jsonl',
      sha256: 'd'.repeat(64),
      issuing_change_id: 'change-1',
      accepted_change_ids: [],
    },
    review_candidate_limit: 2,
    expected_counts: {
      lexical_evidence_links: 3,
      phrase_translation_evidence_links: 1,
      unique_exact_current_headwords: 1,
      multiple_exact_current_headwords: 1,
      no_exact_current_headwords: 1,
      added_lexical_review_items: 3,
      added_phrase_review_items: 1,
    },
    current_pointer_path: 'dictionary/CURRENT.json',
    supersedes_pointer_sha256: 'e'.repeat(64),
    release_status: 'not_released',
    claim_limit: 'Evidence only.',
  };
}

const parentManifest = {
  edition_id: 'fixture-dictionary-v0.1.0',
  components: {
    entries: component('entries', 4),
    senses: component('senses', 4),
  },
  counts: { acceptedLexicalRows: 0, trainingEligibleRows: 0 },
};

const inventoryManifest = {
  inventory_id: 'fixture-inventory-v0.1.0',
  components: {
    lexicalPairings: component('lexical', 3),
    phraseTranslationPairings: component('phrases', 1),
  },
  validation: {
    lexical_pairings: 3,
    phrase_translation_pairings: 1,
    accepted_rows: 0,
    training_eligible_rows: 0,
  },
};

const entries = [
  {
    entryCandidateId: 'entry-jalbu',
    sourceId: 'src-current',
    headwordComparison: 'jalbu',
  },
  {
    entryCandidateId: 'entry-widi-1',
    sourceId: 'src-current',
    headwordComparison: 'widi',
  },
  {
    entryCandidateId: 'entry-widi-2',
    sourceId: 'src-current',
    headwordComparison: 'widi',
  },
  {
    entryCandidateId: 'entry-marngurr',
    sourceId: 'src-current',
    headwordComparison: 'marngurr',
  },
];

const senses = [
  {
    senseCandidateId: 'sense-jalbu',
    entryCandidateId: 'entry-jalbu',
    translationSource: 'woman',
    translationComparison: 'woman',
  },
  {
    senseCandidateId: 'sense-widi-1',
    entryCandidateId: 'entry-widi-1',
    translationSource: 'black',
    translationComparison: 'black',
  },
  {
    senseCandidateId: 'sense-widi-2',
    entryCandidateId: 'entry-widi-2',
    translationSource: 'two',
    translationComparison: 'two',
  },
  {
    senseCandidateId: 'sense-marngurr',
    entryCandidateId: 'entry-marngurr',
    translationSource: 'three',
    translationComparison: 'three',
  },
];

const lexicalPair = (
  recordId: string,
  sourceForm: string,
  englishGlossSource: string,
) => ({
  inventoryId: 'fixture-inventory-v0.1.0',
  recordId,
  sourceId: 'src-evidence',
  sourceForm,
  englishGlossSource,
  sourceQuote: `${sourceForm} = ${englishGlossSource}`,
  pairingStatus: 'explicit_published_pairing',
  pairingScope: 'explicit_lexeme_definition',
  languageAttributionStatus: 'explicitly_wajarri',
  sourceIndependence: 'independence_unknown',
  automaticAcceptance: false,
  acceptanceStatus: 'not_accepted',
  trainingEligibility: 'not_allowed',
});

const phrasePair = {
  inventoryId: 'fixture-inventory-v0.1.0',
  recordId: 'phrase-1',
  sourceId: 'src-evidence',
  sourceTextSource: 'Waranygu bayalgu',
  englishTranslationSource: 'Digging for Food',
  sourceQuote: 'Waranygu bayalgu: Digging for Food',
  pairingScope: 'publication_title',
  languageAttributionStatus: 'wajarri_context_unqualified',
  translationStatus: 'explicit_published_whole_phrase_translation',
  alignmentStatus: 'whole_phrase_only',
  sourceIndependence: 'independence_unknown',
  lexicalSegmentationStatus: 'not_inferred',
  phraseBenchmarkUnitCount: 0,
  automaticAcceptance: false,
  acceptanceStatus: 'not_accepted',
  trainingEligibility: 'not_allowed',
};

function build(
  overrides: Partial<
    Parameters<typeof buildDictionaryAttestedEvidenceEdition>[0]
  > = {},
) {
  return buildDictionaryAttestedEvidenceEdition({
    contractValue: contract(),
    parentManifestValue: parentManifest,
    inventoryManifestValue: inventoryManifest,
    parentEntries: entries,
    parentSenses: senses,
    parentReviewQueue: [],
    inheritedPublishedEvidenceLinks: [],
    inheritedPhraseTranslationEvidenceLinks: [],
    lexicalPairingRows: [
      lexicalPair('lex-unique', 'jalbu', 'woman'),
      lexicalPair('lex-multiple', 'widi', 'black'),
      lexicalPair('lex-missing', 'marn.gurr', 'three'),
    ],
    phraseTranslationPairingRows: [phrasePair],
    changeLedgerRows: [
      {
        change_id: 'change-1',
        parent_edition_id: 'fixture-dictionary-v0.1.0',
        new_edition_id: 'fixture-dictionary-v0.2.0',
        status: 'candidate',
      },
    ],
    ...overrides,
  });
}

describe('dictionary attested evidence edition', () => {
  it('distinguishes unique, multiple, and missing current headword relations', () => {
    const result = build();

    expect(result.report).toMatchObject({
      addedLexicalEvidenceLinks: 3,
      addedPhraseTranslationEvidenceLinks: 1,
      uniqueExactCurrentHeadwords: 1,
      multipleExactCurrentHeadwords: 1,
      noExactCurrentHeadwords: 1,
      acceptedLexicalRows: 0,
      trainingEligibleRows: 0,
    });
    expect(result.publishedEvidenceLinks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          evidenceRecordId: 'lex-unique',
          headwordRelationStatus: 'unique_exact_current_headword',
          automaticEntryCreationAllowed: false,
        }),
        expect.objectContaining({
          evidenceRecordId: 'lex-multiple',
          headwordRelationStatus: 'multiple_exact_current_headwords',
        }),
        expect.objectContaining({
          evidenceRecordId: 'lex-missing',
          headwordRelationStatus: 'no_exact_current_headword',
          dynamicReviewCandidates: [
            expect.objectContaining({
              entryCandidateId: 'entry-marngurr',
            }),
            expect.any(Object),
          ],
        }),
      ]),
    );
  });

  it('keeps a whole-title translation unsegmented and outside entry creation', () => {
    const result = build();
    expect(result.phraseTranslationEvidenceLinks).toEqual([
      expect.objectContaining({
        sourceTextSource: 'Waranygu bayalgu',
        alignmentStatus: 'whole_phrase_only',
        lexicalSegmentationStatus: 'not_inferred',
        compositionalGlossStatus: 'not_inferred',
        dictionaryEntryCreationAllowed: false,
        phraseBenchmarkUnitCount: 0,
        trainingEligibility: 'not_allowed',
      }),
    ]);
  });

  it('preserves inherited links and rejects an evidence-link collision', () => {
    const inherited = {
      evidenceLinkId: 'older-link',
      status: 'candidate',
    };
    const result = build({ inheritedPublishedEvidenceLinks: [inherited] });
    expect(result.publishedEvidenceLinks[0]).toEqual(inherited);

    expect(() =>
      build({
        inheritedPublishedEvidenceLinks: [
          { evidenceLinkId: 'lex-unique-current-dictionary-link' },
        ],
      }),
    ).toThrow('duplicate published evidence link ID');
  });

  it('fails when the issuing change points to another lineage', () => {
    expect(() =>
      build({
        changeLedgerRows: [
          {
            change_id: 'change-1',
            parent_edition_id: 'wrong-parent',
            new_edition_id: 'fixture-dictionary-v0.2.0',
            status: 'candidate',
          },
        ],
      }),
    ).toThrow('does not identify this candidate lineage');
  });
});
