import { buildScholarlyLanguageEvidence } from '@/lib/research/scholarlyLanguageEvidence';

const hash = 'a'.repeat(64);
const closed = {
  acceptanceStatus: 'not_accepted' as const,
  trainingEligibility: 'not_allowed' as const,
  benchmarkEligibility: 'not_allowed' as const,
  syntheticEligibility: 'not_allowed' as const,
};

function fixture() {
  const sourceId = 'src-wbv-scholarly-test';
  const span = {
    page_key: 'page-3',
    line_start: 2,
    line_end: 3,
    required_substrings: ['form-a', 'form-b'],
  };
  const contract = {
    schema_version: 1,
    inventory_id: 'wajarri-scholarly-test-v0.1.0',
    created_at_utc: '2026-07-23T00:00:00.000Z',
    status: 'scholarly_source_evidence_inventory',
    scope: {
      language: 'Wajarri',
      iso_639_3: 'wbv',
      variety: 'test variety',
      orthography: 'source preserving',
    },
    source: {
      source_id: sourceId,
      pdf: { path: 'source.pdf', sha256: hash },
      extracted_text: { path: 'source.txt', sha256: hash },
      response_headers: [],
      pages: [
        {
          page_key: 'page-3',
          physical_page: 3,
          path: 'page-3.txt',
          sha256: hash,
        },
      ],
      license: 'test licence',
      training_use: 'not_allowed',
      redistribution: 'allowed',
      derived_weights: 'not_allowed',
      hosted_transfer: 'not_allowed',
    },
    source_ledger: { path: 'sources.jsonl', sha256: hash },
    dictionary_context: {
      edition_id: 'dictionary-v1',
      manifest: { path: 'dictionary.json', sha256: hash },
      entry_component_key: 'entries',
      sense_component_key: 'senses',
      form_component_key: 'forms',
    },
    observations: {
      grammar_assertions: [
        {
          ...closed,
          recordId: 'assertion-1',
          sourceId,
          evidenceSpans: [span],
          proposition: 'A source proposition.',
        },
      ],
      grammar_examples: [],
      grammar_conflicts: [],
      dictionary_evidence_links: [
        {
          ...closed,
          recordId: 'dictionary-link-1',
          sourceId,
          evidenceSpans: [span],
          targetEntryCandidateIds: ['entry-1'],
          targetSenseCandidateIds: ['sense-1'],
          targetFormCandidateIds: ['form-1'],
        },
      ],
      citation_chain: [
        {
          ...closed,
          recordId: 'citation-1',
          sourceId,
          citedWork: 'Earlier source',
          accessStatus: 'locally_verified',
          epistemicRole: 'reproduced_example',
        },
      ],
    },
    expected_counts: {
      grammar_assertions: 1,
      grammar_examples: 0,
      grammar_conflicts: 0,
      dictionary_evidence_links: 1,
      citation_chain: 1,
    },
    claim_limit: 'No linguistic claim is accepted.',
  };
  const dictionaryManifest = {
    edition_id: 'dictionary-v1',
    components: {
      entries: { path: 'entries.jsonl', sha256: hash, rows: 1 },
      senses: { path: 'senses.jsonl', sha256: hash, rows: 1 },
      forms: { path: 'forms.jsonl', sha256: hash, rows: 1 },
    },
  };
  return {
    contractValue: contract,
    pageTexts: new Map([
      ['page-3', 'heading\nform-a occurs here\nform-b occurs here\n'],
    ]),
    sourceLedgerRows: [
      {
        source_id: sourceId,
        sha256: hash,
        training_use: 'not_allowed',
        redistribution: 'allowed',
        derived_weights: 'not_allowed',
        hosted_transfer: 'not_allowed',
      },
    ],
    dictionaryManifestValue: dictionaryManifest,
    dictionaryEntries: [{ entryCandidateId: 'entry-1' }],
    dictionarySenses: [{ senseCandidateId: 'sense-1' }],
    dictionaryForms: [{ formCandidateId: 'form-1' }],
  };
}

describe('scholarly language evidence inventory', () => {
  it('anchors closed observations to verified page spans and dictionary IDs', () => {
    const result = buildScholarlyLanguageEvidence(fixture());

    expect(result.validation).toEqual({
      grammarAssertions: 1,
      grammarExamples: 0,
      grammarConflicts: 0,
      dictionaryEvidenceLinks: 1,
      citationChain: 1,
      evidenceSpans: 2,
      acceptedRows: 0,
      trainingEligibleRows: 0,
    });
    expect(result.components.grammarAssertions[0].evidenceAnchors).toEqual([
      expect.objectContaining({
        physicalPage: 3,
        lineStart: 2,
        lineEnd: 3,
        sourceSpan: 'form-a occurs here\nform-b occurs here',
      }),
    ]);
  });

  it('fails when a declared source span does not support its required text', () => {
    const input = fixture();
    input.contractValue.observations.grammar_assertions[0].evidenceSpans[0]
      .required_substrings = ['missing evidence'];

    expect(() => buildScholarlyLanguageEvidence(input)).toThrow(
      'lacks required text',
    );
  });

  it('fails when a dictionary evidence link targets an unknown record', () => {
    const input = fixture();
    input.contractValue.observations.dictionary_evidence_links[0]
      .targetEntryCandidateIds = ['unknown-entry'];

    expect(() => buildScholarlyLanguageEvidence(input)).toThrow(
      'unknown target entry',
    );
  });

  it('accepts a non-PDF primary artifact for a publisher snippet witness', () => {
    const input = fixture();
    const source = input.contractValue.source;
    delete (source as { pdf?: unknown }).pdf;
    Object.assign(source, {
      primary_artifact: { path: 'snippet-manifest.json', sha256: hash },
      evidence_profile: 'publisher_snippet',
    });

    expect(
      buildScholarlyLanguageEvidence(input).validation.grammarAssertions,
    ).toBe(1);
  });

  it('rejects ambiguous primary artifact declarations', () => {
    const input = fixture();
    Object.assign(input.contractValue.source, {
      primary_artifact: { path: 'snippet-manifest.json', sha256: hash },
    });

    expect(() => buildScholarlyLanguageEvidence(input)).toThrow(
      'declare exactly one of pdf or primary_artifact',
    );
  });
});
