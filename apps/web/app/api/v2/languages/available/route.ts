import { NextResponse } from 'next/server';
import { asc, count, eq } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import { languages as languagesT, words as wordsT } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const langs = await db
      .select({ id: languagesT.id, code: languagesT.code, name: languagesT.name })
      .from(languagesT)
      .where(eq(languagesT.isActive, true))
      .orderBy(asc(languagesT.name));

    // Count words per language with a real COUNT.
    const counted = await Promise.all(
      langs.map(async (l) => {
        const c = await db
          .select({ value: count() })
          .from(wordsT)
          .where(eq(wordsT.languageId, l.id));
        return { code: l.code, name: l.name, wordCount: c[0]?.value ?? 0 };
      })
    );

    const languages = counted
      .filter((l) => l.wordCount > 0)
      .sort((a, b) => b.wordCount - a.wordCount);

    return NextResponse.json({ languages, total: languages.length });
  } catch (error) {
    console.error('Error fetching available languages:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
