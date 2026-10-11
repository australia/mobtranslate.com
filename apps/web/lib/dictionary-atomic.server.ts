import { createHash } from 'node:crypto';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import {
  definitions as definitionsT,
  languages as languagesT,
  translations as translationsT,
  words as wordsT,
} from '@/lib/db/schema';
import type { GlossSourceEntry } from '@/lib/dictionary-gloss';

/**
 * Every headword of a dictionary with each of its recorded glosses as a
 * separate (word, gloss) record. Loaded once per language and cached, so the
 * public gloss route can answer from memory.
 */
export interface AtomicDictionary {
  code: string;
  name: string;
  entries: GlossSourceEntry[];
  headwordCount: number;
  revision: string;
}

const DICTIONARY_TTL_MS = 60 * 60 * 1000;
const CHUNK = 5000;
const cache = new Map<string, { at: number; dictionary: AtomicDictionary }>();

export async function loadAtomicDictionary(
  code: string,
): Promise<AtomicDictionary | null> {
  const cached = cache.get(code);
  if (cached && Date.now() - cached.at < DICTIONARY_TTL_MS)
    return cached.dictionary;

  const languageRows = await db
    .select({ id: languagesT.id, name: languagesT.name, code: languagesT.code })
    .from(languagesT)
    .where(and(eq(languagesT.code, code), eq(languagesT.isActive, true)))
    .limit(1);
  const language = languageRows[0];
  if (!language) return null;

  const wordRows = await db
    .select({ id: wordsT.id, word: wordsT.word })
    .from(wordsT)
    .where(eq(wordsT.languageId, language.id))
    .orderBy(asc(wordsT.word));
  const wordById = new Map(
    wordRows.map((row) => [row.id, (row.word || '').trim()] as const),
  );
  const wordIds = [...wordById.keys()];

  const entries: GlossSourceEntry[] = [];
  const seen = new Set<string>();
  const push = (wordId: string, gloss: string | null) => {
    const word = wordById.get(wordId);
    const value = gloss?.trim();
    if (!word || !value) return;
    const key = `${word}\u0000${value}`;
    if (seen.has(key)) return;
    seen.add(key);
    entries.push({ word, gloss: value });
  };

  for (let i = 0; i < wordIds.length; i += CHUNK) {
    const slice = wordIds.slice(i, i + CHUNK);
    const [definitionRows, translationRows] = await Promise.all([
      db
        .select({ wordId: definitionsT.wordId, gloss: definitionsT.definition })
        .from(definitionsT)
        .where(inArray(definitionsT.wordId, slice)),
      db
        .select({ wordId: translationsT.wordId, gloss: translationsT.translation })
        .from(translationsT)
        .where(inArray(translationsT.wordId, slice)),
    ]);
    for (const row of translationRows) push(row.wordId, row.gloss);
    for (const row of definitionRows) push(row.wordId, row.gloss);
  }

  const revision = createHash('sha256')
    .update(
      JSON.stringify(
        [...entries].sort(
          (left, right) =>
            left.word.localeCompare(right.word) ||
            left.gloss.localeCompare(right.gloss),
        ),
      ),
    )
    .digest('hex');

  const dictionary: AtomicDictionary = {
    code: language.code,
    name: language.name,
    entries,
    headwordCount: new Set(entries.map((entry) => entry.word)).size,
    revision,
  };
  cache.set(code, { at: Date.now(), dictionary });
  return dictionary;
}
