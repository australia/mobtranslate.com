import { NextRequest, NextResponse } from 'next/server';
import { and, asc, count, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import {
  definitions as definitionsT,
  languages as languagesT,
  translations as translationsT,
  wordClasses as wordClassesT,
  words as wordsT,
} from '@/lib/db/schema';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const languageCode = searchParams.get('language');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200);
    const offset = parseInt(searchParams.get('offset') || '0');

    if (!languageCode) {
      return NextResponse.json({ error: 'Language code is required' }, { status: 400 });
    }

    // Get language ID from code
    const langRows = await db
      .select({ id: languagesT.id })
      .from(languagesT)
      .where(and(eq(languagesT.code, languageCode), eq(languagesT.isActive, true)))
      .limit(1);

    const language = langRows[0];
    if (!language) {
      return NextResponse.json({ error: 'Language not found' }, { status: 404 });
    }

    // Page of words (+ word_class) and the exact total count.
    const [rows, totalRows] = await Promise.all([
      db
        .select({ word: wordsT, wordClass: wordClassesT })
        .from(wordsT)
        .leftJoin(wordClassesT, eq(wordsT.wordClassId, wordClassesT.id))
        .where(eq(wordsT.languageId, language.id))
        .orderBy(asc(wordsT.word))
        .limit(limit)
        .offset(offset),
      db.select({ value: count() }).from(wordsT).where(eq(wordsT.languageId, language.id)),
    ]);

    const wordIds = rows.map((r) => r.word.id);
    const [defs, trans] = await Promise.all([
      wordIds.length > 0
        ? db
            .select({ wordId: definitionsT.wordId, definition: definitionsT.definition })
            .from(definitionsT)
            .where(inArray(definitionsT.wordId, wordIds))
        : Promise.resolve([]),
      wordIds.length > 0
        ? db
            .select({ wordId: translationsT.wordId, translation: translationsT.translation })
            .from(translationsT)
            .where(inArray(translationsT.wordId, wordIds))
        : Promise.resolve([]),
    ]);

    const defsByWord = new Map<string, Array<{ definition: string }>>();
    for (const d of defs) {
      const arr = defsByWord.get(d.wordId) ?? [];
      arr.push({ definition: d.definition });
      defsByWord.set(d.wordId, arr);
    }
    const transByWord = new Map<string, Array<{ translation: string }>>();
    for (const t of trans) {
      const arr = transByWord.get(t.wordId) ?? [];
      arr.push({ translation: t.translation });
      transByWord.set(t.wordId, arr);
    }

    const formattedWords = rows.map((r) => ({
      id: r.word.id,
      word: r.word.word,
      word_class: r.wordClass ? { id: r.wordClass.id, name: r.wordClass.name } : null,
      definitions: defsByWord.get(r.word.id) ?? [],
      translations: transByWord.get(r.word.id) ?? [],
    }));

    return NextResponse.json({
      words: formattedWords,
      total: totalRows[0]?.value ?? 0,
    });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
