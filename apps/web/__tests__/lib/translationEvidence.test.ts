// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  formLookupKeys,
  longestKnownPrefix,
  normalizeForm,
  segmentForm,
  surfaceTokens,
} from '../../lib/translation-evidence/forms';
import {
  buildDictionaryUnits,
  buildGrammarDigestUnits,
  buildGrammarFormUnits,
  buildGrammarMarkdownUnits,
  collectKnownStems,
  evidenceIndexRevision,
} from '../../lib/translation-evidence/units';
import {
  DEFAULT_EVIDENCE_LIMITS,
  assembleEvidencePack,
  excerptFor,
  buildFormIndex,
  lookupWords,
  type IndexedEvidenceUnit,
} from '../../lib/translation-evidence/retrieve';
import { attemptRank, needsRepair } from '../../lib/hybrid-reading.server';

const grammar = { label: 'Patz grammar', url: 'https://example.org/patz' };

const GRAMMAR_MARKDOWN = `# A grammar of the Kuku Yalanji language

## Table of contents

| 3.2.3.3 | Comitative | 52 |

### Abbreviations and conventions

| COMIT | comitative (nominal derivation) | 3.2.3.3 |
| PURP  | purposive (verb inflection)     | 3.8.4.1 |

#### Abbreviations of pronouns

| 1sg | first person singular |

# Acknowledgements

Thanks to everyone.

#### 3.5 Personal pronouns

Pronouns take their own case forms.

### 76 Chapter 3

| Sg. 1. | ngayu | nganya | ngaykunku | ngaykunji |
|--------|-------|--------|-----------|-----------|

**Table 3.6:** Personal pronoun paradigm

#### 3.B.4 Purposive

- (213) Ngayu wawu balka-nka yunu-ndu-rrku. 1sg.NOM(S) want speak-PURP 2sg-LOC-EMPH4 'I want to speak only to you.'
`;

describe('written forms', () => {
  it('normalises, splits and segments forms without losing apostrophes or hyphens', () => {
    expect(normalizeForm('“Ngaykunji,”')).toBe('ngaykunji');
    expect(surfaceTokens("E'pit samqwan. Balka-nka!")).toEqual(["e'pit", 'samqwan', 'balka-nka']);
    expect(segmentForm('balka-nka')).toEqual({
      form: 'balka-nka',
      joined: 'balkanka',
      stem: 'balka',
      suffixes: ['-nka'],
    });
    expect(formLookupKeys('balka-nka')).toEqual(['balka-nka', 'balkanka', 'balka', '-nka']);
    expect(longestKnownPrefix('wunany', new Set(['wuna', 'wu']))).toEqual({
      stem: 'wuna',
      remainder: 'ny',
    });
  });
});

describe('evidence units', () => {
  const entries = [
    {
      word: 'balkal',
      wordType: 'transitive-verb',
      glosses: ['tell', 'make', 'speak', 'tell'],
      examples: [
        { text: 'Ngayu wawu balkanka yunundurrku', translation: 'I want to speak only to you' },
        { text: 'Ngayu wawu balkanka yunundurrku', translation: 'I want to speak only to you' },
      ],
    },
    { word: 'ngayku', wordType: null, glosses: ['my; for me'], examples: [] },
    { word: 'unglossed', wordType: null, glosses: [], examples: [] },
  ];

  it('builds one dictionary unit per glossed headword and de-duplicates examples', () => {
    const units = buildDictionaryUnits('kuku_yalanji', 'Kuku Yalanji', entries);
    expect(units.map((unit) => unit.key)).toEqual([
      'dictionary:balkal',
      expect.stringMatching(/^example:/),
      'dictionary:ngayku',
    ]);
    expect(units[0].body).toBe('tell; make; speak (transitive-verb)');
    expect(units[0].sourceUrl).toBe('https://mobtranslate.com/dictionaries/kuku_yalanji/words/balkal');
    expect(units[1].targetForms).toContain('balkanka');
    expect(units[1].embedText).toContain('I want to speak only to you');
  });

  it('splits a grammar into numbered sections, skips front matter and page headers, and pins the guide', () => {
    const stems = collectKnownStems(entries, [{ root: 'ngayu', gloss: 'I' }]);
    const units = buildGrammarMarkdownUnits(grammar, GRAMMAR_MARKDOWN, stems, {
      pinnedHeadings: ['Abbreviations and conventions'],
    });
    const titles = units.map((unit) => unit.title);

    expect(titles).toEqual([
      'Abbreviations and conventions',
      '§3.5 Personal pronouns',
      '§3.8.4 Purposive',
    ]);
    expect(units[0].pinned).toBe(true);
    expect(units[0].body).toContain('first person singular');
    expect(units.map((unit) => unit.body).join('\n')).not.toContain('Thanks to everyone');
    expect(units.map((unit) => unit.body).join('\n')).not.toContain('76 Chapter 3');
    // Forms that begin with a recorded stem are indexed; English words and
    // forms with no recorded stem (nganya has no entry here) are not.
    expect(units[1].targetForms).toEqual(['ngaykunji', 'ngaykunku', 'ngayu']);
    expect(units[2].targetForms).toEqual(expect.arrayContaining(['balka-nka', 'balka', '-nka']));
    expect(units[2].sourceLabel).toBe('Patz grammar, §3.8.4');
  });

  it('keeps grammar tables whole when packing passages', () => {
    const table = Array.from({ length: 40 }, (_, row) => `| ngayku${row} | form ${row} |`).join('\n');
    const markdown = `#### 3.5 Personal pronouns\n\nIntro.\n\n${table}\n\nAfter.`;
    const units = buildGrammarMarkdownUnits(grammar, markdown, new Set(['ngayku']), {
      maxChunkChars: 300,
      maxBlockChars: 4000,
    });
    expect(units.some((unit) => unit.body.includes('| ngayku0 |') && unit.body.includes('| ngayku39 |'))).toBe(true);
  });

  it('indexes grammar-documented forms and digest entries', () => {
    const forms = buildGrammarFormUnits(grammar, [
      { root: 'balka-l', gloss: 'make; speak, say, tell', pos: 'transitive-verb', source: 'ex.(402)' },
      { root: 'balka-l', gloss: 'make; speak, say, tell', pos: 'transitive-verb', source: 'ex.(402)' },
    ]);
    expect(forms).toHaveLength(1);
    expect(forms[0]).toMatchObject({ kind: 'grammar_form', title: 'balka-l', sourceLabel: 'Patz grammar, ex.(402)' });
    expect(forms[0].targetForms).toEqual(expect.arrayContaining(['balka-l', 'balkal', 'balka']));

    const digest = buildGrammarDigestUnits(
      grammar,
      {
        verb: {
          inflections: [{ name: 'PURPOSIVE', suffix: '-nka after a and i' }],
          mapping_hints: [{ raw: 'n', canonical: 'noun' }],
        },
      },
      new Set(['balka']),
      ['mapping_hints'],
    );
    expect(digest).toHaveLength(1);
    expect(digest[0].title).toBe('verb · inflections: PURPOSIVE');
  });

  it('gives a stable revision that changes with content', () => {
    const units = buildDictionaryUnits('kuku_yalanji', 'Kuku Yalanji', entries);
    const revision = evidenceIndexRevision(units, 'model', 512);
    expect(evidenceIndexRevision([...units].reverse(), 'model', 512)).toBe(revision);
    expect(evidenceIndexRevision(units.slice(1), 'model', 512)).not.toBe(revision);
    expect(evidenceIndexRevision(units, 'model', 256)).not.toBe(revision);
  });
});

function unit(key: string, kind: IndexedEvidenceUnit['kind'], title: string, targetForms: string[], pinned = false): IndexedEvidenceUnit {
  return { key, kind, title, body: `${title} body`, sourceLabel: 'fixture', sourceUrl: 'https://example.org', targetForms, pinned };
}

describe('evidence retrieval', () => {
  const units = new Map(
    [
      unit('dictionary:kuku', 'dictionary', 'kuku', ['kuku']),
      unit('dictionary:balkal', 'dictionary', 'balkal', ['balkal']),
      unit('dictionary:wambal', 'dictionary', 'wambal', ['wambal']),
      unit('grammar_form:balka', 'grammar_form', 'balka-l', ['balka-l', 'balkal', 'balka']),
      unit('grammar:4.4.1:0', 'grammar', '§4.4.1 Purposive', ['balka-nka', 'balkanka', 'balka', '-nka']),
      unit('grammar:3.2.2:0', 'grammar', '§3.2.2 Case inflections', ['-nka', 'kaya-nka']),
      unit('example:1', 'example', 'Yundu kuku yaralku daya', ['yundu', 'kuku', 'yaralku', 'daya']),
      unit('grammar:guide:0', 'grammar', 'Abbreviations', [], true),
      ...Array.from({ length: 30 }, (_, index) =>
        unit(`dictionary:kuku-${index}`, 'dictionary', `kuku-compound-${index}`, [`kuku-${index}`]),
      ),
    ].map((item) => [item.key, item] as const),
  );
  const formIndex = buildFormIndex(units.values());

  it('classifies each draft word by what records it', () => {
    const lookups = lookupWords('Bama kuku balka-nka wunany Nigel', units, formIndex);
    expect(lookups.map(({ form, status }) => [form, status])).toEqual([
      ['bama', 'not_found'],
      ['kuku', 'recorded'],
      ['balka-nka', 'documented_form'],
      ['wunany', 'not_found'],
      ['nigel', 'not_found'],
    ]);
    expect(lookups[2].unitKeys).toContain('grammar:4.4.1:0');
  });

  it('ties an unattested ending to its stem and to grammar on that ending', () => {
    const [lookup] = lookupWords('balkalnka', units, formIndex);
    expect(lookup).toMatchObject({ status: 'stem_known', stem: 'balkal', ending: '-nka' });
    expect(lookup.unitKeys).toEqual(expect.arrayContaining(['dictionary:balkal', 'grammar:4.4.1:0']));
  });

  it('keeps draft-word records ahead of meaning search, which cannot crowd them out', () => {
    const queries = [
      { text: 'Australian people should speak Australian language.', origin: 'source' as const },
      { text: 'speak', origin: 'idea' as const },
    ];
    const semanticHits = [
      ...Array.from({ length: 30 }, (_, index) => ({
        queryIndex: 0,
        unitKey: `dictionary:kuku-${index}`,
        similarity: 0.9 - index / 100,
      })),
      { queryIndex: 1, unitKey: 'dictionary:balkal', similarity: 0.5 },
      { queryIndex: 1, unitKey: 'grammar_form:balka', similarity: 0.55 },
    ];
    const pack = assembleEvidencePack({
      units,
      formIndex,
      lookupText: 'Bama-Australia kuku-Jalunji balka-nka.',
      queries,
      semanticHits,
    });
    const titles = pack.items.map((item) => item.title);

    expect(titles).toContain('§4.4.1 Purposive');
    // The idea's best hit is included even though the source query had
    // thirty higher-scoring hits.
    expect(titles).toContain('balkal');
    expect(pack.items.find((item) => item.title === 'balkal')?.matchedIdeas).toEqual(['speak']);
    expect(pack.items.filter((item) => item.unitKind === 'dictionary').length).toBeLessThanOrEqual(
      DEFAULT_EVIDENCE_LIMITS.ceilingPerKind.dictionary,
    );
    expect(pack.guide.map((item) => item.id)).toEqual(['guide-1']);
    expect(pack.items.every((item) => !item.title.startsWith('Abbreviations'))).toBe(true);
    const ids = pack.items.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expect.arrayContaining(['dictionary-1', 'form-1', 'grammar-1']));
  });

  it('adds English-word dictionary matches only within their allowance', () => {
    const pack = assembleEvidencePack({
      units,
      formIndex,
      lookupText: '',
      queries: [],
      semanticHits: [],
      lexicalKeys: Array.from({ length: 30 }, (_, index) => `dictionary:kuku-${index}`),
    });
    expect(pack.items).toHaveLength(DEFAULT_EVIDENCE_LIMITS.perKind.dictionary);
    expect(pack.guide).toEqual([]);
  });
});

describe('passage excerpts', () => {
  it('keeps a short passage whole and centres a long one on the looked-up form', () => {
    expect(excerptFor('short passage', ['x'], 100)).toBe('short passage');
    const prose = `${'Earlier prose. '.repeat(40)}\nThe purposive form balka-nka means to speak.\n${'Later prose. '.repeat(40)}`;
    const excerpt = excerptFor(prose, ['balka-nka'], 200);
    expect(excerpt).toContain('balka-nka means to speak');
    expect(excerpt.startsWith('… ')).toBe(true);
    expect(excerpt.length).toBeLessThan(260);
  });

  it('carries a table header into an excerpt that starts inside the table', () => {
    const rows = Array.from({ length: 30 }, (_, index) => `| row${index} | form${index} |`);
    const table = ['| Person | Comitative |', '|---|---|', ...rows, '| Sg.1 | ngaykunji |'].join('\n');
    const excerpt = excerptFor(table, ['ngaykunji'], 120);
    expect(excerpt).toContain('| Person | Comitative |');
    expect(excerpt).toContain('ngaykunji');
  });

  it('falls back to the opening of a passage found by meaning alone', () => {
    const excerpt = excerptFor('word '.repeat(100), [], 50);
    expect(excerpt.endsWith(' …')).toBe(true);
    expect(excerpt.length).toBeLessThanOrEqual(52);
  });
});

describe('repair decisions', () => {
  it('repairs only a reading whose meaning clearly differs; smaller gaps become caveats', () => {
    expect(needsRepair({ verdict: 'same', problems: [], senses: [], plainMeaning: '', summary: '' })).toBe(false);
    expect(
      needsRepair({ verdict: 'close', problems: [{ kind: 'missing', detail: '"should" is missing' }], senses: [], plainMeaning: '', summary: '' }),
    ).toBe(false);
    expect(
      needsRepair({ verdict: 'different', problems: [{ kind: 'changed', detail: '"provide" for "speak"' }], senses: [], plainMeaning: '', summary: '' }),
    ).toBe(true);
  });

  it('ranks attempts by verdict, then by number of problems', () => {
    expect(attemptRank(null)).toEqual([3, 0]);
    expect(attemptRank({ verdict: 'close', problems: [{ kind: 'missing', detail: 'x' }], senses: [], plainMeaning: '', summary: '' })).toEqual([1, 1]);
  });
});
