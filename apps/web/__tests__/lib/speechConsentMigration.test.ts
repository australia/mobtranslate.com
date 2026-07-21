// @vitest-environment node

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  path.join(process.cwd(), 'db/migrations/20260719020000_governed_speech_consent.sql'),
  'utf8',
);

describe('governed speech migration', () => {
  it('uses explicit false defaults and does not backfill legacy consent', () => {
    expect(migration).not.toMatch(/speech_consent_records[\s\S]*DEFAULT TRUE/i);
    expect(migration).not.toMatch(/INSERT INTO public\.speech_consent_records[\s\S]*SELECT/i);
  });

  it('makes consent and transcript history append-only', () => {
    expect(migration).toContain('speech consent records are append-only');
    expect(migration).toContain('BEFORE UPDATE OR DELETE ON public.speech_consent_records');
    expect(migration).toContain('BEFORE UPDATE OR DELETE ON public.speech_transcript_events');
  });

  it('stores exact consent and session identities on sentence recordings', () => {
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS speech_consent_record_id UUID');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS speech_session_id UUID');
    expect(migration).toContain('CREATE OR REPLACE VIEW public.current_speech_consent');
    expect(migration).toContain('CREATE OR REPLACE VIEW public.current_speech_transcript');
  });
});
