// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  auditSplitLeakage,
  buildLeakageGroups,
  canonicalDatasetText,
  leakageComparisonText,
  repairWindows1252Controls,
  stableDatasetSplit,
} from '../../scripts/lib/migmaq-translation-dataset';

describe('Mi\'gmaq translation dataset controls', () => {
  it('preserves case, apostrophes, and diacritics while normalizing transport whitespace', () => {
    expect(canonicalDatasetText("  Mu\n gejiaqas  guntewi'ganmit.  ")).toBe("Mu gejiaqas guntewi'ganmit.");
    expect(canonicalDatasetText('e\u0301')).toBe('é');
    expect(leakageComparisonText("Winpegijuig  ")).toBe('winpegijuig');
    expect(repairWindows1252Controls('pugulatmu\u0092jg')).toBe('pugulatmu’jg');
    expect(leakageComparisonText("pugulatmu'jg")).toBe(leakageComparisonText('pugulatmu’jg'));
  });

  it('keeps entries sharing a source sentence, target sentence, or headword in one group', () => {
    const groups = buildLeakageGroups([
      { entryId: 'a', headword: "Pejila'sit", sourceTexts: ['A sentence.'], targetTexts: ['One.'] },
      { entryId: 'b', headword: 'different', sourceTexts: ['A sentence.'], targetTexts: ['Two.'] },
      { entryId: 'c', headword: 'DIFFERENT', sourceTexts: ['Another.'], targetTexts: ['Three.'] },
      { entryId: 'd', headword: 'alone', sourceTexts: ['Last.'], targetTexts: ['One.'] },
    ]);

    expect(groups.get('a')).toBe(groups.get('b'));
    expect(groups.get('b')).toBe(groups.get('c'));
    expect(groups.get('c')).toBe(groups.get('d'));
  });

  it('assigns a group deterministically and detects any cross-split leakage', () => {
    expect(stableDatasetSplit('micgrp-example')).toBe(stableDatasetSplit('micgrp-example'));
    const violations = auditSplitLeakage([
      {
        id: 'row-a', split: 'train', leakageGroup: 'g-a', entryIds: ['entry-a'], headwords: ['head-a'],
        sourceText: 'Same source.', targetText: 'Target one.',
      },
      {
        id: 'row-b', split: 'test', leakageGroup: 'g-b', entryIds: ['entry-b'], headwords: ['head-b'],
        sourceText: 'same source.', targetText: 'Target two.',
      },
    ]);

    expect(violations).toEqual([
      expect.objectContaining({ dimension: 'source_text', splits: ['test', 'train'], rowIds: ['row-a', 'row-b'] }),
    ]);
  });
});
