/**
 * Surface-form handling shared by the evidence index builder and the
 * runtime retriever. These functions only split and normalise written forms;
 * they never decide what a word means.
 */

const EDGE_PUNCTUATION = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;

/** Lowercase, NFKC, straight apostrophes, and no leading/trailing punctuation. */
export function normalizeForm(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[‐-–]/g, '-')
    .replace(EDGE_PUNCTUATION, '');
}

/**
 * Split text into written forms, keeping internal apostrophes and hyphens
 * (both are meaningful in several of our orthographies). Order of first
 * appearance is preserved and duplicates are removed.
 */
export function surfaceTokens(text: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of text.normalize('NFKC').split(/[\s,.;:!?()[\]{}"“”«»|/\\*_<>=+]+/u)) {
    const token = normalizeForm(raw);
    if (!token || !/\p{L}/u.test(token) || seen.has(token)) continue;
    seen.add(token);
    result.push(token);
  }
  return result;
}

/** A hyphen-segmented form split into its stem and its suffix morphs. */
export interface SegmentedForm {
  form: string;
  joined: string;
  stem: string;
  suffixes: string[];
}

export function segmentForm(form: string): SegmentedForm {
  const normalized = normalizeForm(form);
  const parts = normalized.split('-').filter(Boolean);
  return {
    form: normalized,
    joined: parts.join(''),
    stem: parts[0] ?? normalized,
    suffixes: parts.slice(1).map((part) => `-${part}`),
  };
}

/**
 * Every lookup key a form can be found under: the form itself, its
 * hyphen-free spelling, and (for segmented forms) its stem and suffix morphs.
 */
export function formLookupKeys(form: string): string[] {
  const segmented = segmentForm(form);
  const keys = new Set<string>([segmented.form, segmented.joined]);
  if (segmented.suffixes.length > 0) {
    keys.add(segmented.stem);
    for (const suffix of segmented.suffixes) keys.add(suffix);
  }
  keys.delete('');
  return [...keys];
}

/**
 * The longest known stem that begins a form, so an inflected form that is not
 * itself recorded can still be tied to its dictionary root. The remainder is
 * reported as a suffix morph so grammar describing that ending can be found.
 */
export function longestKnownPrefix(
  form: string,
  knownStems: ReadonlySet<string>,
  minimumLength = 3,
): { stem: string; remainder: string } | null {
  const joined = segmentForm(form).joined;
  for (let length = joined.length - 1; length >= minimumLength; length -= 1) {
    const stem = joined.slice(0, length);
    if (knownStems.has(stem)) {
      return { stem, remainder: joined.slice(length) };
    }
  }
  return null;
}
