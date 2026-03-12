import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Recreating the calculateStreakFromDaily function from
 * apps/web/app/api/v2/leaderboard/overview/route.ts since it is not exported.
 *
 * The function takes a Map<string, number> where keys are date strings
 * (produced by Date.toDateString()) and values are activity counts.
 * It returns the number of consecutive days of activity ending at today
 * or yesterday.
 */
function calculateStreakFromDaily(dailyActivity: Map<string, number>): number {
  if (dailyActivity.size === 0) return 0;

  let streak = 0;
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toDateString();

  // Start from today or yesterday
  let checkDate = new Date();
  if (!dailyActivity.has(today) && !dailyActivity.has(yesterday)) {
    return 0;
  }

  if (!dailyActivity.has(today)) {
    checkDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
  }

  // Count consecutive days
  while (dailyActivity.has(checkDate.toDateString())) {
    streak++;
    checkDate = new Date(checkDate.getTime() - 24 * 60 * 60 * 1000);
  }

  return streak;
}

/** Helper: returns a Date.toDateString() for N days ago from a reference. */
function daysAgo(n: number, from: Date = new Date()): string {
  return new Date(from.getTime() - n * 24 * 60 * 60 * 1000).toDateString();
}

describe('calculateStreakFromDaily', () => {
  it('should return 0 for an empty map', () => {
    const map = new Map<string, number>();
    expect(calculateStreakFromDaily(map)).toBe(0);
  });

  it('should return 1 when only today has activity', () => {
    const map = new Map<string, number>();
    map.set(daysAgo(0), 5);
    expect(calculateStreakFromDaily(map)).toBe(1);
  });

  it('should return 1 when only yesterday has activity', () => {
    const map = new Map<string, number>();
    map.set(daysAgo(1), 3);
    expect(calculateStreakFromDaily(map)).toBe(1);
  });

  it('should return 2 when today and yesterday have activity', () => {
    const map = new Map<string, number>();
    map.set(daysAgo(0), 5);
    map.set(daysAgo(1), 3);
    expect(calculateStreakFromDaily(map)).toBe(2);
  });

  it('should return 0 when the most recent activity is 2 days ago', () => {
    const map = new Map<string, number>();
    map.set(daysAgo(2), 10);
    map.set(daysAgo(3), 5);
    expect(calculateStreakFromDaily(map)).toBe(0);
  });

  it('should count a long consecutive streak from today', () => {
    const map = new Map<string, number>();
    for (let i = 0; i < 7; i++) {
      map.set(daysAgo(i), i + 1);
    }
    expect(calculateStreakFromDaily(map)).toBe(7);
  });

  it('should count a long consecutive streak from yesterday', () => {
    const map = new Map<string, number>();
    // No activity today, but yesterday through 6 days ago
    for (let i = 1; i <= 5; i++) {
      map.set(daysAgo(i), 1);
    }
    expect(calculateStreakFromDaily(map)).toBe(5);
  });

  it('should stop counting at a gap', () => {
    const map = new Map<string, number>();
    map.set(daysAgo(0), 5);
    map.set(daysAgo(1), 3);
    // gap at daysAgo(2)
    map.set(daysAgo(3), 10);
    map.set(daysAgo(4), 7);
    expect(calculateStreakFromDaily(map)).toBe(2);
  });

  it('should return 0 when map has entries but none recent', () => {
    const map = new Map<string, number>();
    map.set(daysAgo(30), 1);
    map.set(daysAgo(31), 2);
    map.set(daysAgo(32), 3);
    expect(calculateStreakFromDaily(map)).toBe(0);
  });

  it('should handle activity count values without affecting streak', () => {
    const map = new Map<string, number>();
    map.set(daysAgo(0), 1);
    map.set(daysAgo(1), 100);
    map.set(daysAgo(2), 0); // 0 is still a truthy map entry (has() returns true)
    expect(calculateStreakFromDaily(map)).toBe(3);
  });

  it('should handle a 30-day streak', () => {
    const map = new Map<string, number>();
    for (let i = 0; i < 30; i++) {
      map.set(daysAgo(i), 1);
    }
    expect(calculateStreakFromDaily(map)).toBe(30);
  });

  it('should start from yesterday if today has no activity even with longer history', () => {
    const map = new Map<string, number>();
    // No today, but yesterday + 2 more days back
    map.set(daysAgo(1), 2);
    map.set(daysAgo(2), 3);
    map.set(daysAgo(3), 4);
    // gap
    map.set(daysAgo(5), 1);
    expect(calculateStreakFromDaily(map)).toBe(3);
  });

  it('should prefer starting from today over yesterday when both have activity', () => {
    const map = new Map<string, number>();
    map.set(daysAgo(0), 1);
    map.set(daysAgo(1), 1);
    map.set(daysAgo(2), 1);
    // The streak should be 3 (today, yesterday, 2 days ago)
    expect(calculateStreakFromDaily(map)).toBe(3);
  });
});
