import { NextRequest, NextResponse } from 'next/server';
import { and, eq, inArray, ne } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import { requireUser } from '@/lib/auth-helpers';
import {
  definitions as definitionsT,
  languages as languagesT,
  spacedRepetitionStates,
  wordClasses as wordClassesT,
  words as wordsT,
} from '@/lib/db/schema';

export async function POST(request: NextRequest) {
  const { user, response } = await requireUser();
  if (response) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  try {
    const body = await request.json();
    const { languageCode } = body;

    // Get language
    const langRows = await db
      .select({ id: languagesT.id, code: languagesT.code, name: languagesT.name })
      .from(languagesT)
      .where(and(eq(languagesT.code, languageCode), eq(languagesT.isActive, true)))
      .limit(1);
    const language = langRows[0];

    if (!language) {
      return NextResponse.json({ error: 'Language not found' }, { status: 404 });
    }

    // Get all words for this language, with first definition + word class
    const wordRows = await db
      .select({ word: wordsT, wordClassName: wordClassesT.name })
      .from(wordsT)
      .leftJoin(wordClassesT, eq(wordsT.wordClassId, wordClassesT.id))
      .where(eq(wordsT.languageId, language.id));

    if (wordRows.length === 0) {
      return NextResponse.json({ error: 'No words available' }, { status: 404 });
    }

    const allWordIds = wordRows.map((r) => r.word.id);
    const allDefs = await db
      .select({ id: definitionsT.id, wordId: definitionsT.wordId, definition: definitionsT.definition })
      .from(definitionsT)
      .where(inArray(definitionsT.wordId, allWordIds));

    const defsByWord = new Map<string, { id: string; definition: string }[]>();
    for (const d of allDefs) {
      const arr = defsByWord.get(d.wordId) ?? [];
      arr.push({ id: d.id, definition: d.definition });
      defsByWord.set(d.wordId, arr);
    }

    const allWords = wordRows.map((r) => ({
      id: r.word.id,
      word: r.word.word,
      definitions: defsByWord.get(r.word.id) ?? [],
      word_class: r.wordClassName ? { name: r.wordClassName } : null,
    }));

    // Filter words with definitions
    const wordsWithDefinitions = allWords.filter(w => w.definitions && w.definitions.length > 0);

    if (wordsWithDefinitions.length === 0) {
      return NextResponse.json({ error: 'No words with definitions available' }, { status: 404 });
    }

    // Select a random word
    const randomIndex = Math.floor(Math.random() * wordsWithDefinitions.length);
    const selectedWord = wordsWithDefinitions[randomIndex];

    // Check if we have a state for this word
    const existingStateRows = await db
      .select()
      .from(spacedRepetitionStates)
      .where(
        and(
          eq(spacedRepetitionStates.userId, user!.id),
          eq(spacedRepetitionStates.wordId, selectedWord.id)
        )
      )
      .limit(1);

    let wordState: { bucket: number } | undefined = existingStateRows[0];

    if (!wordState) {
      // Create initial state
      try {
        const [newState] = await db
          .insert(spacedRepetitionStates)
          .values({
            userId: user!.id,
            wordId: selectedWord.id,
            bucket: 0,
            ef: 2.5,
            intervalDays: 0,
            dueDate: new Date().toISOString()
          })
          .returning();
        wordState = newState;
      } catch (insertError) {
        console.error('Error creating spaced repetition state:', insertError);
      }

      wordState = wordState || { bucket: 0 };
    }

    if (!selectedWord || !selectedWord.definitions || selectedWord.definitions.length === 0) {
      return NextResponse.json({ error: 'No valid word found' }, { status: 404 });
    }

    const correctAnswer = selectedWord.definitions[0].definition;

    // Get distractors
    const distractorWordRows = await db
      .select({ id: wordsT.id })
      .from(wordsT)
      .where(and(eq(wordsT.languageId, language.id), ne(wordsT.id, selectedWord.id)))
      .limit(10);

    const distractorDefs = distractorWordRows.length
      ? await db
          .select({ wordId: definitionsT.wordId, definition: definitionsT.definition })
          .from(definitionsT)
          .where(inArray(definitionsT.wordId, distractorWordRows.map((d) => d.id)))
      : [];

    const firstDefByWord = new Map<string, string>();
    for (const d of distractorDefs) {
      if (!firstDefByWord.has(d.wordId)) firstDefByWord.set(d.wordId, d.definition);
    }

    const availableDistractors = (distractorWordRows
      .map((d) => firstDefByWord.get(d.id))
      .filter(Boolean) as string[])
      .filter((def) => def !== correctAnswer);

    // Shuffle and select 3 distractors
    const shuffled = availableDistractors.sort(() => Math.random() - 0.5);
    const selectedDistractors = shuffled.slice(0, 3);

    // Pad if needed
    while (selectedDistractors.length < 3) {
      selectedDistractors.push(`Alternative meaning ${selectedDistractors.length + 1}`);
    }

    // Create choices array with correct answer at random position
    const choices = [correctAnswer, ...selectedDistractors];
    const shuffledChoices = choices.sort(() => Math.random() - 0.5);
    const correctIndex = shuffledChoices.indexOf(correctAnswer);

    return NextResponse.json({
      id: `${selectedWord.id}-${Date.now()}`,
      wordId: selectedWord.id,
      word: selectedWord.word,
      meaning: correctAnswer,
      choices: shuffledChoices,
      correctIndex: correctIndex,
      bucket: wordState.bucket || 0,
      wordClass: selectedWord.word_class?.name
    });
  } catch (error) {
    console.error('Error fetching next word:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
