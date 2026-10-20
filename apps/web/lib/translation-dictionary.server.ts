import { createHash } from 'node:crypto';
import { asc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import {
  definitions as definitionsT,
  languages as languagesT,
  translations as translationsT,
  words as wordsT,
} from '@/lib/db/schema';
import {
  buildExactDictionaryIndex,
  deduplicateAtomicDictionaryGlosses,
  formatDictionaryGlossList,
  type AtomicDictionaryGloss,
  type ExactDictionaryIndex,
} from '@/lib/dictionary-exact.server';

/** Longest text the public translator accepts. */
export const MAX_TRANSLATION_CHARS = 400;

function sha256(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export interface DictionaryMeta {
  name: string;
  description?: string;
  region?: string;
  code: string;
}

export interface GlossEntry {
  word: string;
  gloss: string;
}

export interface Dictionary {
  meta: DictionaryMeta;
  words: GlossEntry[];
  reverseWords: GlossEntry[];
  exactIndex: ExactDictionaryIndex;
  revision: string;
}

// ---------------------------------------------------------------------------
// Full-dictionary loader (cached). Translation quality depends on the model
// actually seeing the whole word list — e.g. "woman" → "jalbu" only works if
// jalbu is in the prompt. We load every entry (de-duped by headword, senses
// merged) once per language and cache it, rather than a 500-row slice.
// ---------------------------------------------------------------------------
const DICT_TTL = 60 * 60 * 1000; // 1h
const dictCache = new Map<string, { at: number; dictionary: Dictionary }>();

export async function loadDictionary(language: string): Promise<Dictionary | null> {
  const cached = dictCache.get(language);
  if (cached && Date.now() - cached.at < DICT_TTL) return cached.dictionary;

  const langRows = await db
    .select({
      id: languagesT.id,
      name: languagesT.name,
      description: languagesT.description,
      region: languagesT.region,
      code: languagesT.code,
    })
    .from(languagesT)
    .where(eq(languagesT.code, language))
    .limit(1);
  const lang = langRows[0];
  if (!lang) return null;

  // Load the whole dictionary: every word + its definitions + translations.
  const wordRows = await db
    .select({ id: wordsT.id, word: wordsT.word })
    .from(wordsT)
    .where(eq(wordsT.languageId, lang.id))
    .orderBy(asc(wordsT.word));

  const wordIds = wordRows.map((w) => w.id);

  // Gather atomic source records first. Production can contain overlapping
  // legacy and YAML editions, so normalized de-duplication happens before the
  // prompt, exact index, and revision are constructed.
  const rawAtomicGlosses: AtomicDictionaryGloss[] = [];
  const rawReverseGlosses: AtomicDictionaryGloss[] = [];
  if (wordIds.length > 0) {
    const wordById = new Map(
      wordRows.map((w) => [w.id, (w.word || '').trim()]),
    );

    // Pull defs + translations in chunks to stay within parameter limits.
    const CHUNK = 5000;
    const defsByWordId = new Map<string, string[]>();
    const transByWordId = new Map<string, string[]>();
    for (let i = 0; i < wordIds.length; i += CHUNK) {
      const slice = wordIds.slice(i, i + CHUNK);
      const [defs, trans] = await Promise.all([
        db
          .select({
            wordId: definitionsT.wordId,
            definition: definitionsT.definition,
          })
          .from(definitionsT)
          .where(inArray(definitionsT.wordId, slice)),
        db
          .select({
            wordId: translationsT.wordId,
            translation: translationsT.translation,
          })
          .from(translationsT)
          .where(inArray(translationsT.wordId, slice)),
      ]);
      for (const d of defs) {
        const arr = defsByWordId.get(d.wordId) ?? [];
        arr.push(d.definition);
        defsByWordId.set(d.wordId, arr);
      }
      for (const t of trans) {
        const arr = transByWordId.get(t.wordId) ?? [];
        arr.push(t.translation);
        transByWordId.set(t.wordId, arr);
      }
    }

    for (const id of wordIds) {
      const key = wordById.get(id) || '';
      if (!key) continue;
      const translations = transByWordId.get(id) ?? [];
      const definitions = defsByWordId.get(id) ?? [];
      translations.forEach((translation) => {
        const gloss = translation?.trim();
        if (!gloss) return;
        rawAtomicGlosses.push({ word: key, gloss });
      });
      definitions.forEach((definition) => {
        const gloss = definition?.trim();
        if (!gloss) return;
        rawAtomicGlosses.push({ word: key, gloss });
      });

      // Definitions carry the source's semantic qualifications. Prefer them
      // for exact reverse answers, falling back to translations only for
      // entries whose edition has no definition record.
      const reverseGlosses =
        definitions.length > 0 ? definitions : translations;
      reverseGlosses.forEach((value) => {
        const gloss = value?.trim();
        if (gloss) rawReverseGlosses.push({ word: key, gloss });
      });
    }
  }

  const atomicGlosses = deduplicateAtomicDictionaryGlosses(rawAtomicGlosses);
  const reverseAtomicGlosses =
    deduplicateAtomicDictionaryGlosses(rawReverseGlosses);
  const byWord = new Map<string, { word: string; glosses: string[] }>();
  for (const entry of atomicGlosses) {
    const key = entry.word.normalize('NFKC').toLocaleLowerCase().trim();
    const record = byWord.get(key) ?? { word: entry.word, glosses: [] };
    record.glosses.push(entry.gloss);
    byWord.set(key, record);
  }

  const words: GlossEntry[] = [...byWord.entries()]
    .map(([, record]) => {
      // Keep the prompt compact: cap a single entry's gloss length.
      return {
        word: record.word,
        gloss: formatDictionaryGlossList(record.glosses, 160),
      };
    })
    .sort((a, b) => a.word.localeCompare(b.word));
  const reverseByWord = new Map<string, { word: string; glosses: string[] }>();
  for (const entry of reverseAtomicGlosses) {
    const key = entry.word.normalize('NFKC').toLocaleLowerCase().trim();
    const record = reverseByWord.get(key) ?? {
      word: entry.word,
      glosses: [],
    };
    record.glosses.push(entry.gloss);
    reverseByWord.set(key, record);
  }
  const reverseWords: GlossEntry[] = [...reverseByWord.values()]
    .map((record) => ({
      word: record.word,
      gloss: formatDictionaryGlossList(record.glosses, MAX_TRANSLATION_CHARS),
    }))
    .sort((a, b) => a.word.localeCompare(b.word));
  const revisionGlosses = atomicGlosses
    .map(({ word, gloss }) => [word, gloss] as const)
    .sort(
      ([leftWord, leftGloss], [rightWord, rightGloss]) =>
        leftWord.localeCompare(rightWord) ||
        leftGloss.localeCompare(rightGloss),
    );

  const dictionary: Dictionary = {
    meta: {
      name: lang.name,
      description: lang.description || '',
      region: lang.region || '',
      code: lang.code,
    },
    words,
    reverseWords,
    exactIndex: buildExactDictionaryIndex(atomicGlosses),
    revision: sha256({ words, atomicGlosses: revisionGlosses }),
  };
  dictCache.set(language, { at: Date.now(), dictionary });
  return dictionary;
}
