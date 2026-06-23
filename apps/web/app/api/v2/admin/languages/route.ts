import { NextRequest, NextResponse } from 'next/server';
import { and, asc, count, eq } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import { snakeRow } from '@/lib/db/case';
import { requireRole } from '@/lib/auth-helpers';
import {
  languages as languagesT,
  userRoleAssignments as uraT,
  words as wordsT,
} from '@/lib/db/schema';

const ADMIN_ROLES = ['super_admin', 'dictionary_admin'];

export async function GET(_request: NextRequest) {
  try {
    const { response } = await requireRole(ADMIN_ROLES);
    if (response) return response;

    // Languages + per-language word/curator counts (grouped, not N+1).
    const [langs, wordCounts, curatorCounts] = await Promise.all([
      db.select().from(languagesT).orderBy(asc(languagesT.name)),
      db
        .select({ languageId: wordsT.languageId, value: count() })
        .from(wordsT)
        .groupBy(wordsT.languageId),
      db
        .select({ languageId: uraT.languageId, value: count() })
        .from(uraT)
        .where(eq(uraT.isActive, true))
        .groupBy(uraT.languageId),
    ]);

    const wordByLang = new Map(wordCounts.map((r) => [r.languageId, r.value]));
    const curatorByLang = new Map(
      curatorCounts.map((r) => [r.languageId, r.value])
    );

    const languagesWithStats = langs.map((lang) => ({
      ...snakeRow(lang),
      word_count: wordByLang.get(lang.id) ?? 0,
      curator_count: curatorByLang.get(lang.id) ?? 0,
    }));

    return NextResponse.json(languagesWithStats);
  } catch (error) {
    console.error('Failed to fetch languages:', error);
    return NextResponse.json(
      { error: 'Failed to fetch languages' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { response } = await requireRole(ADMIN_ROLES);
    if (response) return response;

    const body = await request.json();
    const { name, code, is_active } = body;

    if (!name || !code) {
      return NextResponse.json(
        { error: 'Name and code are required' },
        { status: 400 }
      );
    }

    const normalizedCode = String(code).toLowerCase();

    const existing = await db
      .select({ id: languagesT.id })
      .from(languagesT)
      .where(eq(languagesT.code, normalizedCode))
      .limit(1);

    if (existing.length > 0) {
      return NextResponse.json(
        { error: 'Language code already exists' },
        { status: 400 }
      );
    }

    const [newLanguage] = await db
      .insert(languagesT)
      .values({
        name,
        code: normalizedCode,
        isActive: is_active ?? true,
      })
      .returning();

    return NextResponse.json(snakeRow(newLanguage));
  } catch (error) {
    console.error('Failed to create language:', error);
    return NextResponse.json(
      { error: 'Failed to create language' },
      { status: 500 }
    );
  }
}
