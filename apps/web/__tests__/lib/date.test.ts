import { describe, it, expect } from 'vitest';
import { formatDistanceToNow } from '@/lib/utils/date';

describe('formatDistanceToNow', () => {
  it('returns "just now" for less than 60 seconds ago', () => {
    const date = new Date(Date.now() - 30 * 1000);
    expect(formatDistanceToNow(date)).toBe('just now');
  });

  it('returns "just now" for 0 seconds ago', () => {
    expect(formatDistanceToNow(new Date())).toBe('just now');
  });

  it('returns "just now" for 59 seconds ago', () => {
    const date = new Date(Date.now() - 59 * 1000);
    expect(formatDistanceToNow(date)).toBe('just now');
  });

  it('returns minutes ago for 60 seconds to 1 hour', () => {
    const date = new Date(Date.now() - 5 * 60 * 1000);
    expect(formatDistanceToNow(date)).toBe('5 minutes ago');
  });

  it('returns "1 minutes ago" for exactly 60 seconds', () => {
    const date = new Date(Date.now() - 60 * 1000);
    expect(formatDistanceToNow(date)).toBe('1 minutes ago');
  });

  it('returns "59 minutes ago" for just under 1 hour', () => {
    const date = new Date(Date.now() - 59 * 60 * 1000);
    expect(formatDistanceToNow(date)).toBe('59 minutes ago');
  });

  it('returns hours ago for 1 hour to 1 day', () => {
    const date = new Date(Date.now() - 3 * 60 * 60 * 1000);
    expect(formatDistanceToNow(date)).toBe('3 hours ago');
  });

  it('returns "1 hours ago" for exactly 1 hour', () => {
    const date = new Date(Date.now() - 3600 * 1000);
    expect(formatDistanceToNow(date)).toBe('1 hours ago');
  });

  it('returns days ago for 1 day to 1 week', () => {
    const date = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    expect(formatDistanceToNow(date)).toBe('3 days ago');
  });

  it('returns formatted date for older than 1 week', () => {
    const date = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const result = formatDistanceToNow(date);
    // Should be a locale date string, not "X days ago"
    expect(result).not.toContain('ago');
    expect(result).not.toBe('just now');
  });

  it('accepts a string date input', () => {
    const dateStr = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    expect(formatDistanceToNow(dateStr)).toBe('5 minutes ago');
  });

  it('accepts a Date object input', () => {
    const date = new Date(Date.now() - 2 * 60 * 60 * 1000);
    expect(formatDistanceToNow(date)).toBe('2 hours ago');
  });

  it('returns "6 days ago" for just under 1 week', () => {
    const date = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
    expect(formatDistanceToNow(date)).toBe('6 days ago');
  });

  it('returns formatted date for exactly 7 days', () => {
    const date = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const result = formatDistanceToNow(date);
    // 7 days = 604800 seconds, which is NOT < 604800 so it hits the locale branch
    expect(result).not.toContain('days ago');
  });
});
