// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  chapterGroup,
  partitionForChapter,
  selectAnindilyakwaTrainingCorpus,
  type ParallelCandidate,
} from '../../lib/research/anindilyakwaTrainingCorpus';

function row(
  id: string,
  pairKind: ParallelCandidate['pair_kind'],
  canonicalRef: string,
  anindilyakwa: string,
  english: string,
): ParallelCandidate {
  return {
    id,
    pair_kind: pairKind,
    canonical_ref: canonicalRef,
    source_text: anindilyakwa,
    target_text: english,
    alignment_confidence: pairKind === 'sentence_candidate' ? '0.8800' : '1',
    alignment_status: 'fixture',
    rights_status: 'rights_review_needed',
  };
}

describe('Anindilyakwa owner-attested training corpus selection', () => {
  it('prefers sentence candidates and excludes the shadowed whole verse', () => {
    const result = selectAnindilyakwaTrainingCorpus({
      sentenceCandidates: [
        row('sentence', 'sentence_candidate', 'JHN.1.1#s1', 'aoi one', 'one'),
      ],
      verses: [row('verse', 'verse', 'JHN.1.1', 'aoi whole', 'whole')],
      verseRanges: [],
      naturalBenchmarks: [],
      lexicalBenchmarks: [],
    });

    expect(result.pairs.map((item) => item.pair_id)).toEqual([
      'aoi-owner-attested-v0.3.0:sentence',
    ]);
    expect(result.counts.verses_shadowed_by_sentence_candidates).toBe(1);
    expect(result.exclusions).toContainEqual({
      source_id: 'verse',
      canonical_ref: 'JHN.1.1',
      reason: 'verse_shadowed_by_sentence_candidates',
    });
  });

  it('keeps English to Anindilyakwa direction and rejects exact benchmark pairs', () => {
    const result = selectAnindilyakwaTrainingCorpus({
      sentenceCandidates: [],
      verses: [
        row('blocked', 'verse', 'GEN.1.1', 'Akina!', 'The thing.'),
        row('kept', 'verse', 'GEN.1.2', 'Mamarika', 'Another thing'),
      ],
      verseRanges: [],
      naturalBenchmarks: [
        {
          benchmark_id: 'benchmark',
          input_english: 'the thing',
          expected_anindilyakwa: 'akina',
        },
      ],
      lexicalBenchmarks: [],
    });

    expect(result.counts.benchmark_overlap_rejected).toBe(1);
    expect(result.pairs).toHaveLength(1);
    expect(result.pairs[0]).toMatchObject({
      source_language: 'eng',
      target_language: 'aoi',
      source_text: 'Another thing',
      target_text: 'Mamarika',
    });
  });

  it('deduplicates normalized pairs and never includes verse ranges', () => {
    const result = selectAnindilyakwaTrainingCorpus({
      sentenceCandidates: [],
      verses: [
        row('first', 'verse', 'LUK.1.1', 'Akina', 'One'),
        row('duplicate', 'verse', 'LUK.1.2', ' akina ', 'one!'),
      ],
      verseRanges: [row('range', 'verse_range', 'LUK.1.1-2', 'range', 'range')],
      naturalBenchmarks: [],
      lexicalBenchmarks: [],
    });

    expect(result.pairs).toHaveLength(1);
    expect(result.counts.duplicate_pairs_rejected).toBe(1);
    expect(result.counts.verse_ranges_input).toBe(1);
    expect(result.exclusions.map((item) => item.reason)).toEqual([
      'verse_range_derived_overlap',
      'normalized_duplicate_pair',
    ]);
  });

  it('partitions deterministically by whole chapter group', () => {
    expect(chapterGroup('GEN.12.4#s2')).toBe('GEN.12');
    expect(partitionForChapter('GEN.12')).toBe(partitionForChapter('GEN.12'));

    const rows = Array.from({ length: 40 }, (_, index) =>
      row(
        `row-${index}`,
        'verse',
        `GEN.${Math.floor(index / 2) + 1}.${(index % 2) + 1}`,
        `aoi ${index}`,
        `english ${index}`,
      ),
    );
    const result = selectAnindilyakwaTrainingCorpus({
      sentenceCandidates: [],
      verses: rows,
      verseRanges: [],
      naturalBenchmarks: [],
      lexicalBenchmarks: [],
    });
    const partitionsByGroup = new Map<string, Set<string>>();
    for (const item of result.pairs) {
      const partitions = partitionsByGroup.get(item.chapter_group) ?? new Set();
      partitions.add(item.partition);
      partitionsByGroup.set(item.chapter_group, partitions);
    }
    expect(
      [...partitionsByGroup.values()].every(
        (partitions) => partitions.size === 1,
      ),
    ).toBe(true);
  });
});
