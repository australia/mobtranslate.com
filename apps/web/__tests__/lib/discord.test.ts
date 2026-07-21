// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { discordRecording, discordTranslate, discordTts } from '../../lib/discord';

describe('Discord activity events', () => {
  const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));

  beforeEach(() => {
    process.env.DISCORD_WEBHOOK_URL = 'https://discord.example.test/webhook';
    process.env.MOBTRANSLATE_MONITORING_SECRET = 'monitoring-test-secret';
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockClear();
  });

  afterEach(() => {
    delete process.env.DISCORD_WEBHOOK_URL;
    delete process.env.MOBTRANSLATE_MONITORING_SECRET;
    vi.unstubAllGlobals();
  });

  it('logs both English and Indigenous-language translation text', async () => {
    await discordTranslate({
      language: 'kuku_yalanji',
      mode: 'translate',
      englishText: 'rainbow lizard',
      indigenousText: 'wubul-wubul ...',
      gloss: 'rainbow lizard',
      user: null,
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const payload = JSON.parse(String(init.body));
    const fields = payload.embeds[0].fields as Array<{ name: string; value: string }>;

    expect(fields).toContainEqual(expect.objectContaining({ name: 'English / source', value: 'rainbow lizard' }));
    expect(fields).toContainEqual(expect.objectContaining({
      name: 'Indigenous-language output (kuku_yalanji)',
      value: 'wubul-wubul ...',
    }));
    expect(fields).toContainEqual(expect.objectContaining({
      name: 'English back-translation',
      value: 'rainbow lizard',
    }));
  });

  it('pseudonymizes account identity in operational events', async () => {
    await discordTranslate({
      language: 'kuku_yalanji',
      englishText: 'water',
      indigenousText: 'bana',
      user: { id: 'user-123', email: 'speaker@example.test' },
    });

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const serialized = String(init.body);
    const payload = JSON.parse(serialized);
    const fields = payload.embeds[0].fields as Array<{ name: string; value: string }>;

    expect(serialized).not.toContain('speaker@example.test');
    expect(fields).toContainEqual(
      expect.objectContaining({ name: 'User', value: expect.stringMatching(/^account:[a-f0-9]{12}$/) }),
    );
  });

  it('logs both text sides and the synthesis engine for TTS', async () => {
    await discordTts({
      language: 'anindilyakwa',
      englishText: 'rainbow lizard',
      indigenousText: 'akwa text',
      engine: 'mms-tts-pjt',
    });

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const payload = JSON.parse(String(init.body));
    const fields = payload.embeds[0].fields as Array<{ name: string; value: string }>;

    expect(fields).toContainEqual(expect.objectContaining({ name: 'English / context', value: 'rainbow lizard' }));
    expect(fields).toContainEqual(expect.objectContaining({
      name: 'Indigenous-language audio text (anindilyakwa)',
      value: 'akwa text',
    }));
    expect(fields).toContainEqual(expect.objectContaining({ name: 'Engine', value: 'mms-tts-pjt' }));
  });

  it('labels both text sides for recording uploads', async () => {
    await discordRecording({
      language: 'kuku_yalanji',
      label: 'ngana',
      gloss: 'who',
      kind: 'word',
      durationMs: 1250,
      user: null,
    });

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const payload = JSON.parse(String(init.body));
    const fields = payload.embeds[0].fields as Array<{ name: string; value: string }>;

    expect(fields).toContainEqual(expect.objectContaining({
      name: 'Indigenous-language text',
      value: 'ngana',
    }));
    expect(fields).toContainEqual(expect.objectContaining({ name: 'English / gloss', value: 'who' }));
  });
});
