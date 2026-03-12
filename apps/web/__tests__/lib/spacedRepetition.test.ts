import { describe, it, expect } from 'vitest';
import {
  SpacedRepetitionEngine,
  SpacedRepetitionState,
  QuizAttempt,
} from '@/lib/quiz/spacedRepetition';

// Helper to create a default state
function makeState(overrides: Partial<SpacedRepetitionState> = {}): SpacedRepetitionState {
  return {
    id: 'state-1',
    userId: 'user-1',
    wordId: 'word-1',
    bucket: 0,
    ef: 2.5,
    intervalDays: 0,
    dueDate: new Date(),
    lastSeen: null,
    totalAttempts: 0,
    correctAttempts: 0,
    streak: 0,
    ...overrides,
  };
}

function makeAttempt(overrides: Partial<QuizAttempt> = {}): QuizAttempt {
  return {
    wordId: 'word-1',
    isCorrect: true,
    responseTimeMs: 1000,
    selectedAnswer: 'answer',
    correctAnswer: 'answer',
    distractors: ['wrong1', 'wrong2'],
    ...overrides,
  };
}

// ─── calculateQuality ───────────────────────────────────────────────────────

describe('SpacedRepetitionEngine.calculateQuality', () => {
  it('returns 2 for incorrect answers regardless of speed', () => {
    expect(SpacedRepetitionEngine.calculateQuality(false, 100)).toBe(2);
    expect(SpacedRepetitionEngine.calculateQuality(false, 5000)).toBe(2);
    expect(SpacedRepetitionEngine.calculateQuality(false, 0)).toBe(2);
  });

  it('returns 5 for correct answer with very fast response (<=50% of time limit)', () => {
    expect(SpacedRepetitionEngine.calculateQuality(true, 1000, 3000)).toBe(5);
    expect(SpacedRepetitionEngine.calculateQuality(true, 1500, 3000)).toBe(5);
    expect(SpacedRepetitionEngine.calculateQuality(true, 0, 3000)).toBe(5);
  });

  it('returns 4 for correct answer with medium speed (50%-80% of time limit)', () => {
    expect(SpacedRepetitionEngine.calculateQuality(true, 1800, 3000)).toBe(4);
    expect(SpacedRepetitionEngine.calculateQuality(true, 2400, 3000)).toBe(4);
  });

  it('returns 3 for correct answer with slow response (>80% of time limit)', () => {
    expect(SpacedRepetitionEngine.calculateQuality(true, 2500, 3000)).toBe(3);
    expect(SpacedRepetitionEngine.calculateQuality(true, 3000, 3000)).toBe(3);
  });

  it('uses default timeLimit of 3000 when not provided', () => {
    // 1500 / 3000 = 0.5 => quality 5
    expect(SpacedRepetitionEngine.calculateQuality(true, 1500)).toBe(5);
    // 2100 / 3000 = 0.7 => quality 4
    expect(SpacedRepetitionEngine.calculateQuality(true, 2100)).toBe(4);
    // 2700 / 3000 = 0.9 => quality 3
    expect(SpacedRepetitionEngine.calculateQuality(true, 2700)).toBe(3);
  });

  it('clamps speedRatio to max 1 for responses exceeding time limit', () => {
    // responseTimeMs > timeLimit should still return 3 (slow correct)
    expect(SpacedRepetitionEngine.calculateQuality(true, 10000, 3000)).toBe(3);
  });

  it('handles custom time limits', () => {
    // 500 / 1000 = 0.5 => quality 5
    expect(SpacedRepetitionEngine.calculateQuality(true, 500, 1000)).toBe(5);
    // 900 / 1000 = 0.9 => quality 3
    expect(SpacedRepetitionEngine.calculateQuality(true, 900, 1000)).toBe(3);
  });

  it('handles exact boundary at 50% of time limit', () => {
    // speedRatio exactly 0.5 => <=0.5 => quality 5
    expect(SpacedRepetitionEngine.calculateQuality(true, 1500, 3000)).toBe(5);
  });

  it('handles exact boundary at 80% of time limit', () => {
    // speedRatio exactly 0.8 => <=0.8 => quality 4
    expect(SpacedRepetitionEngine.calculateQuality(true, 2400, 3000)).toBe(4);
  });
});

// ─── updateEasinessFactory ──────────────────────────────────────────────────

describe('SpacedRepetitionEngine.updateEasinessFactory', () => {
  it('increases EF for quality 5', () => {
    const newEF = SpacedRepetitionEngine.updateEasinessFactory(2.5, 5);
    expect(newEF).toBeGreaterThan(2.5);
  });

  it('decreases EF for quality 2', () => {
    const newEF = SpacedRepetitionEngine.updateEasinessFactory(2.5, 2);
    expect(newEF).toBeLessThan(2.5);
  });

  it('never goes below 1.3', () => {
    const newEF = SpacedRepetitionEngine.updateEasinessFactory(1.3, 2);
    expect(newEF).toBe(1.3);
  });

  it('never goes below 1.3 even with very low starting EF', () => {
    const newEF = SpacedRepetitionEngine.updateEasinessFactory(1.3, 0);
    expect(newEF).toBe(1.3);
  });

  it('applies SM-2 formula correctly for quality 3', () => {
    // Formula: ef + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)
    // q=3: 2.5 + 0.1 - 2*(0.08 + 2*0.02) = 2.5 + 0.1 - 2*0.12 = 2.5 + 0.1 - 0.24 = 2.36
    const newEF = SpacedRepetitionEngine.updateEasinessFactory(2.5, 3);
    expect(newEF).toBeCloseTo(2.36, 2);
  });

  it('applies SM-2 formula correctly for quality 4', () => {
    // q=4: 2.5 + 0.1 - 1*(0.08 + 1*0.02) = 2.5 + 0.1 - 0.1 = 2.5
    const newEF = SpacedRepetitionEngine.updateEasinessFactory(2.5, 4);
    expect(newEF).toBeCloseTo(2.5, 2);
  });

  it('applies SM-2 formula correctly for quality 5', () => {
    // q=5: 2.5 + 0.1 - 0*(0.08 + 0*0.02) = 2.5 + 0.1 = 2.6
    const newEF = SpacedRepetitionEngine.updateEasinessFactory(2.5, 5);
    expect(newEF).toBeCloseTo(2.6, 2);
  });
});

// ─── calculateNextInterval ──────────────────────────────────────────────────

describe('SpacedRepetitionEngine.calculateNextInterval', () => {
  it('goes back one bucket on incorrect answer', () => {
    const result = SpacedRepetitionEngine.calculateNextInterval(3, 1, 2.5, false);
    expect(result.bucket).toBe(2);
    expect(result.interval).toBe(0);
  });

  it('does not go below bucket 0 on incorrect answer', () => {
    const result = SpacedRepetitionEngine.calculateNextInterval(0, 0, 2.5, false);
    expect(result.bucket).toBe(0);
    expect(result.interval).toBe(0);
  });

  it('advances one bucket on correct answer', () => {
    const result = SpacedRepetitionEngine.calculateNextInterval(0, 0, 2.5, true);
    expect(result.bucket).toBe(1);
  });

  it('does not go above bucket 5', () => {
    const result = SpacedRepetitionEngine.calculateNextInterval(5, 14, 2.5, true);
    expect(result.bucket).toBe(5);
  });

  it('sets interval 0 for new bucket <= 2', () => {
    // bucket 0 -> 1 => interval 0
    expect(SpacedRepetitionEngine.calculateNextInterval(0, 0, 2.5, true).interval).toBe(0);
    // bucket 1 -> 2 => interval 0
    expect(SpacedRepetitionEngine.calculateNextInterval(1, 0, 2.5, true).interval).toBe(0);
  });

  it('sets interval to 1 day for bucket 3', () => {
    // bucket 2 -> 3
    const result = SpacedRepetitionEngine.calculateNextInterval(2, 0, 2.5, true);
    expect(result.bucket).toBe(3);
    expect(result.interval).toBe(1);
  });

  it('sets interval to 4 days for bucket 4', () => {
    // bucket 3 -> 4
    const result = SpacedRepetitionEngine.calculateNextInterval(3, 1, 2.5, true);
    expect(result.bucket).toBe(4);
    expect(result.interval).toBe(4);
  });

  it('uses SM-2 formula for mastered bucket (5) with minimum 14 days', () => {
    // bucket 4 -> 5, currentInterval=4, ef=2.5 => 4*2.5=10 => clamped to min 14
    const result = SpacedRepetitionEngine.calculateNextInterval(4, 4, 2.5, true);
    expect(result.bucket).toBe(5);
    expect(result.interval).toBe(14);
  });

  it('uses SM-2 formula for mastered bucket when result exceeds 14', () => {
    // bucket 4 -> 5, currentInterval=10, ef=2.5 => 10*2.5=25 => 25 > 14
    const result = SpacedRepetitionEngine.calculateNextInterval(4, 10, 2.5, true);
    expect(result.bucket).toBe(5);
    expect(result.interval).toBe(25);
  });

  it('uses SM-2 formula when staying in mastered bucket', () => {
    // bucket 5 -> 5, currentInterval=14, ef=2.5 => 14*2.5=35
    const result = SpacedRepetitionEngine.calculateNextInterval(5, 14, 2.5, true);
    expect(result.bucket).toBe(5);
    expect(result.interval).toBe(35);
  });
});

// ─── calculateDueDate ───────────────────────────────────────────────────────

describe('SpacedRepetitionEngine.calculateDueDate', () => {
  it('returns now for bucket 0', () => {
    const before = Date.now();
    const dueDate = SpacedRepetitionEngine.calculateDueDate(0, 0);
    const after = Date.now();
    expect(dueDate.getTime()).toBeGreaterThanOrEqual(before);
    expect(dueDate.getTime()).toBeLessThanOrEqual(after);
  });

  it('returns now for bucket 1', () => {
    const before = Date.now();
    const dueDate = SpacedRepetitionEngine.calculateDueDate(1, 0);
    expect(dueDate.getTime()).toBeGreaterThanOrEqual(before);
    expect(dueDate.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('returns ~4 hours for bucket 2', () => {
    const dueDate = SpacedRepetitionEngine.calculateDueDate(2, 0);
    const expectedMs = 0.17 * 24 * 60 * 60 * 1000; // ~4 hours
    const diffMs = dueDate.getTime() - Date.now();
    expect(diffMs).toBeGreaterThan(expectedMs - 1000);
    expect(diffMs).toBeLessThan(expectedMs + 1000);
  });

  it('returns ~1 day for bucket 3', () => {
    const dueDate = SpacedRepetitionEngine.calculateDueDate(3, 1);
    const diffMs = dueDate.getTime() - Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;
    expect(diffMs).toBeGreaterThan(oneDayMs - 1000);
    expect(diffMs).toBeLessThan(oneDayMs + 1000);
  });

  it('returns ~4 days for bucket 4', () => {
    const dueDate = SpacedRepetitionEngine.calculateDueDate(4, 4);
    const diffMs = dueDate.getTime() - Date.now();
    const fourDaysMs = 4 * 24 * 60 * 60 * 1000;
    expect(diffMs).toBeGreaterThan(fourDaysMs - 1000);
    expect(diffMs).toBeLessThan(fourDaysMs + 1000);
  });

  it('uses intervalDays for mastered bucket 5', () => {
    const dueDate = SpacedRepetitionEngine.calculateDueDate(5, 14);
    const diffMs = dueDate.getTime() - Date.now();
    const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;
    expect(diffMs).toBeGreaterThan(fourteenDaysMs - 1000);
    expect(diffMs).toBeLessThan(fourteenDaysMs + 1000);
  });
});

// ─── updateState ────────────────────────────────────────────────────────────

describe('SpacedRepetitionEngine.updateState', () => {
  it('increments totalAttempts by 1', () => {
    const state = makeState({ totalAttempts: 5 });
    const result = SpacedRepetitionEngine.updateState(state, makeAttempt());
    expect(result.totalAttempts).toBe(6);
  });

  it('increments correctAttempts on correct answer', () => {
    const state = makeState({ correctAttempts: 3 });
    const result = SpacedRepetitionEngine.updateState(state, makeAttempt({ isCorrect: true }));
    expect(result.correctAttempts).toBe(4);
  });

  it('does not increment correctAttempts on incorrect answer', () => {
    const state = makeState({ correctAttempts: 3 });
    const result = SpacedRepetitionEngine.updateState(state, makeAttempt({ isCorrect: false }));
    expect(result.correctAttempts).toBe(3);
  });

  it('increments streak on correct answer', () => {
    const state = makeState({ streak: 3 });
    const result = SpacedRepetitionEngine.updateState(state, makeAttempt({ isCorrect: true }));
    expect(result.streak).toBe(4);
  });

  it('resets streak to 0 on incorrect answer', () => {
    const state = makeState({ streak: 10 });
    const result = SpacedRepetitionEngine.updateState(state, makeAttempt({ isCorrect: false }));
    expect(result.streak).toBe(0);
  });

  it('advances bucket on correct answer', () => {
    const state = makeState({ bucket: 2 });
    const result = SpacedRepetitionEngine.updateState(state, makeAttempt({ isCorrect: true }));
    expect(result.bucket).toBe(3);
  });

  it('decreases bucket on incorrect answer', () => {
    const state = makeState({ bucket: 3 });
    const result = SpacedRepetitionEngine.updateState(state, makeAttempt({ isCorrect: false }));
    expect(result.bucket).toBe(2);
  });

  it('sets lastSeen to approximately now', () => {
    const before = Date.now();
    const result = SpacedRepetitionEngine.updateState(makeState(), makeAttempt());
    const after = Date.now();
    expect(result.lastSeen!.getTime()).toBeGreaterThanOrEqual(before);
    expect(result.lastSeen!.getTime()).toBeLessThanOrEqual(after);
  });

  it('updates EF based on performance', () => {
    const state = makeState({ ef: 2.5 });
    // Fast correct => quality 5 => EF increases
    const result = SpacedRepetitionEngine.updateState(state, makeAttempt({ isCorrect: true, responseTimeMs: 500 }));
    expect(result.ef).toBeGreaterThan(2.5);
  });
});

// ─── selectWordsForSession ──────────────────────────────────────────────────

describe('SpacedRepetitionEngine.selectWordsForSession', () => {
  it('returns empty array for empty input', () => {
    const result = SpacedRepetitionEngine.selectWordsForSession([]);
    expect(result).toEqual([]);
  });

  it('returns at most sessionSize words', () => {
    const states = Array.from({ length: 30 }, (_, i) =>
      makeState({ wordId: `word-${i}`, bucket: 0, dueDate: new Date() })
    );
    const result = SpacedRepetitionEngine.selectWordsForSession(states, 10);
    expect(result.length).toBeLessThanOrEqual(10);
  });

  it('returns all words if fewer than sessionSize are due', () => {
    const states = Array.from({ length: 5 }, (_, i) =>
      makeState({ wordId: `word-${i}`, bucket: 0, dueDate: new Date() })
    );
    const result = SpacedRepetitionEngine.selectWordsForSession(states, 20);
    expect(result.length).toBe(5);
  });

  it('includes bucket 0 (new) words even if dueDate is in the future', () => {
    const futureDate = new Date(Date.now() + 86400000);
    const states = [
      makeState({ wordId: 'new-word', bucket: 0, dueDate: futureDate }),
    ];
    const result = SpacedRepetitionEngine.selectWordsForSession(states, 20);
    expect(result).toContain('new-word');
  });

  it('excludes non-due, non-new words', () => {
    const futureDate = new Date(Date.now() + 86400000 * 7);
    const states = [
      makeState({ wordId: 'not-due', bucket: 3, dueDate: futureDate }),
    ];
    const result = SpacedRepetitionEngine.selectWordsForSession(states, 20);
    expect(result).not.toContain('not-due');
  });

  it('returns word IDs as strings', () => {
    const states = [makeState({ wordId: 'word-1', bucket: 0 })];
    const result = SpacedRepetitionEngine.selectWordsForSession(states);
    result.forEach(id => expect(typeof id).toBe('string'));
  });

  it('uses default session size of 20', () => {
    const states = Array.from({ length: 25 }, (_, i) =>
      makeState({ wordId: `word-${i}`, bucket: 0, dueDate: new Date() })
    );
    const result = SpacedRepetitionEngine.selectWordsForSession(states);
    expect(result.length).toBeLessThanOrEqual(20);
  });
});

// ─── generateInsights ───────────────────────────────────────────────────────

describe('SpacedRepetitionEngine.generateInsights', () => {
  it('returns totalWords count', () => {
    const states = [makeState(), makeState({ wordId: 'w2' })];
    const insights = SpacedRepetitionEngine.generateInsights(states);
    expect(insights.totalWords).toBe(2);
  });

  it('counts mastered words (bucket 5)', () => {
    const states = [
      makeState({ bucket: 5 }),
      makeState({ bucket: 3, wordId: 'w2' }),
      makeState({ bucket: 5, wordId: 'w3' }),
    ];
    const insights = SpacedRepetitionEngine.generateInsights(states);
    expect(insights.mastered).toBe(2);
  });

  it('counts due-for-review words', () => {
    const pastDate = new Date(Date.now() - 86400000);
    const futureDate = new Date(Date.now() + 86400000);
    const states = [
      makeState({ dueDate: pastDate }),
      makeState({ dueDate: futureDate, wordId: 'w2' }),
      makeState({ dueDate: new Date(), wordId: 'w3' }),
    ];
    const insights = SpacedRepetitionEngine.generateInsights(states);
    // pastDate and now are both <= now
    expect(insights.dueForReview).toBeGreaterThanOrEqual(1);
  });

  it('calculates average accuracy correctly', () => {
    const states = [
      makeState({ totalAttempts: 10, correctAttempts: 8 }),
      makeState({ totalAttempts: 10, correctAttempts: 6, wordId: 'w2' }),
    ];
    const insights = SpacedRepetitionEngine.generateInsights(states);
    expect(insights.averageAccuracy).toBeCloseTo(0.7, 2);
  });

  it('returns 0 accuracy when no attempts', () => {
    const states = [makeState({ totalAttempts: 0, correctAttempts: 0 })];
    const insights = SpacedRepetitionEngine.generateInsights(states);
    expect(insights.averageAccuracy).toBe(0);
  });

  it('finds longest streak', () => {
    const states = [
      makeState({ streak: 5 }),
      makeState({ streak: 12, wordId: 'w2' }),
      makeState({ streak: 3, wordId: 'w3' }),
    ];
    const insights = SpacedRepetitionEngine.generateInsights(states);
    expect(insights.longestStreak).toBe(12);
  });

  it('adds "High accuracy rate" strength when accuracy > 0.8', () => {
    const states = [makeState({ totalAttempts: 10, correctAttempts: 9 })];
    const insights = SpacedRepetitionEngine.generateInsights(states);
    expect(insights.strengths).toContain('High accuracy rate');
  });

  it('adds "Great consistency" strength when longest streak > 10', () => {
    const states = [makeState({ streak: 15 })];
    const insights = SpacedRepetitionEngine.generateInsights(states);
    expect(insights.strengths).toContain('Great consistency');
  });

  it('adds "Strong vocabulary retention" when >30% mastered', () => {
    const states = [
      makeState({ bucket: 5 }),
      makeState({ bucket: 5, wordId: 'w2' }),
      makeState({ bucket: 0, wordId: 'w3' }),
    ];
    const insights = SpacedRepetitionEngine.generateInsights(states);
    expect(insights.strengths).toContain('Strong vocabulary retention');
  });

  it('recommends longer sessions when >20 words due', () => {
    const pastDate = new Date(Date.now() - 86400000);
    const states = Array.from({ length: 25 }, (_, i) =>
      makeState({ wordId: `w${i}`, dueDate: pastDate })
    );
    const insights = SpacedRepetitionEngine.generateInsights(states);
    expect(insights.recommendations).toContain(
      'You have many words due for review - try a longer session'
    );
  });

  it('recommends focus on accuracy when accuracy < 0.6', () => {
    const states = [makeState({ totalAttempts: 10, correctAttempts: 4 })];
    const insights = SpacedRepetitionEngine.generateInsights(states);
    expect(insights.recommendations).toContain('Focus on accuracy over speed');
  });

  it('recommends new vocabulary when >50 new words', () => {
    const states = Array.from({ length: 55 }, (_, i) =>
      makeState({ wordId: `w${i}`, bucket: 0 })
    );
    const insights = SpacedRepetitionEngine.generateInsights(states);
    expect(insights.recommendations).toContain(
      'Many new words available - try learning some new vocabulary'
    );
  });

  it('handles empty states array', () => {
    const insights = SpacedRepetitionEngine.generateInsights([]);
    expect(insights.totalWords).toBe(0);
    expect(insights.mastered).toBe(0);
    expect(insights.averageAccuracy).toBe(0);
    expect(insights.longestStreak).toBe(0);
  });
});

// ─── shuffleArray ───────────────────────────────────────────────────────────

describe('SpacedRepetitionEngine.shuffleArray', () => {
  it('returns an array of the same length', () => {
    const arr = [1, 2, 3, 4, 5];
    const shuffled = SpacedRepetitionEngine.shuffleArray(arr);
    expect(shuffled.length).toBe(arr.length);
  });

  it('preserves all elements', () => {
    const arr = [1, 2, 3, 4, 5];
    const shuffled = SpacedRepetitionEngine.shuffleArray(arr);
    expect(shuffled.sort()).toEqual(arr.sort());
  });

  it('does not mutate the original array', () => {
    const arr = [1, 2, 3, 4, 5];
    const original = [...arr];
    SpacedRepetitionEngine.shuffleArray(arr);
    expect(arr).toEqual(original);
  });

  it('handles empty array', () => {
    expect(SpacedRepetitionEngine.shuffleArray([])).toEqual([]);
  });

  it('handles single element array', () => {
    expect(SpacedRepetitionEngine.shuffleArray([42])).toEqual([42]);
  });

  it('produces different orderings (statistical, run 10 times)', () => {
    const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const original = arr.join(',');
    let differentCount = 0;
    for (let i = 0; i < 10; i++) {
      if (SpacedRepetitionEngine.shuffleArray(arr).join(',') !== original) {
        differentCount++;
      }
    }
    // At least some shuffles should differ
    expect(differentCount).toBeGreaterThan(0);
  });
});

// ─── getBucketName ──────────────────────────────────────────────────────────

describe('SpacedRepetitionEngine.getBucketName', () => {
  it('returns "New" for bucket 0', () => {
    expect(SpacedRepetitionEngine.getBucketName(0)).toBe('New');
  });

  it('returns "Learning-1" for bucket 1', () => {
    expect(SpacedRepetitionEngine.getBucketName(1)).toBe('Learning-1');
  });

  it('returns "Learning-2" for bucket 2', () => {
    expect(SpacedRepetitionEngine.getBucketName(2)).toBe('Learning-2');
  });

  it('returns "Review-1" for bucket 3', () => {
    expect(SpacedRepetitionEngine.getBucketName(3)).toBe('Review-1');
  });

  it('returns "Review-2" for bucket 4', () => {
    expect(SpacedRepetitionEngine.getBucketName(4)).toBe('Review-2');
  });

  it('returns "Mastered" for bucket 5', () => {
    expect(SpacedRepetitionEngine.getBucketName(5)).toBe('Mastered');
  });

  it('returns "Unknown" for out-of-range bucket', () => {
    expect(SpacedRepetitionEngine.getBucketName(6)).toBe('Unknown');
    expect(SpacedRepetitionEngine.getBucketName(-1)).toBe('Unknown');
    expect(SpacedRepetitionEngine.getBucketName(99)).toBe('Unknown');
  });
});

// ─── getNextReviewTime ──────────────────────────────────────────────────────

describe('SpacedRepetitionEngine.getNextReviewTime', () => {
  it('returns "Due now" when dueDate is in the past', () => {
    const state = makeState({ dueDate: new Date(Date.now() - 60000) });
    expect(SpacedRepetitionEngine.getNextReviewTime(state)).toBe('Due now');
  });

  it('returns "Due now" when dueDate is exactly now', () => {
    const state = makeState({ dueDate: new Date() });
    expect(SpacedRepetitionEngine.getNextReviewTime(state)).toBe('Due now');
  });

  it('returns minutes for dueDates less than 1 hour away', () => {
    const state = makeState({ dueDate: new Date(Date.now() + 30 * 60 * 1000) });
    const result = SpacedRepetitionEngine.getNextReviewTime(state);
    expect(result).toMatch(/Due in \d+ minutes?/);
  });

  it('returns singular "minute" for 1 minute', () => {
    const state = makeState({ dueDate: new Date(Date.now() + 60 * 1000) });
    const result = SpacedRepetitionEngine.getNextReviewTime(state);
    expect(result).toBe('Due in 1 minute');
  });

  it('returns hours for dueDates less than 1 day away', () => {
    const state = makeState({ dueDate: new Date(Date.now() + 5 * 60 * 60 * 1000) });
    const result = SpacedRepetitionEngine.getNextReviewTime(state);
    expect(result).toMatch(/Due in \d+ hours?/);
  });

  it('returns singular "hour" for 1 hour', () => {
    const state = makeState({ dueDate: new Date(Date.now() + 60 * 60 * 1000) });
    const result = SpacedRepetitionEngine.getNextReviewTime(state);
    expect(result).toBe('Due in 1 hour');
  });

  it('returns days for dueDates less than 7 days away', () => {
    const state = makeState({ dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) });
    const result = SpacedRepetitionEngine.getNextReviewTime(state);
    expect(result).toMatch(/Due in \d+ days?/);
  });

  it('returns weeks for dueDates 7+ days away', () => {
    const state = makeState({ dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) });
    const result = SpacedRepetitionEngine.getNextReviewTime(state);
    expect(result).toMatch(/Due in \d+ weeks?/);
  });

  it('returns singular "week" for ~7 days', () => {
    const state = makeState({ dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) });
    const result = SpacedRepetitionEngine.getNextReviewTime(state);
    expect(result).toBe('Due in 1 week');
  });
});
