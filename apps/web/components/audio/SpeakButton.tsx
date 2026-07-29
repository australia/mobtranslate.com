'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Volume2, Loader2, AlertCircle, Mic2, Sparkles } from 'lucide-react';
import { cn } from '@mobtranslate/ui';
import { track } from '@/lib/analytics';

type Status = 'idle' | 'loading' | 'playing' | 'error';

interface SpeakButtonProps {
  /** The Indigenous-language text to pronounce. */
  text: string;
  /** English source, definition, or gloss shown beside the Indigenous text in audit events. */
  englishText?: string;
  /** Dictionary/language code, selects the donor voice (e.g. "kuku_yalanji"). */
  lang?: string;
  /** When present, a human/source recording is resolved before synthetic TTS. */
  wordId?: string;
  /** Sentence equivalent of wordId. */
  exampleId?: string;
  /** "icon" = round icon button; "labeled" = icon + text. */
  variant?: 'icon' | 'labeled';
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  className?: string;
}

const ICON_SIZE = { sm: 14, md: 16, lg: 20 } as const;
const BOX = { sm: 'h-11 w-11', md: 'h-11 w-11', lg: 'h-11 w-11' } as const;

/**
 * Plays an active recorded pronunciation when one exists. Synthetic TTS is an
 * explicitly labelled fallback, never presented as a language speaker.
 */
export function SpeakButton({
  text,
  englishText,
  lang,
  wordId,
  exampleId,
  variant = 'icon',
  size = 'md',
  label = 'Hear pronunciation',
  className,
}: SpeakButtonProps) {
  const [status, setStatus] = useState<Status>('idle');
  const [source, setSource] = useState<'unknown' | 'recorded' | 'synthetic'>(wordId || exampleId ? 'unknown' : 'synthetic');
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const resolveAudio = useCallback(async (): Promise<{ url: string; source: 'recorded' | 'synthetic' }> => {
    if (recordedUrl) return { url: recordedUrl, source: 'recorded' };
    const endpoint = wordId
      ? `/api/v2/words/${encodeURIComponent(wordId)}/recordings`
      : exampleId
        ? `/api/v2/examples/${encodeURIComponent(exampleId)}/recordings`
        : null;
    if (endpoint && source === 'unknown') {
      try {
        const response = await fetch(endpoint, { cache: 'no-store' });
        const data = response.ok ? await response.json() : null;
        const first = data?.recordings?.find((item: any) => item?.url || item?.master_url);
        const url = first?.url || first?.master_url;
        if (url) {
          setRecordedUrl(url);
          setSource('recorded');
          return { url, source: 'recorded' };
        }
      } catch {
        // A recording lookup failure must not make the pronunciation control fail.
      }
      setSource('synthetic');
    }
    const params = new URLSearchParams({ text });
    if (lang) params.set('lang', lang);
    if (englishText?.trim()) params.set('english', englishText.trim().slice(0, 600));
    return { url: `/api/tts?${params.toString()}`, source: 'synthetic' };
  }, [recordedUrl, wordId, exampleId, source, text, lang, englishText]);

  useEffect(() => {
    setRecordedUrl(null);
    setSource(wordId || exampleId ? 'unknown' : 'synthetic');
  }, [wordId, exampleId, text]);

  // The labelled word-page control tells the user its source before they play it.
  useEffect(() => {
    if (variant === 'labeled' && source === 'unknown') void resolveAudio();
  }, [variant, source, resolveAudio]);

  const play = useCallback(async () => {
    if (status === 'loading' || status === 'playing') {
      audioRef.current?.pause();
      setStatus('idle');
      return;
    }
    if (!text.trim()) return;

    setStatus('loading');
    try {
      const resolved = await resolveAudio();
      track('pronunciation_play', { lang: lang ?? 'unknown', source: resolved.source, text_length: text.length });
      const url = resolved.url;
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onplaying = () => setStatus('playing');
      audio.onended = () => setStatus('idle');
      audio.onerror = () => setStatus('error');
      await audio.play();
    } catch {
      setStatus('error');
    }
  }, [text, lang, status, resolveAudio]);

  const iconSize = ICON_SIZE[size];
  const icon =
    status === 'loading' ? (
      <Loader2 size={iconSize} className="animate-spin" />
    ) : status === 'error' ? (
      <AlertCircle size={iconSize} />
    ) : source === 'recorded' ? (
      <Mic2 size={iconSize} className={cn(status === 'playing' && 'animate-pulse')} />
    ) : source === 'synthetic' ? (
      <Sparkles size={iconSize} className={cn(status === 'playing' && 'animate-pulse')} />
    ) : (
      <Volume2 size={iconSize} className={cn(status === 'playing' && 'animate-pulse')} />
    );

  const aria =
    status === 'error'
      ? 'Pronunciation unavailable'
      : status === 'playing'
        ? 'Stop pronunciation'
        : source === 'recorded'
          ? `Hear recorded pronunciation of ${text}`
          : source === 'synthetic'
            ? `Hear synthetic pronunciation guide for ${text}`
            : `Hear ${text}. Recorded audio is preferred; otherwise a synthetic guide is used`;
  const visibleLabel = source === 'recorded'
    ? 'Recorded voice'
    : source === 'synthetic'
      ? 'Synthetic guide'
      : label;

  if (variant === 'labeled') {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          void play();
        }}
        aria-label={aria}
        title={aria}
        className={cn(
          'inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium',
          'text-foreground hover:bg-muted transition-colors',
          status === 'error' && 'text-destructive border-destructive/40',
          status === 'playing' && 'text-[var(--lang-accent,var(--color-primary))] border-[var(--lang-accent,var(--color-primary))]',
          className,
        )}
      >
        {icon}
        <span>{status === 'error' ? 'Unavailable' : visibleLabel}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void play()}
      aria-label={aria}
      title={aria}
      className={cn(
        'inline-flex items-center justify-center rounded-full shrink-0 transition-colors',
        BOX[size],
        'text-[var(--lang-accent,var(--color-primary))] hover:bg-[var(--lang-accent-soft,var(--color-muted))]',
        status === 'error' && 'text-destructive hover:bg-destructive/10',
        className,
      )}
    >
      {icon}
    </button>
  );
}

export default SpeakButton;
