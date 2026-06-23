import { NextRequest, NextResponse } from 'next/server';
import { and, eq, inArray, lte, ne, notInArray } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import { requireUser } from '@/lib/auth-helpers';
import {
  definitions as definitionsT,
  languages as languagesT,
  quizSessions as quizSessionsT,
  spacedRepetitionStates,
  wordClasses as wordClassesT,
  words as wordsT,
} from '@/lib/db/schema';
import { SpacedRepetitionEngine } from '@/lib/quiz/spacedRepetition';

// Hydrate a set of words with their first definition + word class name, in the
// `{ id, word, definitions: [{id, definition}], word_class: { name } }` shape the
// session builder expects (mirrors the old nested Supabase select).
async function hydrateWords(wordIds: string[]) {
  if (wordIds.length === 0) return new Map<string, any>();
  const [wordRows, defRows] = await Promise.all([
    db
      .select({ word: wordsT, wordClassName: wordClassesT.name })
      .from(wordsT)
      .leftJoin(wordClassesT, eq(wordsT.wordClassId, wordClassesT.id))
      .where(inArray(wordsT.id, wordIds)),
    db
      .select({ id: definitionsT.id, wordId: definitionsT.wordId, definition: definitionsT.definition })
      .from(definitionsT)
      .where(inArray(definitionsT.wordId, wordIds)),
  ]);

  const defsByWord = new Map<string, { id: string; definition: string }[]>();
  for (const d of defRows) {
    const arr = defsByWord.get(d.wordId) ?? [];
    arr.push({ id: d.id, definition: d.definition });
    defsByWord.set(d.wordId, arr);
  }

  const map = new Map<string, any>();
  for (const r of wordRows) {
    map.set(r.word.id, {
      id: r.word.id,
      word: r.word.word,
      language_id: r.word.languageId,
      definitions: defsByWord.get(r.word.id) ?? [],
      word_class: r.wordClassName ? { name: r.wordClassName } : null,
    });
  }
  return map;
}

export async function POST(request: NextRequest) {
  const { user, response } = await requireUser();
  if (response) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  try {
    const body = await request.json();
    const {
      languageCode,
      sessionSize = 20,
      timeLimit = 3000,
      includeAudio = false
    } = body;

    // Get language
    const langRows = await db
      .select({ id: languagesT.id, code: languagesT.code, name: languagesT.name })
      .from(languagesT)
      .where(and(eq(languagesT.code, languageCode), eq(languagesT.isActive, true)))
      .limit(1);
    const language = langRows[0];

    if (!language) {
      return NextResponse.json({ error: 'Language not found or not active' }, { status: 404 });
    }

    // Get the user's due spaced repetition states for words in this language.
    const dueStateRows = await db
      .select({ state: spacedRepetitionStates, wordLanguageId: wordsT.languageId })
      .from(spacedRepetitionStates)
      .innerJoin(wordsT, eq(spacedRepetitionStates.wordId, wordsT.id))
      .where(
        and(
          eq(spacedRepetitionStates.userId, user!.id),
          eq(wordsT.languageId, language.id),
          lte(spacedRepetitionStates.dueDate, new Date().toISOString())
        )
      );

    const dueWordIds = dueStateRows.map((r) => r.state.wordId);
    const dueWordMap = await hydrateWords(dueWordIds);

    // Build the initial word pool from existing states (snake_case-ish shape that
    // the rest of this handler consumes, matching the old Supabase row shape).
    let wordPool: any[] = dueStateRows.map((r) => ({
      ...r.state,
      user_id: r.state.userId,
      word_id: r.state.wordId,
      interval_days: r.state.intervalDays,
      due_date: r.state.dueDate,
      last_seen: r.state.lastSeen,
      total_attempts: r.state.totalAttempts,
      correct_attempts: r.state.correctAttempts,
      word: dueWordMap.get(r.state.wordId),
    }));

    if (wordPool.length < sessionSize) {
      // Get some new words to fill the session
      const existingWordIds = wordPool.map((s: any) => s.word_id);

      const newWordRows = await db
        .select({ id: wordsT.id })
        .from(wordsT)
        .where(
          existingWordIds.length > 0
            ? and(
                eq(wordsT.languageId, language.id),
                notInArray(wordsT.id, existingWordIds)
              )
            : eq(wordsT.languageId, language.id)
        )
        .limit(sessionSize - wordPool.length);

      const newWordIds = newWordRows.map((w) => w.id);
      if (newWordIds.length > 0) {
        const newWordMap = await hydrateWords(newWordIds);

        const newStates = newWordIds.map((wordId) => ({
          user_id: user!.id,
          word_id: wordId,
          bucket: 0,
          ef: 2.5,
          interval_days: 0,
          due_date: new Date().toISOString(),
          total_attempts: 0,
          correct_attempts: 0,
          streak: 0,
          word: newWordMap.get(wordId)
        }));

        // Insert new states (ignore failures — we can still run the quiz)
        try {
          await db.insert(spacedRepetitionStates).values(
            newStates.map((s) => ({
              userId: s.user_id,
              wordId: s.word_id,
              bucket: s.bucket,
              ef: s.ef,
              intervalDays: s.interval_days,
              dueDate: s.due_date
            }))
          );
        } catch (insertError) {
          console.error('Error creating new spaced repetition states:', insertError);
        }

        wordPool = [...wordPool, ...newStates];
      }
    }

    // Select words for this session using spaced repetition algorithm
    const spacedStates = wordPool.map((state: any) => ({
      id: state.id,
      userId: state.user_id,
      wordId: state.word_id,
      bucket: state.bucket,
      ef: state.ef,
      intervalDays: state.interval_days,
      dueDate: new Date(state.due_date),
      lastSeen: state.last_seen ? new Date(state.last_seen) : null,
      totalAttempts: state.total_attempts,
      correctAttempts: state.correct_attempts,
      streak: state.streak
    }));

    const selectedWordIds = SpacedRepetitionEngine.selectWordsForSession(
      spacedStates,
      Math.min(sessionSize, wordPool.length)
    );

    // Get full word data for selected words with distractors
    const sessionWords = await Promise.all(
      selectedWordIds.map(async (wordId) => {
        const wordState = wordPool.find((s: any) => s.word_id === wordId);
        if (!wordState) return null;

        const word = wordState.word;
        const correctAnswer = word.definitions?.[0]?.definition || 'No definition available';

        // Get distractors from same language
        const distractorRows = await db
          .select({ id: wordsT.id })
          .from(wordsT)
          .where(and(eq(wordsT.languageId, language.id), ne(wordsT.id, wordId)))
          .limit(10);

        const distractorWordMap = await hydrateWords(distractorRows.map((d) => d.id));

        // Create choice list
        const availableDistractors = distractorRows
          .map((d) => distractorWordMap.get(d.id)?.definitions?.[0]?.definition)
          .filter(Boolean)
          .filter((def: string) => def !== correctAnswer);

        // Randomly select 3 distractors
        const shuffledDistractors = SpacedRepetitionEngine.shuffleArray(availableDistractors);
        const selectedDistractors = shuffledDistractors.slice(0, 3);

        // If not enough unique distractors, pad with generic ones
        while (selectedDistractors.length < 3) {
          selectedDistractors.push(`Alternative meaning ${selectedDistractors.length + 1}`);
        }

        const choices = [correctAnswer, ...selectedDistractors];
        const shuffledChoices = SpacedRepetitionEngine.shuffleArray(choices);
        const correctIndex = shuffledChoices.indexOf(correctAnswer);

        return {
          id: `${wordId}-${Date.now()}`,
          wordId: wordId,
          word: word.word,
          meaning: correctAnswer,
          audioUrl: includeAudio ? `/api/audio/${wordId}` : undefined,
          choices: shuffledChoices,
          correctIndex: correctIndex,
          bucket: wordState.bucket,
          timeLimit: timeLimit,
          wordClass: word.word_class?.name
        };
      })
    );

    const validWords = sessionWords.filter(Boolean);

    // Check if we have any valid words
    if (validWords.length === 0) {
      return NextResponse.json({
        error: 'No words available for this language. Please check if the language has dictionary data.'
      }, { status: 404 });
    }

    // Create quiz session record
    let session: { id: string } | undefined;
    try {
      const inserted = await db
        .insert(quizSessionsT)
        .values({
          userId: user!.id,
          languageId: language.id,
          sessionSize: validWords.length,
          timeLimitMs: timeLimit
        })
        .returning({ id: quizSessionsT.id });
      session = inserted[0];
    } catch (sessionError) {
      console.error('Error creating quiz session:', sessionError);
      return NextResponse.json({ error: 'Failed to create session' }, { status: 500 });
    }

    return NextResponse.json({
      sessionId: session!.id,
      language: {
        code: language.code,
        name: language.name
      },
      words: validWords,
      settings: {
        sessionSize: validWords.length,
        timeLimit: timeLimit
      }
    });
  } catch (error) {
    console.error('Error creating quiz session:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
