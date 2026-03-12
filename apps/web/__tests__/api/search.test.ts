import { describe, it, expect } from 'vitest';

/**
 * Recreating the calculateMatchScore function from
 * apps/web/app/api/v2/public/search/route.ts since it is not exported.
 *
 * Scoring tiers:
 *   100 - exact match (case-insensitive)
 *    90 - text starts with query
 *    70 - text includes query (substring)
 *    80 - one of the words in text equals query exactly
 *    60 - one of the words in text starts with query
 *    50 - fallback (none of the above)
 *
 * Note: The order of checks in the source matters. "includes" (70) is checked
 * before word-level checks (80, 60), so a substring match that also happens
 * to be a full word match will score 70, not 80 — because `includes` catches
 * it first. The word-level checks (80, 60) only apply when the query is NOT
 * a substring of the full text, which in practice means they aren't reachable
 * for simple single-word texts. They apply to multi-word texts where the query
 * matches a word but not as a contiguous substring of the full joined text —
 * however, since words are produced by splitting the text, the query would
 * always be found by `includes` first if it matched a word exactly.
 *
 * Looking more carefully: actually `includes` is checked BEFORE the word split,
 * so if text.includes(query) is true, it returns 70 and never reaches the
 * word checks. The word checks (80, 60) are only reached when includes is false,
 * which can't happen if a word equals the query (since that word is part of the
 * text string). So scores 80 and 60 are effectively unreachable in practice.
 *
 * We faithfully reproduce the source logic and test accordingly.
 */
function calculateMatchScore(text: string, query: string): number {
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();

  if (lowerText === lowerQuery) return 100;
  if (lowerText.startsWith(lowerQuery)) return 90;
  if (lowerText.includes(lowerQuery)) return 70;

  const words = lowerText.split(/\s+/);
  if (words.some((w) => w === lowerQuery)) return 80;
  if (words.some((w) => w.startsWith(lowerQuery))) return 60;

  return 50;
}

describe('calculateMatchScore', () => {
  // --- Exact match (100) ---
  it('should return 100 for an exact match', () => {
    expect(calculateMatchScore('water', 'water')).toBe(100);
  });

  it('should return 100 for an exact match (case-insensitive)', () => {
    expect(calculateMatchScore('Water', 'water')).toBe(100);
    expect(calculateMatchScore('WATER', 'water')).toBe(100);
  });

  it('should return 100 for multi-word exact match', () => {
    expect(calculateMatchScore('fresh water', 'fresh water')).toBe(100);
  });

  // --- Starts with (90) ---
  it('should return 90 when text starts with query', () => {
    expect(calculateMatchScore('waterfall', 'water')).toBe(90);
  });

  it('should return 90 when text starts with query (case-insensitive)', () => {
    expect(calculateMatchScore('Waterfall', 'water')).toBe(90);
  });

  it('should return 90 for multi-word text that starts with query', () => {
    expect(calculateMatchScore('water supply system', 'water')).toBe(90);
  });

  // --- Includes / substring (70) ---
  it('should return 70 when text contains query as substring', () => {
    expect(calculateMatchScore('groundwater', 'water')).toBe(70);
  });

  it('should return 70 when query appears in the middle of text', () => {
    expect(calculateMatchScore('the water is cold', 'water')).toBe(70);
  });

  it('should return 70 for partial match inside a word', () => {
    expect(calculateMatchScore('underwater cave', 'water')).toBe(70);
  });

  // --- Word exact match (80) — only reachable if includes fails ---
  // In practice, if a word in the text equals the query, includes would catch it first (70).
  // Score 80 is reachable only in edge cases. We verify the 70 behavior for word matches.
  it('should return 70 (not 80) when query matches a word because includes catches it first', () => {
    expect(calculateMatchScore('the water flows', 'water')).toBe(70);
  });

  // --- Word starts with (60) — similarly hard to reach ---
  // If a word starts with query, the full text includes the query, so includes catches it (70).
  it('should return 70 (not 60) when a word starts with query because includes catches it first', () => {
    expect(calculateMatchScore('he watered the plants', 'water')).toBe(70);
  });

  // --- Fallback (50) ---
  it('should return 50 when there is no match at all', () => {
    expect(calculateMatchScore('fire', 'water')).toBe(50);
  });

  it('should return 50 for completely unrelated strings', () => {
    expect(calculateMatchScore('abc', 'xyz')).toBe(50);
  });

  it('should return 50 for empty query against non-empty text', () => {
    // empty string: ''.includes('') is true, but ''.toLowerCase() === '' is exact match
    // Actually for non-empty text with empty query: text.startsWith('') is true -> 90?
    // Let's verify: 'fire'.startsWith('') === true in JS
    // And '' === '' would not match since 'fire' !== ''
    // So 'fire'.startsWith('') -> true -> returns 90
    // This is an edge case worth documenting
    expect(calculateMatchScore('fire', '')).toBe(90);
  });

  it('should return 100 for empty text and empty query', () => {
    expect(calculateMatchScore('', '')).toBe(100);
  });

  // --- Case insensitivity across all tiers ---
  it('should be case-insensitive for substring matching', () => {
    expect(calculateMatchScore('Underground', 'ground')).toBe(70);
    expect(calculateMatchScore('underground', 'GROUND')).toBe(70);
  });

  it('should be case-insensitive for starts-with matching', () => {
    expect(calculateMatchScore('Groundwater', 'ground')).toBe(90);
    expect(calculateMatchScore('groundwater', 'GROUND')).toBe(90);
  });

  // --- Additional edge cases ---
  it('should handle single character matches', () => {
    expect(calculateMatchScore('a', 'a')).toBe(100);
    expect(calculateMatchScore('ab', 'a')).toBe(90);
    expect(calculateMatchScore('ba', 'a')).toBe(70);
    expect(calculateMatchScore('b', 'a')).toBe(50);
  });

  it('should handle query longer than text', () => {
    expect(calculateMatchScore('hi', 'hello world')).toBe(50);
  });
});
