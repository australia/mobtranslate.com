import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  const supabase = createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { languageCode } = body;

    // Get language
    const { data: language, error: langError } = await supabase
      .from('languages')
      .select('id, code, name')
      .eq('code', languageCode)
      .eq('is_active', true)
      .single();

    if (langError || !language) {
      return NextResponse.json({ error: 'Language not found' }, { status: 404 });
    }

    // Get all words for this language
    const { data: allWords, error: wordsError } = await supabase
      .from('words')
      .select(`
        id,
        word,
        definitions(id, definition),
        word_class:word_classes(name)
      `)
      .eq('language_id', language.id);

    if (wordsError || !allWords || allWords.length === 0) {
      return NextResponse.json({ error: 'No words available' }, { status: 404 });
    }

    // Filter words with definitions
    const wordsWithDefinitions = allWords.filter(w => w.definitions && w.definitions.length > 0);
    
    if (wordsWithDefinitions.length === 0) {
      return NextResponse.json({ error: 'No words with definitions available' }, { status: 404 });
    }

    // Select a random word
    const randomIndex = Math.floor(Math.random() * wordsWithDefinitions.length);
    const selectedWord = wordsWithDefinitions[randomIndex];

    // Check if we have a state for this word
    const { data: existingState } = await supabase
      .from('spaced_repetition_states')
      .select('*')
      .eq('user_id', user.id)
      .eq('word_id', selectedWord.id)
      .single();

    let wordState = existingState;

    if (!wordState) {
      // Create initial state
      const { data: newState, error: insertError } = await supabase
        .from('spaced_repetition_states')
        .insert({
          user_id: user.id,
          word_id: selectedWord.id,
          bucket: 0,
          ef: 2.5,
          interval_days: 0,
          due_date: new Date().toISOString()
        })
        .select()
        .single();

      if (insertError) {
        console.error('Error creating spaced repetition state:', insertError);
      }

      wordState = newState || { bucket: 0 };
    }

    if (!selectedWord || !selectedWord.definitions || selectedWord.definitions.length === 0) {
      return NextResponse.json({ error: 'No valid word found' }, { status: 404 });
    }

    const correctAnswer = selectedWord.definitions[0].definition;

    // Get distractors
    const { data: distractors } = await supabase
      .from('words')
      .select('definitions(definition)')
      .eq('language_id', language.id)
      .neq('id', selectedWord.id)
      .limit(10);

    const availableDistractors = (distractors || [])
      .map((d: any) => d.definitions?.[0]?.definition)
      .filter(Boolean)
      .filter((def: string) => def !== correctAnswer);

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
      wordClass: (selectedWord.word_class as any)?.name
    });

  } catch (error) {
    console.error('Error fetching next word:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}