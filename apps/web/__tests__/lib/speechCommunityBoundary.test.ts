// @vitest-environment node

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const LANGUAGE_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  getSessionUser: vi.fn(),
  userHasRole: vi.fn(),
}));

vi.mock('@/lib/db/index', () => ({ db: { execute: mocks.execute } }));
vi.mock('@/lib/auth-helpers', () => ({
  getSessionUser: mocks.getSessionUser,
  userHasRole: mocks.userHasRole,
  requireRole: vi.fn(),
}));

import { resolveSentenceAudioAccess } from '@/lib/recording/speech-access.server';
import { resolveDictionaryAudioAccess } from '@/lib/recording/dictionary-recording-access.server';
import { STUDIO_ROLES } from '@/lib/recording/sentence-studio';

const readWebFile = (relativePath: string) => readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('community-scoped speech access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionUser.mockResolvedValue({ id: USER_ID });
    mocks.userHasRole.mockResolvedValue(false);
  });

  it('checks the recording language before granting private sentence audio', async () => {
    mocks.execute.mockResolvedValue([{ language_id: LANGUAGE_ID, speaker_user_id: null, public_allowed: false }]);

    await expect(resolveSentenceAudioAccess('sentences/speaker/clip.wav')).resolves.toBe('denied');

    expect(mocks.userHasRole).toHaveBeenCalledWith(USER_ID, STUDIO_ROLES, LANGUAGE_ID);
  });

  it('lets a signed-in speaker revisit their own non-public sentence audio', async () => {
    mocks.execute.mockResolvedValue([{
      language_id: LANGUAGE_ID,
      speaker_user_id: USER_ID,
      public_allowed: false,
    }]);

    await expect(resolveSentenceAudioAccess('sentences/speaker/private.wav')).resolves.toBe('private');

    expect(mocks.userHasRole).not.toHaveBeenCalled();
  });

  it('checks the recording language before granting private dictionary audio', async () => {
    mocks.execute.mockResolvedValue([{
      recorded_by: null,
      language_id: LANGUAGE_ID,
      speaker_user_id: null,
      attributed_source: false,
      public_allowed: false,
    }]);

    await expect(resolveDictionaryAudioAccess('words/clip.wav')).resolves.toBe('denied');

    expect(mocks.userHasRole).toHaveBeenCalledWith(USER_ID, STUDIO_ROLES, LANGUAGE_ID);
  });

  it('does not preserve operator access after their language role is revoked', async () => {
    mocks.execute.mockResolvedValue([{
      language_id: LANGUAGE_ID,
      speaker_user_id: null,
      attributed_source: false,
      public_allowed: false,
    }]);

    await expect(resolveDictionaryAudioAccess('words/operator-captured.wav')).resolves.toBe('denied');

    expect(mocks.userHasRole).toHaveBeenCalledWith(USER_ID, STUDIO_ROLES, LANGUAGE_ID);
  });

  it('uses the Kuku Yalanji scoped guard across every private corpus endpoint', () => {
    const routeFiles = [
      'app/api/v2/recordings/sentence-corpus/upload/route.ts',
      'app/api/v2/recordings/sentence-corpus/progress/route.ts',
      'app/api/v2/recordings/sentence-corpus/review/route.ts',
      'app/api/v2/recordings/sentence-corpus/dashboard/route.ts',
      'app/api/v2/recordings/sentence-corpus/next/route.ts',
      'app/api/v2/recordings/sentence-corpus/speakers/route.ts',
      'app/api/v2/recordings/sentence-corpus/speakers/[speakerId]/consent/route.ts',
      'app/api/v2/recordings/sentence-corpus/transcripts/[recordingId]/route.ts',
      'app/api/v2/recordings/sentence-corpus/export/pairs/route.ts',
      'app/api/v2/recordings/sentence-corpus/export/asr-inventory/route.ts',
      'app/api/v2/recordings/sentence-corpus/export/tts-manifest/route.ts',
    ];

    for (const file of routeFiles) {
      const source = readWebFile(file);
      expect(source, file).toContain('requireKukuStudioAccess(');
      expect(source, file).not.toMatch(/requireRole\((STUDIO_ROLES|EXPORT_ROLES)\)/);
    }
  });

  it('binds corpus consent, speakers, and transcript review to Kuku Yalanji', () => {
    const upload = readWebFile('app/api/v2/recordings/sentence-corpus/upload/route.ts');
    const speakers = readWebFile('app/api/v2/recordings/sentence-corpus/speakers/route.ts');
    const consent = readWebFile('app/api/v2/recordings/sentence-corpus/speakers/[speakerId]/consent/route.ts');
    const transcript = readWebFile('app/api/v2/recordings/sentence-corpus/transcripts/[recordingId]/route.ts');
    expect(upload).toContain('consent.language_id = ${languageId}::uuid');
    expect(speakers).toContain('sp.language_id = ${langId}::uuid');
    expect(speakers).not.toContain('sp.language_id is null');
    expect(consent).toContain('language_id = ${languageId}::uuid');
    expect(transcript).toContain('speaker.language_id = ${languageId}::uuid');
  });

  it('keeps the recording studio pages behind the same Kuku Yalanji assignment', () => {
    for (const file of ['app/record/page.tsx', 'app/record/dashboard/page.tsx']) {
      const source = readWebFile(file);
      expect(source, file).toContain('kukuLanguageId()');
      expect(source, file).toContain('STUDIO_ROLES, languageId');
    }
    expect(readWebFile('app/record/dashboard/page.tsx')).toContain('EXPORT_ROLES, languageId!');
  });
});
