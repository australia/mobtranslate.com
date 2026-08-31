export interface AtomicDictionaryGloss {
  word: string;
  gloss: string;
}

export interface ExactDictionaryMatch {
  word: string;
  gloss: string;
}

/**
 * Collapse duplicate database editions without collapsing distinct headwords
 * or senses. Comparison is normalized, while the first source spelling is
 * retained for display.
 */
export function deduplicateAtomicDictionaryGlosses(
  entries: readonly AtomicDictionaryGloss[],
): AtomicDictionaryGloss[] {
  const deduplicated = new Map<string, AtomicDictionaryGloss>();
  for (const entry of entries) {
    const word = entry.word.trim();
    const gloss = entry.gloss.trim();
    const headwordKey = normalizeHeadword(word);
    const glossKey = normalizeDictionaryEnglish(gloss);
    if (!headwordKey || !glossKey) continue;
    const key = `${headwordKey}\u0000${glossKey}`;
    if (!deduplicated.has(key)) deduplicated.set(key, { word, gloss });
  }
  return [...deduplicated.values()];
}

export type ExactDictionaryIndex = Map<
  string,
  Map<string, ExactDictionaryMatch>
>;

const MAX_LOOKUP_TOKENS = 6;

export function normalizeDictionaryEnglish(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('en')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^\p{L}\p{N}'-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeHeadword(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function eligibleLookupKey(value: string): string | null {
  const normalized = normalizeDictionaryEnglish(value);
  if (!normalized) return null;
  const tokenCount = normalized.split(' ').length;
  return tokenCount <= MAX_LOOKUP_TOKENS ? normalized : null;
}

/**
 * Builds a closed, exact index from atomic source records. Commas, semicolons,
 * and parenthetical text inside one source record are never interpreted as
 * independent senses.
 */
export function buildExactDictionaryIndex(
  entries: readonly AtomicDictionaryGloss[],
): ExactDictionaryIndex {
  const index: ExactDictionaryIndex = new Map();
  for (const entry of entries) {
    const lookupKey = eligibleLookupKey(entry.gloss);
    const word = entry.word.trim();
    const headwordKey = normalizeHeadword(word);
    if (!lookupKey || !headwordKey) continue;

    const matches = index.get(lookupKey) ?? new Map();
    if (!matches.has(headwordKey)) {
      matches.set(headwordKey, { word, gloss: entry.gloss.trim() });
    }
    index.set(lookupKey, matches);
  }
  return index;
}

export function findUniqueExactDictionaryMatch(
  source: string,
  index: ExactDictionaryIndex,
): ExactDictionaryMatch | null {
  const lookupKey = eligibleLookupKey(source);
  if (!lookupKey) return null;
  const matches = index.get(lookupKey);
  if (!matches || matches.size !== 1) return null;
  return matches.values().next().value ?? null;
}
