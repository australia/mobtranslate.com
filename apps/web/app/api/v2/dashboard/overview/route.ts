import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import { requireUser } from '@/lib/auth-helpers';
import {
  languages as languagesT,
  quizAttempts,
  spacedRepetitionStates,
  words as wordsT,
} from '@/lib/db/schema';

export const dynamic = 'force-dynamic';

/** Consecutive-day streak ending today or yesterday, from a set of date strings. */
function streakFromDays(days: Set<string>): number {
  if (days.size === 0) return 0;
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86_400_000).toDateString();
  if (!days.has(today) && !days.has(yesterday)) return 0;
  let streak = 0;
  let cursor = new Date(days.has(today) ? Date.now() : Date.now() - 86_400_000);
  while (days.has(cursor.toDateString())) {
    streak++;
    cursor = new Date(cursor.getTime() - 86_400_000);
  }
  return streak;
}

export async function GET() {
  const { user, response } = await requireUser();
  if (response) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  try {
    // Real activity lives in quiz_attempts (sessions are often left incomplete,
    // so they undercount). Join each attempt to its word's language.
    let attempts: any[];
    try {
      const attemptRows = await db
        .select({
          is_correct: quizAttempts.isCorrect,
          created_at: quizAttempts.createdAt,
          language_id: wordsT.languageId,
          lang_id: languagesT.id,
          lang_name: languagesT.name,
          lang_code: languagesT.code,
        })
        .from(quizAttempts)
        .innerJoin(wordsT, eq(quizAttempts.wordId, wordsT.id))
        .innerJoin(languagesT, eq(wordsT.languageId, languagesT.id))
        .where(eq(quizAttempts.userId, user!.id));
      attempts = attemptRows.map((r) => ({
        is_correct: r.is_correct,
        created_at: r.created_at,
        words: {
          language_id: r.language_id,
          languages: { id: r.lang_id, name: r.lang_name, code: r.lang_code },
        },
      }));
    } catch (attemptsError) {
      console.error('Error fetching attempts:', attemptsError);
      return NextResponse.json({ error: 'Failed to fetch activity' }, { status: 500 });
    }

    const stateRows = await db
      .select({
        word_id: spacedRepetitionStates.wordId,
        language_id: wordsT.languageId,
        lang_id: languagesT.id,
        lang_name: languagesT.name,
        lang_code: languagesT.code,
      })
      .from(spacedRepetitionStates)
      .innerJoin(wordsT, eq(spacedRepetitionStates.wordId, wordsT.id))
      .innerJoin(languagesT, eq(wordsT.languageId, languagesT.id))
      .where(eq(spacedRepetitionStates.userId, user!.id));
    const states = stateRows.map((r) => ({
      word_id: r.word_id,
      words: {
        language_id: r.language_id,
        languages: { id: r.lang_id, name: r.lang_name, code: r.lang_code },
      },
    }));

    type LangAgg = {
      language: string; code: string;
      questions: number; correct: number;
      words: Set<string>; days: Set<string>; lastAt: string;
    };
    const byLang = new Map<string, LangAgg>();
    const allDays = new Set<string>();

    const ensure = (langId: string, name: string, code: string): LangAgg => {
      let e = byLang.get(langId);
      if (!e) {
        e = { language: name, code, questions: 0, correct: 0, words: new Set(), days: new Set(), lastAt: '' };
        byLang.set(langId, e);
      }
      return e;
    };

    (attempts ?? []).forEach((a: any) => {
      const w = a.words;
      const lang = w?.languages;
      if (!w?.language_id || !lang) return;
      const e = ensure(w.language_id, lang.name, lang.code);
      e.questions++;
      if (a.is_correct) e.correct++;
      if (a.created_at) {
        const day = new Date(a.created_at).toDateString();
        e.days.add(day);
        allDays.add(day);
        if (a.created_at > e.lastAt) e.lastAt = a.created_at;
      }
    });

    (states ?? []).forEach((s: any) => {
      const w = s.words;
      const lang = w?.languages;
      if (!w?.language_id || !lang) return;
      const e = ensure(w.language_id, lang.name, lang.code);
      e.words.add(s.word_id);
    });

    const languages = [...byLang.values()].map((l) => ({
      language: l.language,
      code: l.code,
      totalSessions: l.days.size, // distinct active days ≈ sessions
      totalWords: l.words.size,
      accuracy: l.questions > 0 ? (l.correct / l.questions) * 100 : 0,
      lastPracticed: l.lastAt || new Date().toISOString(),
      streak: streakFromDays(l.days),
      studyTime: Math.round(l.questions * 0.5), // ~30s per question
    }));

    const allAttempts = attempts?.length ?? 0;
    const allCorrect = (attempts ?? []).filter((a: any) => a.is_correct).length;

    const overview = {
      totalLanguages: languages.length,
      totalSessions: allDays.size,
      totalWords: states?.length ?? 0,
      overallAccuracy: allAttempts > 0 ? (allCorrect / allAttempts) * 100 : 0,
      currentStreak: streakFromDays(allDays),
      totalStudyTime: languages.reduce((sum, l) => sum + l.studyTime, 0),
    };

    return NextResponse.json({
      overview,
      languages: languages.sort(
        (a, b) => new Date(b.lastPracticed).getTime() - new Date(a.lastPracticed).getTime(),
      ),
    });
  } catch (error) {
    console.error('Error fetching dashboard overview:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
