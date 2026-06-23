import { NextRequest, NextResponse } from 'next/server';
import { desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import { requireUser } from '@/lib/auth-helpers';
import {
  languages as languagesT,
  quizAttempts,
  spacedRepetitionStates,
  words as wordsT,
} from '@/lib/db/schema';

export async function GET(_request: NextRequest) {
  const { user, response } = await requireUser();
  if (response) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  try {
    // Get all attempts for the user
    let attempts: Array<{ id: string; word_id: string; is_correct: boolean; response_time_ms: number; bucket_at_time: number | null; created_at: string }>;
    try {
      attempts = await db
        .select({
          id: quizAttempts.id,
          word_id: quizAttempts.wordId,
          is_correct: quizAttempts.isCorrect,
          response_time_ms: quizAttempts.responseTimeMs,
          bucket_at_time: quizAttempts.bucketAtTime,
          created_at: quizAttempts.createdAt,
        })
        .from(quizAttempts)
        .where(eq(quizAttempts.userId, user!.id))
        .orderBy(desc(quizAttempts.createdAt));
    } catch (attemptsError) {
      console.error('Error fetching attempts:', attemptsError);
      return NextResponse.json({ error: 'Failed to fetch attempts' }, { status: 500 });
    }

    // Get spaced repetition states
    let states: Array<{ word_id: string; bucket: number; streak: number; due_date: string }>;
    try {
      states = await db
        .select({
          word_id: spacedRepetitionStates.wordId,
          bucket: spacedRepetitionStates.bucket,
          streak: spacedRepetitionStates.streak,
          due_date: spacedRepetitionStates.dueDate,
        })
        .from(spacedRepetitionStates)
        .where(eq(spacedRepetitionStates.userId, user!.id));
    } catch (statesError) {
      console.error('Error fetching states:', statesError);
      return NextResponse.json({ error: 'Failed to fetch states' }, { status: 500 });
    }

    // Get word IDs from attempts and states
    const wordIdsSet = new Set<string>();
    attempts?.forEach(a => wordIdsSet.add(a.word_id));
    states?.forEach(s => wordIdsSet.add(s.word_id));
    const wordIds = Array.from(wordIdsSet);

    // Get word details
    const words = wordIds.length
      ? await db
          .select({ id: wordsT.id, word: wordsT.word, language_id: wordsT.languageId })
          .from(wordsT)
          .where(inArray(wordsT.id, wordIds))
      : [];

    // Get language details
    const languageIdsSet = new Set<string>();
    words?.forEach(w => languageIdsSet.add(w.language_id));
    const languageIds = Array.from(languageIdsSet);

    const languages = languageIds.length
      ? await db
          .select({ id: languagesT.id, code: languagesT.code, name: languagesT.name })
          .from(languagesT)
          .where(inArray(languagesT.id, languageIds))
      : [];

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