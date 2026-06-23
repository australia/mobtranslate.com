import { NextRequest, NextResponse } from 'next/server';
import { and, count, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import { snakeRow } from '@/lib/db/case';
import { requireUser } from '@/lib/auth-helpers';
import {
  definitions as definitionsT,
  languages as languagesT,
  translations as translationsT,
  usageExamples as usageExamplesT,
  userWordLikes,
  wordClasses as wordClassesT,
  words as wordsT,
} from '@/lib/db/schema';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  // Check if user is authenticated
  const { user, response } = await requireUser();
  if (response) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = parseInt(searchParams.get('limit') || '50', 10);
  const filterLove = searchParams.get('loveOnly') === 'true';

  try {
    const filters = [eq(userWordLikes.userId, user!.id)];
    if (filterLove) filters.push(eq(userWordLikes.isLove, true));
    const where = and(...filters);

    const from = (page - 1) * limit;

    // Page of likes + exact total count.
    const [likeRows, totalRows] = await Promise.all([
      db
        .select()
        .from(userWordLikes)
        .where(where)
        .orderBy(desc(userWordLikes.likedAt))
        .limit(limit)
        .offset(from),
      db.select({ value: count() }).from(userWordLikes).where(where),
    ]);

    const totalCount = totalRows[0]?.value ?? 0;

    // Build the nested `word` object (word + word_class + definitions(+translations)
    // + usage_examples + language) for each liked word, mirroring the old
    // Supabase nested select shape.
    const wordIds = likeRows.map((l) => l.wordId);

    const wordsById = new Map<string, any>();
    if (wordIds.length > 0) {
      const [wordRows, defs, defTranslations, usages, langs] = await Promise.all([
        db
          .select({ word: wordsT, wordClass: wordClassesT })
          .from(wordsT)
          .leftJoin(wordClassesT, eq(wordsT.wordClassId, wordClassesT.id))
          .where(inArray(wordsT.id, wordIds)),
        db.select().from(definitionsT).where(inArray(definitionsT.wordId, wordIds)),
        db.select().from(translationsT).where(inArray(translationsT.wordId, wordIds)),
        db.select().from(usageExamplesT).where(inArray(usageExamplesT.wordId, wordIds)),
        db.select().from(languagesT),
      ]);

      const langById = new Map(langs.map((l) => [l.id, l]));

      const transByDef = new Map<string, any[]>();
      for (const t of defTranslations) {
        if (!t.definitionId) continue;
        const arr = transByDef.get(t.definitionId) ?? [];
        arr.push(snakeRow(t));
        transByDef.set(t.definitionId, arr);
      }

      const defsByWord = new Map<string, any[]>();
      for (const d of defs) {
        const arr = defsByWord.get(d.wordId) ?? [];
        arr.push({ ...snakeRow(d), translations: transByDef.get(d.id) ?? [] });
        defsByWord.set(d.wordId, arr);
      }

      const usagesByWord = new Map<string, any[]>();
      for (const u of usages) {
        const arr = usagesByWord.get(u.wordId) ?? [];
        arr.push(snakeRow(u));
        usagesByWord.set(u.wordId, arr);
      }

      for (const r of wordRows) {
        const lang = langById.get(r.word.languageId);
        wordsById.set(r.word.id, {
          ...snakeRow(r.word),
          word_class: r.wordClass ? snakeRow(r.wordClass) : null,
          definitions: defsByWord.get(r.word.id) ?? [],
          usage_examples: usagesByWord.get(r.word.id) ?? [],
          language: lang ? snakeRow(lang) : null,
        });
      }
    }

    const likes = likeRows.map((l) => ({
      ...snakeRow(l),
      word: wordsById.get(l.wordId) ?? null,
    }));

    return NextResponse.json({
      likes,
      pagination: {
        total: totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit),
        hasNext: page * limit < totalCount,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.error('Error fetching user likes:', error);
    return NextResponse.json(
      { error: 'Failed to fetch likes' },
      { status: 500 }
    );
  }
}
