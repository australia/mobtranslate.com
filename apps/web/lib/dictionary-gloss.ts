/**
 * Word-by-word, source-backed glossing of a phrase against a dictionary.
 *
 * Every token of the learner's text is looked up on its own: first as a
 * headword of the language, then as an exact English gloss, then as a word
 * that a short gloss mentions. A token that matches nothing is reported as
 * missing. Nothing is ever generated: the only outputs are dictionary records.
 *
 * This module is pure so the tokenizer can run in the browser as well as in
 * the API route.
 */

export interface GlossSourceEntry {
  word: string;
  gloss: string;
}

export type GlossTokenStatus =
  | 'headword'
  | 'exact'
  | 'mention'
  | 'skipped'
  | 'missing';

export interface GlossMatch {
  word: string;
  gloss: string;
}

export interface GlossToken {
  /** The word as the learner typed it. */
  token: string;
  /** The normalized form (or inflection-stripped lemma) that matched. */
  lookup: string;
  status: GlossTokenStatus;
  matches: GlossMatch[];
  /** True when an exact English gloss points at more than one headword. */
  ambiguous: boolean;
}

export interface GlossResult {
  tokens: GlossToken[];
  found: number;
  missing: number;
  skipped: number;
  complete: boolean;
}

export interface GlossIndex {
  headwords: Map<string, { word: string; glosses: string[] }>;
  exact: Map<string, Map<string, GlossMatch>>;
  mentions: Map<string, Map<string, GlossMatch>>;
}

export const MAX_GLOSS_CHARS = 200;
export const MAX_GLOSS_TOKENS = 24;
const MAX_MATCHES_PER_TOKEN = 6;
const MAX_MENTION_GLOSS_TOKENS = 8;

/** English closed-class words that usually have no separate dictionary entry. */
const ENGLISH_FUNCTION_WORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'but',
  'of',
  'to',
  'in',
  'on',
  'at',
  'by',
  'for',
  'with',
  'from',
  'as',
  'is',
  'are',
  'am',
  'was',
  'were',
  'be',
  'been',
  'being',
  'do',
  'does',
  'did',
  'have',
  'has',
  'had',
  'will',
  'would',
  'shall',
  'should',
  'can',
  'could',
  'may',
  'might',
  'must',
  'it',
  'its',
  'that',
  'this',
  'these',
  'those',
  'them',
  'their',
  'there',
]);

const WORD_PATTERN = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;

export function normalizeGlossText(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('en')
    .replace(/[‘’]/g, "'")
    .replace(/[^\p{L}\p{N}'-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Splits learner text into word tokens, dropping punctuation. */
export function tokenizeGlossText(text: string): string[] {
  const tokens = text.normalize('NFKC').match(WORD_PATTERN) ?? [];
  return tokens
    .map((token) => token.replace(/^['’-]+|['’-]+$/g, ''))
    .filter((token) => token.length > 0)
    .slice(0, MAX_GLOSS_TOKENS);
}

export function countGlossWords(text: string): number {
  return tokenizeGlossText(text).length;
}

/**
 * Inflection-stripped candidates for an English token, most literal first.
 * These are plain suffix rules, not a vocabulary: the dictionary decides
 * whether any candidate is a word.
 */
export function englishLookupVariants(token: string): string[] {
  const base = normalizeGlossText(token);
  const variants: string[] = [];
  const add = (candidate: string) => {
    const value = candidate.trim();
    if (value.length >= 2 && !variants.includes(value)) variants.push(value);
  };
  if (!base) return variants;
  add(base);
  if (base.endsWith("'s")) add(base.slice(0, -2));
  if (base.endsWith('ies') && base.length > 4) add(`${base.slice(0, -3)}y`);
  if (base.endsWith('es') && base.length > 4) {
    add(base.slice(0, -2));
    add(base.slice(0, -1));
  } else if (base.endsWith('s') && !base.endsWith('ss') && base.length > 3) {
    add(base.slice(0, -1));
  }
  if (base.endsWith('ing') && base.length > 5) {
    const stem = base.slice(0, -3);
    add(stem);
    add(`${stem}e`);
    if (stem.length > 2 && stem.at(-1) === stem.at(-2)) add(stem.slice(0, -1));
  }
  if (base.endsWith('ed') && base.length > 4) {
    const stem = base.slice(0, -2);
    add(stem);
    add(`${stem}e`);
    if (stem.length > 2 && stem.at(-1) === stem.at(-2)) add(stem.slice(0, -1));
  }
  if (base.endsWith('er') && base.length > 5) add(base.slice(0, -2));
  return variants;
}

function headwordKey(word: string): string {
  return word.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
}

export function buildGlossIndex(
  entries: readonly GlossSourceEntry[],
): GlossIndex {
  const headwords: GlossIndex['headwords'] = new Map();
  const exact: GlossIndex['exact'] = new Map();
  const mentions: GlossIndex['mentions'] = new Map();

  for (const entry of entries) {
    const word = entry.word.trim();
    const gloss = entry.gloss.trim();
    const key = headwordKey(word);
    if (!key || !gloss) continue;

    const record = headwords.get(key) ?? { word, glosses: [] };
    if (!record.glosses.includes(gloss)) record.glosses.push(gloss);
    headwords.set(key, record);

    const normalizedGloss = normalizeGlossText(gloss);
    if (!normalizedGloss) continue;
    const match: GlossMatch = { word, gloss };

    const exactMatches = exact.get(normalizedGloss) ?? new Map();
    if (!exactMatches.has(key)) exactMatches.set(key, match);
    exact.set(normalizedGloss, exactMatches);

    const glossTokens = normalizedGloss.split(' ');
    if (glossTokens.length > 1 && glossTokens.length <= MAX_MENTION_GLOSS_TOKENS) {
      for (const glossToken of new Set(glossTokens)) {
        if (ENGLISH_FUNCTION_WORDS.has(glossToken) || glossToken.length < 2) continue;
        const mentionMatches = mentions.get(glossToken) ?? new Map();
        if (!mentionMatches.has(key)) mentionMatches.set(key, match);
        mentions.set(glossToken, mentionMatches);
      }
    }
  }

  return { headwords, exact, mentions };
}

function limitMatches(matches: Map<string, GlossMatch>): GlossMatch[] {
  return [...matches.values()].slice(0, MAX_MATCHES_PER_TOKEN);
}

export function glossToken(token: string, index: GlossIndex): GlossToken {
  const normalized = normalizeGlossText(token);
  const headword = normalized ? index.headwords.get(normalized) : undefined;
  if (headword) {
    return {
      token,
      lookup: normalized,
      status: 'headword',
      matches: [
        { word: headword.word, gloss: headword.glosses.slice(0, 3).join('; ') },
      ],
      ambiguous: false,
    };
  }

  const variants = englishLookupVariants(token);
  for (const variant of variants) {
    const exactMatches = index.exact.get(variant);
    if (exactMatches && exactMatches.size > 0) {
      return {
        token,
        lookup: variant,
        status: 'exact',
        matches: limitMatches(exactMatches),
        ambiguous: exactMatches.size > 1,
      };
    }
  }
  for (const variant of variants) {
    const mentionMatches = index.mentions.get(variant);
    if (mentionMatches && mentionMatches.size > 0) {
      return {
        token,
        lookup: variant,
        status: 'mention',
        matches: limitMatches(mentionMatches),
        ambiguous: mentionMatches.size > 1,
      };
    }
  }

  if (normalized && ENGLISH_FUNCTION_WORDS.has(normalized)) {
    return { token, lookup: normalized, status: 'skipped', matches: [], ambiguous: false };
  }
  return { token, lookup: normalized, status: 'missing', matches: [], ambiguous: false };
}

export function glossText(text: string, index: GlossIndex): GlossResult {
  const tokens = tokenizeGlossText(text.slice(0, MAX_GLOSS_CHARS)).map((token) =>
    glossToken(token, index),
  );
  const found = tokens.filter((token) => token.matches.length > 0).length;
  const missing = tokens.filter((token) => token.status === 'missing').length;
  const skipped = tokens.filter((token) => token.status === 'skipped').length;
  return { tokens, found, missing, skipped, complete: tokens.length > 0 && missing === 0 };
}
