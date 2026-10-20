/**
 * Grammar sources indexed for each dictionary, by dictionary code. Paths are
 * relative to the repository's dictionaries/ directory. A language without
 * an entry is indexed from its dictionary entries and example sentences only.
 */

export interface GrammarSourceConfig {
  label: string;
  url: string;
  /** OCR markdown of a reference grammar, split into passages. */
  markdownPath?: string;
  /** Front-matter headings kept with the passages (e.g. gloss abbreviations). */
  pinnedHeadings?: readonly string[];
  /** JSON list of word forms documented in the grammar. */
  formsPath?: string;
  /** JSON object summarising the grammar's rules, inflections and cases. */
  digestPath?: string;
  /** Digest fields that describe the data files rather than the language. */
  digestSkipFields?: readonly string[];
}

export const EVIDENCE_GRAMMAR_SOURCES: Readonly<Record<string, GrammarSourceConfig>> = {
  kuku_yalanji: {
    label: 'Patz, A Grammar of the Kuku Yalanji Language',
    url: 'https://openresearch-repository.anu.edu.au/items/c3f55c48-a0aa-461d-be7a-fd7c3902d356',
    markdownPath: 'kuku_yalanji/grammar.md',
    pinnedHeadings: ['Abbreviations and conventions', 'Abbreviations of kinship terms'],
    formsPath: 'kuku_yalanji/lexemes.json',
    digestPath: 'kuku_yalanji/framework.json',
    // Hints for mapping dictionary part-of-speech abbreviations.
    digestSkipFields: ['mapping_hints'],
  },
};
