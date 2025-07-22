import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { SpacedRepetitionEngine } from '@/lib/quiz/spacedRepetition';

export async function POST(request: NextRequest) {
  const supabase = createClient();

  // Check authentication
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { 
      languageCode, 
      sessionSize = 20, 
      timeLimit = 3000,
      includeAudio = false 
    } = body;

    // Get language
    const { data: language, error: langError } = await supabase
      .from('languages')
      .select('id, code, name')
      .eq('code', languageCode)
      .eq('is_active', true)
      .single();

    if (langError || !language) {
      console.error('Language lookup error:', { languageCode, langError });
      return NextResponse.json({ error: 'Language not found or not active' }, { status: 404 });
    }

    console.log('Creating quiz session for language:', { 
      languageId: language.id, 
      languageCode: language.code,
      languageName: language.name 
    });

    // Get user's spaced repetition states for this language
    const { data: states, error: statesError } = await supabase
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
      .lte('due_date', new Date().toISOString());

    if (statesError) {
      console.error('Error fetching spaced repetition states:', statesError);
      return NextResponse.json({ error: 'Failed to fetch user progress' }, { status: 500 });
    }

    // If user has no states yet, create initial states for new words
    let wordPool = states || [];
    
    console.log('Current word pool size:', wordPool.length, 'Session size:', sessionSize);
    
    if (wordPool.length < sessionSize) {
      // Get some new words to fill the session
      const existingWordIds = wordPool.map((s: any) => s.word_id);
      
      let newWordsQuery = supabase
        .from('words')
        .select(`
          id,
          word,
          definitions(id, definition),
          word_class:word_classes(name)
        `)
        .eq('language_id', language.id);
      
      // Only add the NOT IN clause if we have existing word IDs
      if (existingWordIds.length > 0) {
        newWordsQuery = newWordsQuery.not('id', 'in', `(${existingWordIds.join(',')})`);
      }
      
      const { data: newWords, error: newWordsError } = await newWordsQuery
        .limit(sessionSize - wordPool.length);

      if (newWordsError) {
        console.error('Error fetching new words:', { 
          languageId: language.id, 
          languageCode: language.code,
          existingWordIds: existingWordIds.length,
          error: newWordsError 
        });
        return NextResponse.json({ error: 'Failed to fetch words from database' }, { status: 500 });
      }
      
      console.log('New words fetched:', newWords?.length || 0);

      // Create initial states for new words
      if (newWords && newWords.length > 0) {
        const newStates = newWords.map((word: any) => ({
          user_id: user.id,
          word_id: word.id,
          bucket: 0,
          ef: 2.5,
          interval_days: 0,
          due_date: new Date().toISOString(),
          total_attempts: 0,
          correct_attempts: 0,
          streak: 0,
          word: word
        }));

        // Insert new states
        const { error: insertError } = await supabase
          .from('spaced_repetition_states')
          .insert(newStates.map(s => ({
            user_id: s.user_id,
            word_id: s.word_id,
            bucket: s.bucket,
            ef: s.ef,
            interval_days: s.interval_days,
            due_date: s.due_date
          })));

        if (insertError) {
          console.error('Error creating new spaced repetition states:', insertError);
          // Continue anyway - we can still run the quiz with the words we have
        }
        
        // Add new words to the pool regardless of insertion success
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

        // Get distractors from same language and word class
        const { data: distractors, error: distractorsError } = await supabase
          .from('words')
          .select(`
            definitions(definition)
          `)
          .eq('language_id', language.id)
          .neq('id', wordId)
          .limit(10);

        if (distractorsError) {
          console.error('Error fetching distractors:', distractorsError);
        }

        // Create choice list
        const availableDistractors = (distractors || [])
          .map((d: any) => d.definitions?.[0]?.definition)
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

    console.log('Session words prepared:', {
      selectedWordIds: selectedWordIds.length,
      sessionWords: sessionWords.length,
      validWords: validWords.length,
      firstWord: validWords[0]
    });

    // Check if we have any valid words
    if (validWords.length === 0) {
      console.error('No valid words found for session:', {
        languageId: language.id,
        languageCode: language.code,
        wordPoolLength: wordPool.length,
        sessionSize
      });
      return NextResponse.json({ 
        error: 'No words available for this language. Please check if the language has dictionary data.' 
      }, { status: 404 });
    }

    // Create quiz session record
    const { data: session, error: sessionError } = await supabase
      .from('quiz_sessions')
      .insert({
        user_id: user.id,
        language_id: language.id,
        session_size: validWords.length,
        time_limit_ms: timeLimit
      })
      .select('id')
      .single();

    if (sessionError) {
      console.error('Error creating quiz session:', sessionError);
      return NextResponse.json({ error: 'Failed to create session' }, { status: 500 });
    }

    return NextResponse.json({
      sessionId: session.id,
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