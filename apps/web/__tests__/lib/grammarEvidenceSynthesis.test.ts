import { createHash } from 'node:crypto';
import {
  buildGrammarEvidenceSynthesis,
  type GrammarEvidenceSynthesisContract,
  type LoadedEvidenceSource,
} from '@/lib/research/grammarEvidenceSynthesis';

function sha256(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex');
}

function fixture(): {
  contract: GrammarEvidenceSynthesisContract;
  sources: Map<string, LoadedEvidenceSource>;
} {
  const historical = Buffer.from('Page one\nSuffixing language.\n\f');
  const current = Buffer.from(
    JSON.stringify({ message: { abstract: 'The language is suffixing.' } }),
  );
  const contract: GrammarEvidenceSynthesisContract = {
    schema_version: 1,
    edition_id: 'test-synthesis-v0.1.0',
    parent_edition_id: 'test-parent-v0.1.0',
    created_at_utc: '2026-07-22T00:00:00.000Z',
    status: 'cross_source_reconciliation',
    scope: {
      language: 'Test',
      iso_639_3: 'tst',
      glottocode: 'test1234',
      variety: 'test',
      orthography: 'source-preserving',
    },
    parent_edition: {
      manifest_path: 'grammar/parent/EDITION.json',
      manifest_sha256: '0'.repeat(64),
    },
    source_ledger: { path: 'sources/ledger.jsonl', sha256: '1'.repeat(64) },
    change_ledger: {
      path: 'grammar/changes.jsonl',
      sha256: '2'.repeat(64),
      accepted_change_ids: [],
    },
    current_pointer_path: 'grammar/CURRENT.json',
    supersedes_pointer_sha256: '3'.repeat(64),
    sources: [
      {
        source_id: 'historical',
        source_kind: 'form_feed_text',
        path: 'sources/historical.txt',
        sha256: sha256(historical),
        authority_tier: 'historical_descriptive_grammar',
        training_use: 'not_allowed',
        page_index: {
          manifest_path: 'analysis/pages/MANIFEST.json',
          manifest_sha256: '4'.repeat(64),
          pages_path: 'analysis/pages/pages.jsonl',
          pages_sha256: '5'.repeat(64),
        },
      },
      {
        source_id: 'current',
        source_kind: 'json_document',
        path: 'sources/current.json',
        sha256: sha256(current),
        authority_tier: 'current_descriptive_summary',
        training_use: 'not_allowed',
      },
    ],
    assertions: [
      {
        assertion_key: 'historical-suffixing',
        source_id: 'historical',
        topic: 'typology',
        subtopic: 'morphology',
        proposition: 'The historical source describes suffixing morphology.',
        evidence_positions: [
          {
            kind: 'page_lines',
            chapter_page_ordinal: 1,
            line_start: 2,
            line_end: 2,
          },
        ],
        source_analysis_type: 'author_descriptive_analysis',
        temporal_scope: 'historical',
        variety_scope: 'test',
        orthography_scope: 'not applicable',
        limitations: ['Fixture.'],
      },
      {
        assertion_key: 'current-suffixing',
        source_id: 'current',
        topic: 'typology',
        subtopic: 'morphology',
        proposition: 'The current source describes suffixing morphology.',
        evidence_positions: [
          { kind: 'json_pointer', pointer: '/message/abstract' },
        ],
        source_analysis_type: 'author_summary',
        temporal_scope: 'current',
        variety_scope: 'test',
        orthography_scope: 'not applicable',
        limitations: ['Fixture.'],
      },
    ],
    syntheses: [
      {
        synthesis_key: 'suffixing',
        topic: 'typology',
        conclusion: 'Two independent sources describe suffixing morphology.',
        assertion_keys: ['historical-suffixing', 'current-suffixing'],
        inherited_claim_keys: [],
        relation: 'corroborated',
        evidence_grade: 'multi_source_convergent',
        acceptance_status: 'accepted_for_analysis',
        implications: ['Use as a research-planning constraint.'],
        limitations: ['Not a training row.'],
      },
    ],
    review_items: [],
    release_status: 'not_released',
  };
  const pageBytes = Buffer.from('Page one\nSuffixing language.\n');
  return {
    contract,
    sources: new Map([
      [
        'historical',
        {
          sourceBytes: historical,
          pageIndexRows: [
            {
              pageIndexId: 'test:page:1',
              sourceId: 'historical',
              sourceSha256: sha256(historical),
              chapterPageOrdinal: 1,
              sourcePdfPage: 1,
              printedPage: 1,
              pageSha256: sha256(pageBytes),
              pageLineCount: 2,
            },
          ],
        },
      ],
      ['current', { sourceBytes: current }],
    ]),
  };
}

describe('grammar evidence synthesis', () => {
  it('accepts only a source-anchored multi-source convergence', () => {
    const { contract, sources } = fixture();
    const result = buildGrammarEvidenceSynthesis(contract, sources, new Set());

    expect(result.assertions).toHaveLength(2);
    expect(result.syntheses).toHaveLength(1);
    expect(result.acceptedForAnalysisCount).toBe(1);
    expect(result.conflicts).toHaveLength(0);
  });

  it('rejects a single-source accepted synthesis', () => {
    const { contract, sources } = fixture();
    contract.syntheses[0].assertion_keys = ['current-suffixing'];

    expect(() =>
      buildGrammarEvidenceSynthesis(contract, sources, new Set()),
    ).toThrow('lacks multi-source corroboration');
  });

  it('requires direct conflicts to remain unresolved', () => {
    const { contract, sources } = fixture();
    contract.syntheses[0].relation = 'direct_conflict';

    expect(() =>
      buildGrammarEvidenceSynthesis(contract, sources, new Set()),
    ).toThrow('must remain unresolved');
  });
});
