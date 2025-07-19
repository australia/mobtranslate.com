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

    // Get words due for review
    const { data: dueWords, error: dueError } = await supabase
      .from('spaced_repetition_states')
      .select(`
        *,
        word:words!inner(
          id,
          word,
          language_id,
          definitions(id, definition),
          word_class:word_classes(name)
        )
      `)
      .eq('user_id', user.id)
      .eq('word.language_id', language.id)
      .lte('due_date', new Date().toISOString())
      .order('due_date')
      .limit(1);

    let selectedWord = null;
    let wordState = null;

    if (dueWords && dueWords.length > 0) {
      // Use the most overdue word
      wordState = dueWords[0];
      selectedWord = wordState.word;
    } else {
      // Get a new word
      const { data: existingWordIds } = await supabase
        .from('spaced_repetition_states')
        .select('word_id')
        .eq('user_id', user.id);

      const seenWordIds = existingWordIds?.map(s => s.word_id) || [];

      let newWordQuery = supabase
        .from('words')
        .select(`
          id,
          word,
          definitions(id, definition),
          word_class:word_classes(name)
        `)
        .eq('language_id', language.id);

      if (seenWordIds.length > 0) {
        newWordQuery = newWordQuery.not('id', 'in', `(${seenWordIds.join(',')})`);
      }

      const { data: newWords, error: newWordsError } = await newWordQuery.limit(1);

      if (newWordsError || !newWords || newWords.length === 0) {
        return NextResponse.json({ error: 'No words available' }, { status: 404 });
      }

      selectedWord = newWords[0];

      // Create initial state
      const { error: insertError } = await supabase
        .from('spaced_repetition_states')
        .insert({
          user_id: user.id,
          word_id: selectedWord.id,
          bucket: 0,
          ef: 2.5,
          interval_days: 0,
          due_date: new Date().toISOString()
        });

      if (insertError) {
        console.error('Error creating spaced repetition state:', insertError);
      }

      wordState = { bucket: 0 };
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
      wordClass: selectedWord.word_class?.name
    });

  } catch (error) {
    console.error('Error fetching next word:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}