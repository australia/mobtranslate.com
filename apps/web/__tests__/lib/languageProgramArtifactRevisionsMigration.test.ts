// @vitest-environment node

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  path.resolve(process.cwd(), 'db/migrations/20260720001000_language_program_artifact_revisions.sql'),
  'utf8',
);

describe('language program artifact revision migration', () => {
  it('adds an append-only revision table and current-state timestamp', () => {
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS updated_at');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.language_program_artifact_revisions');
    expect(migration).toContain('language program artifact revisions are append-only');
  });

  it('backfills existing artifact identities before changing control-file mutability', () => {
    expect(migration.indexOf('INSERT INTO public.language_program_artifact_revisions')).toBeLessThan(
      migration.indexOf('UPDATE public.language_program_artifacts'),
    );
    expect(migration).toContain("'canonical_work_log'");
    expect(migration).toContain("'program_state'");
    expect(migration).toContain("'experiment_registry'");
  });

  it('records only material artifact-state changes', () => {
    expect(migration).toContain('record_language_program_artifact_revision');
    expect(migration).toContain('IS NOT DISTINCT FROM');
    expect(migration).toContain('language_program_artifact_revision_summary');
  });

  it('enforces immutable content even when the sync command is bypassed', () => {
    expect(migration).toContain('enforce_language_program_artifact_identity');
    expect(migration).toContain('immutable language program artifact content cannot change');
    expect(migration).toContain('language program artifact identity and location are immutable');
  });
});
