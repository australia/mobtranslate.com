// @vitest-environment node

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  path.resolve(process.cwd(), 'db/migrations/20260831001000_translation_review_coverage_indexes.sql'),
  'utf8',
);

describe('translation review coverage follow-up migration', () => {
  it('indexes current-event supersession and method lookup', () => {
    expect(migration).toContain('translation_review_events_supersedes_idx');
    expect(migration).toContain('translation_review_events_subject_method_idx');
  });

  it('separates repeat passes, methods, and independent reviewers', () => {
    expect(migration).toContain('review_count >= 2');
    expect(migration).toContain('distinct_review_method_count');
    expect(migration).toContain('independent_reviewer_two_plus_count');
    expect(migration).toContain('repeat runs by the same reviewer do not inflate this count');
  });

  it('exposes a privacy-safe zero-review queue', () => {
    expect(migration).toContain('translation_review_unreviewed_queue');
    expect(migration).not.toMatch(/\b(input_text|output_text)\b/i);
    expect(migration).not.toMatch(/\b(DELETE FROM|TRUNCATE|DROP TABLE)\b/i);
  });
});
