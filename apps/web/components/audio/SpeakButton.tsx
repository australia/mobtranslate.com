'use client';

import React, { useRef, useState, useCallback } from 'react';
import { Volume2, Loader2, AlertCircle } from 'lucide-react';
import { cn } from '@mobtranslate/ui';
import { track } from '@/lib/analytics';

type Status = 'idle' | 'loading' | 'playing' | 'error';

interface SpeakButtonProps {
  /** The Indigenous-language text to pronounce. */
  text: string;
  /** Dictionary/language code, selects the donor voice (e.g. "kuku_yalanji"). */
  lang?: string;
  /** "icon" = round icon button; "labeled" = icon + text. */
  variant?: 'icon' | 'labeled';
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  className?: string;
}

const ICON_SIZE = { sm: 14, md: 16, lg: 20 } as const;
const BOX = { sm: 'h-8 w-8', md: 'h-9 w-9', lg: 'h-11 w-11' } as const;

/**
 * Plays synthesized pronunciation from /api/tts (Edge TTS donor voice).
 * The audio is a phonetic approximation, never a Kuku Yalanji speaker — callers
 * should surface a "needs community verification" note alongside generated text.
 */
export function SpeakButton({
  text,
  lang,
  variant = 'icon',
  size = 'md',
  label = 'Hear pronunciation',
  className,
}: SpeakButtonProps) {
  const [status, setStatus] = useState<Status>('idle');
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const play = useCallback(async () => {
    if (status === 'loading' || status === 'playing') {
      audioRef.current?.pause();
      setStatus('idle');
      return;
    }
    if (!text.trim()) return;

    track('tts_play', { lang: lang ?? 'unknown', text_length: text.length });
    setStatus('loading');
    try {
      const url = `/api/tts?text=${encodeURIComponent(text)}${lang ? `&lang=${encodeURIComponent(lang)}` : ''}`;
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onplaying = () => setStatus('playing');
      audio.onended = () => setStatus('idle');
      audio.onerror = () => setStatus('error');
      await audio.play();
    } catch {
      setStatus('error');
    }
  }, [text, lang, status]);

  const iconSize = ICON_SIZE[size];
  const icon =
    status === 'loading' ? (
      <Loader2 size={iconSize} className="animate-spin" />
    ) : status === 'error' ? (
      <AlertCircle size={iconSize} />
    ) : (
      <Volume2 size={iconSize} className={cn(status === 'playing' && 'animate-pulse')} />
    );

  const aria =
    status === 'error' ? 'Pronunciation unavailable' : status === 'playing' ? 'Stop' : label;

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
          'inline-flex items-center gap-2 rounded-lg border border-border px-3 h-9 text-sm font-medium',
          'text-foreground hover:bg-muted transition-colors',
          status === 'error' && 'text-destructive border-destructive/40',
          status === 'playing' && 'text-[var(--lang-accent,var(--color-primary))] border-[var(--lang-accent,var(--color-primary))]',
          className,
        )}
      >
        {icon}
        <span>{status === 'error' ? 'Unavailable' : label}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={play}
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
