import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(_request: NextRequest) {
  const supabase = createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    // Get all attempts for the user
    const { data: attempts, error: attemptsError } = await supabase
      .from('quiz_attempts')
      .select(`
        id,
        word_id,
        is_correct,
        response_time_ms,
        bucket_at_time,
        created_at
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (attemptsError) {
      console.error('Error fetching attempts:', attemptsError);
      return NextResponse.json({ error: 'Failed to fetch attempts' }, { status: 500 });
    }

    // Get spaced repetition states
    const { data: states, error: statesError } = await supabase
      .from('spaced_repetition_states')
      .select(`
        word_id,
        bucket,
        streak,
        due_date
      `)
      .eq('user_id', user.id);

    if (statesError) {
      console.error('Error fetching states:', statesError);
      return NextResponse.json({ error: 'Failed to fetch states' }, { status: 500 });
    }

    // Get word IDs from attempts and states
    const wordIds = new Set<string>();
    attempts?.forEach(a => wordIds.add(a.word_id));
    states?.forEach(s => wordIds.add(s.word_id));

    // Get word details
    const { data: words } = await supabase
      .from('words')
      .select('id, word, language_id')
      .in('id', Array.from(wordIds));

    // Get language details
    const languageIds = new Set<string>();
    words?.forEach(w => languageIds.add(w.language_id));

    const { data: languages } = await supabase
      .from('languages')
      .select('id, code, name')
      .in('id', Array.from(languageIds));

    // Create lookup maps
    const wordMap = new Map(words?.map(w => [w.id, w]) || []);
    const languageMap = new Map(languages?.map(l => [l.id, l]) || []);

    // Calculate overall stats
    const totalAttempts = attempts?.length || 0;
    const correctAttempts = attempts?.filter(a => a.is_correct).length || 0;
    const overallAccuracy = totalAttempts > 0 ? (correctAttempts / totalAttempts * 100) : 0;

    // Calculate last 7 and 30 days performance
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const last7DaysAttempts = attempts?.filter(a => new Date(a.created_at) >= sevenDaysAgo) || [];
    const last30DaysAttempts = attempts?.filter(a => new Date(a.created_at) >= thirtyDaysAgo) || [];

    // Calculate streak
    const attemptDates = new Set(
      attempts?.map(a => new Date(a.created_at).toDateString()) || []
    );
    
    let streakDays = 0;
    const today = new Date();
    for (let i = 0; i < 365; i++) {
      const checkDate = new Date(today.getTime() - i * 24 * 60 * 60 * 1000).toDateString();
      if (attemptDates.has(checkDate)) {
        streakDays++;
      } else if (i > 0) {
        break;
      }
    }

    // Group by language
    const languageStats = new Map();
    
    // Process attempts by language
    attempts?.forEach(attempt => {
      const word = wordMap.get(attempt.word_id);
      if (!word) return;
      
      const language = languageMap.get(word.language_id);
      if (!language) return;
      
      const langCode = language.code;
      const langName = language.name;
      
      if (!languageStats.has(langCode)) {
        languageStats.set(langCode, {
          code: langCode,
          name: langName,
          attempts: 0,
          correct: 0,
          words: new Set()
        });
      }
      
      const stats = languageStats.get(langCode);
      stats.attempts++;
      if (attempt.is_correct) stats.correct++;
      stats.words.add(attempt.word_id);
    });

    // Add state data to language stats
    states?.forEach(state => {
      const word = wordMap.get(state.word_id);
      if (!word) return;
      
      const language = languageMap.get(word.language_id);
      if (!language) return;
      
      const langCode = language.code;
      const langName = language.name;
      
      if (!languageStats.has(langCode)) {
        languageStats.set(langCode, {
          code: langCode,
          name: langName,
          attempts: 0,
          correct: 0,
          words: new Set()
        });
      }
      
      const stats = languageStats.get(langCode);
      stats.words.add(state.word_id);
      
      // Count mastered words (bucket 5)
      if (!stats.mastered) stats.mastered = 0;
      if (state.bucket === 5) stats.mastered++;
      
      // Count due words
      if (!stats.due) stats.due = 0;
      if (new Date(state.due_date) <= now) stats.due++;
    });

    // Convert to array
    const languageStatsArray = Array.from(languageStats.values()).map(lang => ({
      code: lang.code,
      name: lang.name,
      totalWords: lang.words.size,
      attempts: lang.attempts,
      correct: lang.correct,
      accuracy: lang.attempts > 0 ? (lang.correct / lang.attempts * 100) : 0,
      mastered: lang.mastered || 0,
      due: lang.due || 0
    }));

    // Calculate total unique words across all languages
    const totalUniqueWords = new Set(states?.map(s => s.word_id) || []).size;
    const masteredWords = states?.filter(s => s.bucket === 5).length || 0;
    const dueWords = states?.filter(s => new Date(s.due_date) <= now).length || 0;

    return NextResponse.json({
      overall: {
        totalWords: totalUniqueWords,
        masteredWords,
        dueWords,
        totalAttempts,
        correctAttempts,
        accuracy: overallAccuracy,
        streakDays
      },
      recent: {
        last7Days: {
          attempts: last7DaysAttempts.length,
          correct: last7DaysAttempts.filter(a => a.is_correct).length,
          accuracy: last7DaysAttempts.length > 0 
            ? (last7DaysAttempts.filter(a => a.is_correct).length / last7DaysAttempts.length * 100) 
            : 0
        },
        last30Days: {
          attempts: last30DaysAttempts.length,
          correct: last30DaysAttempts.filter(a => a.is_correct).length,
          accuracy: last30DaysAttempts.length > 0 
            ? (last30DaysAttempts.filter(a => a.is_correct).length / last30DaysAttempts.length * 100) 
            : 0
        }
      },
      languages: languageStatsArray,
      recentAttempts: attempts?.slice(0, 20).map(a => {
        const word = wordMap.get(a.word_id);
        const language = word ? languageMap.get(word.language_id) : null;
        return {
          word: word?.word || 'Unknown',
          language: language?.name || 'Unknown',
          isCorrect: a.is_correct,
          responseTime: a.response_time_ms,
          date: a.created_at
        };
      }) || []
    });

  } catch (error) {
    console.error('Error fetching stats:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}