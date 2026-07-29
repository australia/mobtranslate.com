import { describe, expect, it } from 'vitest';
import { buildPublicWordSources } from '@/lib/word-provenance';

const importedSource = {
  sourceId: 'source-1',
  sourceName: "Mi'gmaq/Mi'kmaq Online Talking Dictionary",
  sourceUrl: 'https://mikmaqonline.org/',
  sourceEntryUrl: 'https://mikmaqonline.org/servlet/dictionaryFrameSet.html?arg0=1',
  attributionText: "Mi'gmaq/Mi'kmaq Online Talking Dictionary (mikmaqonline.org)",
  licenseName: 'CC BY-NC 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by-nc/4.0/',
};

describe('buildPublicWordSources', () => {
  it('describes an exact archive match without claiming authorship of the whole entry', () => {
    const [source] = buildPublicWordSources({
      languageCode: 'migmaq',
      importedSources: [{ ...importedSource, mappingStatus: 'exact_existing' }],
    });

    expect(source.relationship).toBe('linked_archive_record');
    expect(source.description).toContain('does not imply that every field');
    expect(source.entryUrl).toContain('mikmaqonline.org');
  });

  it('identifies an entry created from the linked source', () => {
    const [source] = buildPublicWordSources({
      languageCode: 'migmaq',
      importedSources: [{ ...importedSource, mappingStatus: 'created_from_source' }],
    });

    expect(source.relationship).toBe('entry_created_from_source');
    expect(source.description).toContain('created from the linked source record');
  });

  it('distinguishes Patz grammar additions from the original Kuku Yalanji dictionary', () => {
    const [grammar] = buildPublicWordSources({ languageCode: 'kuku_yalanji', entrySource: 'grammar' });
    const [dictionary] = buildPublicWordSources({ languageCode: 'kuku_yalanji' });

    expect(grammar.name).toContain('Grammar');
    expect(grammar.description).toContain('not present in the original dictionary');
    expect(dictionary.name).toBe('Kuku-Yalanji Dictionary (1982)');
  });

  it('does not invent a source for an entry with no documented trail', () => {
    expect(buildPublicWordSources({ languageCode: 'anindilyakwa' })).toEqual([]);
  });
});
