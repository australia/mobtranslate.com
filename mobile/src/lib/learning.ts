import * as SecureStore from 'expo-secure-store';
import type { BrowseWord } from './api';

export interface PracticeQuestion {
  entry: BrowseWord;
  choices: string[];
}

export interface PracticeProgress {
  lastCompletedDate?: string;
  streak: number;
  totalWords: number;
}

const EMPTY_PROGRESS: PracticeProgress = { streak: 0, totalWords: 0 };

/** A local calendar key. Practice should turn over at the learner's midnight,
 * not at UTC midnight (which is the middle of the day in much of Australia). */
export function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function stableOrder<T>(items: T[], seed: string, identify: (item: T) => string): T[] {
  return [...items].sort((a, b) => {
    const score = hashString(`${seed}:${identify(a)}`) - hashString(`${seed}:${identify(b)}`);
    return score || identify(a).localeCompare(identify(b));
  });
}

/** Choose a rotating page without pretending the dictionary has a curated
 * curriculum. The same language and local date always produce the same page. */
export function dailyPage(code: string, dateKey: string, totalPages: number): number {
  if (totalPages <= 1) return 1;
  return (hashString(`${code}:${dateKey}:page`) % totalPages) + 1;
}

/** Build five multiple-choice prompts entirely from real dictionary rows.
 * Duplicate headwords/meanings are removed so each choice stays meaningful. */
export function buildPracticeSession(
  rows: BrowseWord[],
  code: string,
  dateKey: string,
  questionCount = 5,
): PracticeQuestion[] {
  const seenWords = new Set<string>();
  const seenMeanings = new Set<string>();
  const usable = rows.filter((row) => {
    const word = row.word.trim().toLocaleLowerCase();
    const meaning = row.meaning.trim().toLocaleLowerCase();
    if (!row.id || !word || !meaning || seenWords.has(word) || seenMeanings.has(meaning)) return false;
    seenWords.add(word);
    seenMeanings.add(meaning);
    return true;
  });

  if (usable.length < Math.max(4, questionCount)) return [];
  const ordered = stableOrder(usable, `${code}:${dateKey}:questions`, (row) => row.id);
  const questions = ordered.slice(0, Math.min(questionCount, ordered.length));

  return questions.map((entry, index) => {
    const distractors = stableOrder(
      usable.filter((row) => row.id !== entry.id),
      `${code}:${dateKey}:choices:${entry.id}`,
      (row) => row.id,
    ).slice(0, 3).map((row) => row.meaning);
    const choices = stableOrder(
      [entry.meaning, ...distractors],
      `${code}:${dateKey}:choice-order:${index}`,
      (meaning) => meaning,
    );
    return { entry, choices };
  });
}

function progressKey(code: string): string {
  return `mt_practice_progress_v1_${code}`;
}

export async function readPracticeProgress(code: string): Promise<PracticeProgress> {
  try {
    const raw = await SecureStore.getItemAsync(progressKey(code));
    if (!raw) return EMPTY_PROGRESS;
    const parsed = JSON.parse(raw) as Partial<PracticeProgress>;
    return {
      lastCompletedDate: typeof parsed.lastCompletedDate === 'string' ? parsed.lastCompletedDate : undefined,
      streak: Number.isFinite(parsed.streak) ? Math.max(0, Number(parsed.streak)) : 0,
      totalWords: Number.isFinite(parsed.totalWords) ? Math.max(0, Number(parsed.totalWords)) : 0,
    };
  } catch {
    return EMPTY_PROGRESS;
  }
}

function calendarDayNumber(key: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return null;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86_400_000;
}

export function completedProgress(
  current: PracticeProgress,
  dateKey: string,
  wordsCompleted: number,
): PracticeProgress {
  if (current.lastCompletedDate === dateKey) return current;
  const currentDay = calendarDayNumber(dateKey);
  const previousDay = current.lastCompletedDate ? calendarDayNumber(current.lastCompletedDate) : null;
  const continued = currentDay !== null && previousDay !== null && currentDay - previousDay === 1;
  return {
    lastCompletedDate: dateKey,
    streak: continued ? current.streak + 1 : 1,
    totalWords: current.totalWords + wordsCompleted,
  };
}

export async function savePracticeProgress(code: string, progress: PracticeProgress): Promise<void> {
  try {
    await SecureStore.setItemAsync(progressKey(code), JSON.stringify(progress));
  } catch {
    // Practice continuity is helpful local state, never irreplaceable dictionary truth.
  }
}
