import type { Word } from '@/lib/supabase/types';

/**
 * The entry a word URL names. Matches the spelling exactly when it can, else
 * ignoring case; duplicates resolve to the fullest entry, so the page and its
 * share card always show the same one.
 */
export function pickHeadword<W extends Word>(words: W[], decodedWord: string): W | undefined {
  // Historical Mi'gmaq imports contain duplicate headwords. Prefer the row
  // with the most attached dictionary content; keep the other rows intact.
  const orthographicKey = (value: string) => value
    .normalize('NFKC')
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  const requestedOrthography = orthographicKey(decodedWord);
  const caseExactMatches = words.filter(w => orthographicKey(w.word) === requestedOrthography);
  const exactMatches = caseExactMatches.length > 0
    ? caseExactMatches
    : words.filter(w =>
        orthographicKey(w.word).toLocaleLowerCase('en-CA') === requestedOrthography.toLocaleLowerCase('en-CA') ||
        (w.normalized_word
          ? orthographicKey(w.normalized_word).toLocaleLowerCase('en-CA') === requestedOrthography.toLocaleLowerCase('en-CA')
          : false)
      );
  exactMatches.sort((left, right) => {
    const childRows = (candidate: typeof left) =>
      (candidate.definitions?.length ?? 0) +
      (candidate.definitions?.reduce((sum, definition) => sum + (definition.translations?.length ?? 0), 0) ?? 0) +
      (candidate.usage_examples?.length ?? 0);
    const enrichment = (candidate: typeof left) =>
      [candidate.phonemic, candidate.gloss, candidate.semantic_domain, candidate.verb_class,
        candidate.dialect, candidate.entry_source, candidate.notes].filter(Boolean).length;
    return (
      childRows(right) - childRows(left) ||
      enrichment(right) - enrichment(left) ||
      String(right.created_at ?? '').localeCompare(String(left.created_at ?? '')) ||
      left.id.localeCompare(right.id)
    );
  });
  return exactMatches[0];
}
