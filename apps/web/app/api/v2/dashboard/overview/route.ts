import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const supabase = createClient();

  // Check authentication
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    console.log('[Overview API] Fetching data for user:', user.id);
    
    // Get all quiz sessions grouped by language
    const { data: sessions, error: sessionsError } = await supabase
      .from('quiz_sessions')
      .select(`
        id,
        language_id,
        total_questions,
        correct_answers,
        accuracy_percentage,
        streak,
        avg_response_time_ms,
        created_at,
        completed_at,
        languages(id, name, code)
      `)
      .eq('user_id', user.id)
      .not('completed_at', 'is', null)
      .order('created_at', { ascending: false });

    if (sessionsError) {
      console.error('Error fetching sessions:', sessionsError);
      return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 });
    }
    
    console.log('[Overview API] Sessions found:', sessions?.length || 0);

    // Get unique word counts per language with language info
    const { data: wordCounts, error: wordCountError } = await supabase
      .from('spaced_repetition_states')
      .select(`
        word_id,
        bucket,
        words!inner(
          language_id,
          languages(id, name, code)
        )
      `)
      .eq('user_id', user.id);

    if (wordCountError) {
      console.error('Error fetching word counts:', wordCountError);
    }
    
    console.log('[Overview API] Word states found:', wordCounts?.length || 0);
    console.log('[Overview API] Sample word state:', wordCounts?.[0]);

    // Process data by language
    const languageMap = new Map<string, {
      language: string;
      code: string;
      totalSessions: number;
      totalWords: number;
      totalQuestions: number;
      totalCorrect: number;
      lastPracticed: string;
      bestStreak: number;
      totalTime: number;
    }>();

    // Process sessions
    sessions?.forEach(session => {
      if (!session.languages) return;
      
      const langId = session.language_id;
      const existing = languageMap.get(langId) || {
        language: session.languages.name,
        code: session.languages.code,
        totalSessions: 0,
        totalWords: 0,
        totalQuestions: 0,
        totalCorrect: 0,
        lastPracticed: session.created_at,
        bestStreak: 0,
        totalTime: 0
      };

      const sessionDuration = session.completed_at && session.created_at
        ? Math.round((new Date(session.completed_at).getTime() - new Date(session.created_at).getTime()) / (1000 * 60))
        : (session.total_questions || 0) * 0.5; // Estimate 30 seconds per question

      languageMap.set(langId, {
        ...existing,
        totalSessions: existing.totalSessions + 1,
        totalQuestions: existing.totalQuestions + (session.total_questions || 0),
        totalCorrect: existing.totalCorrect + (session.correct_answers || 0),
        lastPracticed: session.created_at > existing.lastPracticed ? session.created_at : existing.lastPracticed,
        bestStreak: Math.max(existing.bestStreak, session.streak || 0),
        totalTime: existing.totalTime + sessionDuration
      });
    });

    // Count unique words per language
    const wordsByLanguage = new Map<string, Set<string>>();
    
    wordCounts?.forEach(state => {
      if (state.words?.languages && state.words.language_id) {
        const langId = state.words.language_id;
        const langInfo = state.words.languages;
        
        // Create language entry if it doesn't exist (for users who have words but no sessions)
        if (!languageMap.has(langId)) {
          languageMap.set(langId, {
            language: langInfo.name,
            code: langInfo.code,
            totalSessions: 0,
            totalWords: 0,
            totalQuestions: 0,
            totalCorrect: 0,
            lastPracticed: new Date().toISOString(), // Will be updated if sessions exist
            bestStreak: 0,
            totalTime: 0
          });
        }
        
        // Track unique words per language
        if (!wordsByLanguage.has(langId)) {
          wordsByLanguage.set(langId, new Set());
        }
        wordsByLanguage.get(langId)!.add(state.word_id);
      }
    });
    
    // Update word counts in language stats
    wordsByLanguage.forEach((words, langId) => {
      const langStats = languageMap.get(langId);
      if (langStats) {
        langStats.totalWords = words.size;
      }
    });

    // Convert to array and calculate current streaks
    console.log('[Overview API] Languages found:', languageMap.size);
    languageMap.forEach((lang, id) => {
      console.log(`[Overview API] Language ${id}:`, lang);
    });
    
    const languageStats = Array.from(languageMap.values()).map(lang => ({
      language: lang.language,
      code: lang.code,
      totalSessions: lang.totalSessions,
      totalWords: lang.totalWords,
      accuracy: lang.totalQuestions > 0 ? (lang.totalCorrect / lang.totalQuestions) * 100 : 0,
      lastPracticed: lang.lastPracticed,
      streak: calculateStreakForLanguage(sessions || [], lang.code),
      studyTime: lang.totalTime
    }));

    // Calculate overall stats
    const totalQuestions = sessions?.reduce((sum, s) => sum + (s.total_questions || 0), 0) || 0;
    const totalCorrect = sessions?.reduce((sum, s) => sum + (s.correct_answers || 0), 0) || 0;
    const overallAccuracy = totalQuestions > 0 ? (totalCorrect / totalQuestions) * 100 : 0;
    
    const overviewStats = {
      totalLanguages: languageStats.length,
      totalSessions: sessions?.length || 0,
      totalWords: wordCounts?.length || 0,
      overallAccuracy,
      currentStreak: calculateOverallStreak(sessions || []),
      totalStudyTime: languageStats.reduce((sum, lang) => sum + lang.studyTime, 0)
    };

    return NextResponse.json({
      overview: overviewStats,
      languages: languageStats.sort((a, b) => 
        new Date(b.lastPracticed).getTime() - new Date(a.lastPracticed).getTime()
      )
    });

  } catch (error) {
    console.error('Error fetching dashboard overview:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function calculateStreakForLanguage(sessions: any[], languageCode: string): number {
  const langSessions = sessions.filter(s => s.languages?.code === languageCode);
  if (!langSessions.length) return 0;
  
  // Group sessions by date
  const sessionsByDate = new Map<string, any[]>();
  langSessions.forEach(session => {
    const date = new Date(session.created_at).toDateString();
    if (!sessionsByDate.has(date)) {
      sessionsByDate.set(date, []);
    }
    sessionsByDate.get(date)!.push(session);
  });

  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toDateString();
  
  let streak = 0;
  let checkDate = new Date();
  
  // Start from today or yesterday if user practiced
  if (!sessionsByDate.has(today) && !sessionsByDate.has(yesterday)) {
    return 0;
  }
  
  if (!sessionsByDate.has(today)) {
    checkDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
  }
  
  // Count consecutive days with sessions
  while (sessionsByDate.has(checkDate.toDateString())) {
    streak++;
    checkDate = new Date(checkDate.getTime() - 24 * 60 * 60 * 1000);
  }
  
  return streak;
}

function calculateOverallStreak(sessions: any[]): number {
  if (!sessions.length) return 0;
  
  // Group sessions by date
  const sessionsByDate = new Map<string, any[]>();
  sessions.forEach(session => {
    const date = new Date(session.created_at).toDateString();
    if (!sessionsByDate.has(date)) {
      sessionsByDate.set(date, []);
    }
    sessionsByDate.get(date)!.push(session);
  });

  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toDateString();
  
  let streak = 0;
  let checkDate = new Date();
  
  // Start from today or yesterday if user practiced
  if (!sessionsByDate.has(today) && !sessionsByDate.has(yesterday)) {
    return 0;
  }
  
  if (!sessionsByDate.has(today)) {
    checkDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
  }
  
  // Count consecutive days with sessions
  while (sessionsByDate.has(checkDate.toDateString())) {
    streak++;
    checkDate = new Date(checkDate.getTime() - 24 * 60 * 60 * 1000);
  }
  
  return streak;
}