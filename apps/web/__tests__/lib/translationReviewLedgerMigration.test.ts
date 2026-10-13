// @vitest-environment node

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  path.resolve(process.cwd(), 'db/migrations/20260831000000_translation_review_ledger.sql'),
  'utf8',
);

describe('translation review ledger migration', () => {
  it('creates stable text-free review subjects for retained translations', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.translation_review_subjects');
    expect(migration).toContain("WHERE request.kind = 'translate'");
    expect(migration).toContain("IF NEW.kind = 'translate'");
    expect(migration).not.toMatch(/translation_review_subjects[\s\S]{0,1200}(input_text|output_text)\s+(TEXT|VARCHAR)/i);
  });

  it('makes review events append-only and preserves explicit supersession', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.translation_review_events');
    expect(migration).toContain('BEFORE UPDATE OR DELETE ON public.translation_review_events');
    expect(migration).toContain('translation review events are append-only');
    expect(migration).toContain('supersedes_event_id');
    expect(migration).toContain('same subject');
  });

  it('keeps raw-request retention compatible without losing review history', () => {
    expect(migration).toContain('ON DELETE SET NULL');
    expect(migration).toContain('BEFORE DELETE ON public.translation_requests');
    expect(migration).toContain('raw_deleted_at');
    expect(migration).not.toMatch(/\b(DELETE FROM|TRUNCATE|DROP TABLE)\b/i);
  });

  it('reports repeat reviews, qualified review, disagreement, and privacy gaps', () => {
    expect(migration).toContain('translation_review_subject_status');
    expect(migration).toContain('independent_review_count');
    expect(migration).toContain('qualified_review_count');
    expect(migration).toContain('has_current_disagreement');
    expect(migration).toContain('translation_review_archive_gaps');
    expect(migration).toContain('privacy_pruned_request_count');
    expect(migration).toContain('known_lifetime_request_count');
  });
});
