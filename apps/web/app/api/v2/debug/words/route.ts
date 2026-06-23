import { NextRequest, NextResponse } from 'next/server';
import { and, count, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import {
  definitions as definitionsT,
  languages as languagesT,
  wordClasses as wordClassesT,
  words as wordsT,
} from '@/lib/db/schema';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const languageCode = searchParams.get('language');

  try {
    // Get language
    const langRows = await db
      .select({ id: languagesT.id, code: languagesT.code, name: languagesT.name })
      .from(languagesT)
      .where(and(eq(languagesT.code, languageCode!), eq(languagesT.isActive, true)))
      .limit(1);

    const language = langRows[0];
    if (!language) {
      return NextResponse.json({
        error: 'Language not found',
        languageCode,
        langError: null,
      }, { status: 404 });
    }

    // Get words for this language (with word_class) + their definitions.
    const rows = await db
      .select({ word: wordsT, wordClass: wordClassesT })
      .from(wordsT)
      .leftJoin(wordClassesT, eq(wordsT.wordClassId, wordClassesT.id))
      .where(eq(wordsT.languageId, language.id))
      .limit(10);

    const wordIds = rows.map((r) => r.word.id);
    const defs =
      wordIds.length > 0
        ? await db
            .select({ id: definitionsT.id, definition: definitionsT.definition, wordId: definitionsT.wordId })
            .from(definitionsT)
            .where(inArray(definitionsT.wordId, wordIds))
        : [];

    const defsByWord = new Map<string, Array<{ id: string; definition: string }>>();
    for (const d of defs) {
      const arr = defsByWord.get(d.wordId) ?? [];
      arr.push({ id: d.id, definition: d.definition });
      defsByWord.set(d.wordId, arr);
    }

    const words = rows.map((r) => ({
      id: r.word.id,
      word: r.word.word,
      language_id: r.word.languageId,
      definitions: defsByWord.get(r.word.id) ?? [],
      word_class: r.wordClass ? { name: r.wordClass.name } : null,
    }));

    // Count total words
    const totalRows = await db
      .select({ value: count() })
      .from(wordsT)
      .where(eq(wordsT.languageId, language.id));

    return NextResponse.json({
      language,
      totalWords: totalRows[0]?.value ?? 0,
      sampleWords: words,
      wordsWithDefinitions: words.filter((w) => w.definitions && w.definitions.length > 0).length,
    });
  } catch (error) {
    console.error('Debug error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
