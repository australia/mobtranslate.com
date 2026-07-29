import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@mobtranslate/ui', () => ({
  cn: (...classes: unknown[]) => classes.filter(Boolean).join(' '),
}));

vi.mock('lucide-react', () => ({
  Volume2: (props: any) => <span data-icon="volume" {...props} />,
  Loader2: (props: any) => <span data-icon="loading" {...props} />,
  AlertCircle: (props: any) => <span data-icon="error" {...props} />,
  Mic2: (props: any) => <span data-icon="recorded" {...props} />,
  Sparkles: (props: any) => <span data-icon="synthetic" {...props} />,
}));

vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));

import { SpeakButton } from '@/components/audio/SpeakButton';

describe('SpeakButton audio-source hierarchy', () => {
  const audioUrls: string[] = [];

  beforeEach(() => {
    audioUrls.length = 0;
    class AudioStub {
      onplaying: (() => void) | null = null;
      onended: (() => void) | null = null;
      onerror: (() => void) | null = null;

      constructor(url: string) { audioUrls.push(url); }
      pause() {}
      async play() { this.onplaying?.(); }
    }
    vi.stubGlobal('Audio', AudioStub);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('prefers an attributed recording over synthetic TTS', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ recordings: [{ url: '/api/storage/recordings/source.mp3' }] }),
    }));

    render(<SpeakButton text="agasewa" lang="migmaq" wordId="word-1" variant="labeled" />);

    const button = await screen.findByRole('button', { name: /recorded pronunciation/i });
    expect(button).toHaveTextContent('Recorded voice');
    fireEvent.click(button);

    await waitFor(() => expect(audioUrls).toEqual(['/api/storage/recordings/source.mp3']));
    expect(audioUrls[0]).not.toContain('/api/tts');
  });

  it('labels and uses synthetic speech only when no recording exists', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ recordings: [] }),
    }));

    render(<SpeakButton text="wardu" lang="wbv" wordId="word-2" variant="labeled" />);

    const button = await screen.findByRole('button', { name: /synthetic pronunciation guide/i });
    expect(button).toHaveTextContent('Synthetic guide');
    fireEvent.click(button);

    await waitFor(() => expect(audioUrls).toHaveLength(1));
    expect(audioUrls[0]).toContain('/api/tts?');
    expect(audioUrls[0]).toContain('lang=wbv');
  });
});
