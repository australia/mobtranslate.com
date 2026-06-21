'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, Square, Play, Pause, RotateCcw, Check, AlertTriangle, SkipForward, Volume2, Pencil } from 'lucide-react';
import { Button, cn } from '@mobtranslate/ui';
import { StudioRecorder, type MicState } from '@/lib/recording/recorder';
import type { CapturedRecording } from '@/lib/recording/types';
import { LevelMeter } from './LevelMeter';

export interface RecorderTarget {
  kind: 'word' | 'phrase' | 'sentence';
  label: string;
  gloss: string | null;
  wordId?: string | null;
  targetId?: string | null;
  exampleId?: string | null;
  isCorrection?: boolean;
  supersedesId?: string | null;
}

interface RecorderProps {
  target: RecorderTarget | null;
  speakerName: string | null;
  onSave: (captured: CapturedRecording) => Promise<void> | void;
  onSkip?: () => void;
  /** Open the word editor (only meaningful for dictionary words). */
  onEditWord?: () => void;
}

const MIC_HELP: Partial<Record<MicState, { title: string; body: string }>> = {
  denied: {
    title: 'Microphone is blocked',
    body: 'Your browser is blocking the microphone. Click the lock icon in the address bar, allow the microphone, then try again.',
  },
  nomic: {
    title: 'No microphone found',
    body: 'Plug in or connect a microphone, then try again. A headset or USB microphone gives the clearest recordings.',
  },
  inuse: {
    title: 'Microphone is busy',
    body: 'Another app may be using the microphone. Close other apps (like video calls), then try again.',
  },
  error: {
    title: 'Could not open the microphone',
    body: 'Something went wrong starting the microphone. Please try again.',
  },
};

/** Best-effort haptic feedback (Android/Chrome; silently no-op on iOS). */
function buzz(pattern: number | number[]) {
  try {
    (navigator as Navigator & { vibrate?: (p: number | number[]) => boolean }).vibrate?.(pattern);
  } catch {
    /* unsupported */
  }
}

export function Recorder({ target, speakerName, onSave, onSkip, onEditWord }: RecorderProps) {
  const recorderRef = useRef<StudioRecorder | null>(null);
  const [micState, setMicState] = useState<MicState>('idle');
  const [micDetail, setMicDetail] = useState<string | undefined>();
  const [level, setLevel] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [take, setTake] = useState<CapturedRecording | null>(null);
  const [saving, setSaving] = useState(false);

  // playback
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const [playing, setPlaying] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef(0);

  // Lazily create the recorder once.
  if (!recorderRef.current && typeof window !== 'undefined') {
    recorderRef.current = new StudioRecorder({
      onLevel: setLevel,
      onState: (s, detail) => {
        setMicState(s);
        setMicDetail(detail);
      },
    });
  }

  const clearTake = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    audioRef.current?.pause();
    audioRef.current = null;
    setPlaying(false);
    setTake(null);
  }, []);

  // Drop any pending take when the target changes.
  useEffect(() => {
    clearTake();
    setElapsed(0);
  }, [target?.label, target?.wordId, target?.targetId, clearTake]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      recorderRef.current?.close();
    };
  }, []);

  const turnOnMic = useCallback(async () => {
    try {
      await recorderRef.current?.open();
    } catch {
      /* state is surfaced via onState */
    }
  }, []);

  const startRecording = useCallback(async () => {
    clearTake();
    try {
      await recorderRef.current?.start();
      buzz(40);
      setIsRecording(true);
      startedAtRef.current = Date.now();
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed(Date.now() - startedAtRef.current), 100);
    } catch {
      setIsRecording(false);
    }
  }, [clearTake]);

  const stopRecording = useCallback(async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    try {
      const captured = await recorderRef.current?.stop();
      buzz([30, 40, 30]);
      setIsRecording(false);
      if (captured) {
        setTake(captured);
        const blob = captured.opusBlob ?? captured.wavBlob;
        const url = URL.createObjectURL(blob);
        objectUrlRef.current = url;
        const audio = new Audio(url);
        audio.onended = () => setPlaying(false);
        audio.onpause = () => setPlaying(false);
        audio.onplay = () => setPlaying(true);
        audioRef.current = audio;
      }
    } catch {
      setIsRecording(false);
    }
  }, []);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.currentTime = 0;
      audio.play().catch(() => setPlaying(false));
    } else {
      audio.pause();
    }
  }, []);

  const handleSave = useCallback(async () => {
    if (!take) return;
    setSaving(true);
    try {
      await onSave(take);
      buzz(120);
      clearTake();
      setElapsed(0);
    } finally {
      setSaving(false);
    }
  }, [take, onSave, clearTake]);

  // ---- Empty state ----
  if (!target) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border bg-card p-12 text-center min-h-[24rem]">
        <Volume2 className="h-12 w-12 text-muted-foreground" />
        <h2 className="mt-4 text-2xl font-semibold text-foreground">Pick a word to record</h2>
        <p className="mt-2 max-w-sm text-lg text-muted-foreground">
          Choose a word or phrase to record, or add a new one.
        </p>
      </div>
    );
  }

  const micOn = micState === 'ready' || micState === 'recording';
  const help = MIC_HELP[micState];
  const secs = Math.floor(elapsed / 1000);
  const timeLabel = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;

  return (
    <div className="rounded-2xl border border-border bg-card p-6 sm:p-8 shadow-sm">
      {/* What to say */}
      <div className="text-center">
        <div className="flex items-center justify-center gap-2 text-sm font-medium uppercase tracking-wide text-muted-foreground">
          {target.isCorrection ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-warning)]/15 px-3 py-1 text-[var(--color-warning)]">
              Correcting a recording
            </span>
          ) : (
            <span>{target.kind === 'sentence' ? 'Say this sentence' : target.kind === 'phrase' ? 'Say this phrase' : 'Say this word'}</span>
          )}
        </div>
        <p
          className={cn(
            'mt-3 font-display font-bold leading-tight text-foreground break-words',
            target.label.length > 40 ? 'text-2xl sm:text-3xl' : 'text-4xl sm:text-5xl',
          )}
          lang="und"
        >
          {target.label}
        </p>
        {target.gloss && <p className="mt-2 text-xl text-muted-foreground">“{target.gloss}”</p>}
        {target.wordId && onEditWord && (
          <button
            type="button"
            onClick={onEditWord}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Pencil className="h-4 w-4" />
            Edit word &amp; meaning
          </button>
        )}
      </div>

      {/* Mic guidance / off state */}
      {!micOn && (
        <div className="mt-8 flex flex-col items-center">
          {help ? (
            <div className="w-full max-w-md rounded-xl border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 p-5 text-center">
              <AlertTriangle className="mx-auto h-8 w-8 text-[var(--color-warning)]" />
              <h3 className="mt-2 text-lg font-semibold text-foreground">{help.title}</h3>
              <p className="mt-1 text-base text-muted-foreground">{help.body}</p>
              {micDetail && <p className="mt-1 text-sm text-muted-foreground/80">{micDetail}</p>}
            </div>
          ) : (
            <p className="text-lg text-muted-foreground">Turn on your microphone to begin.</p>
          )}
          <Button
            size="lg"
            className="mt-5 h-14 px-8 text-lg"
            leftIcon={<Mic className="h-6 w-6" />}
            onClick={turnOnMic}
            loading={micState === 'requesting'}
            loadingText="Starting microphone…"
          >
            {help ? 'Try again' : 'Turn on microphone'}
          </Button>
        </div>
      )}

      {/* Live meter + controls */}
      {micOn && (
        <div className="mt-8">
          <div className="mb-2 flex items-center justify-between">
            <span className="inline-flex items-center gap-2 text-base font-medium text-[var(--color-secondary)]">
              <span className="relative flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-secondary)] opacity-60" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-[var(--color-secondary)]" />
              </span>
              Microphone is on and working
            </span>
            {isRecording && (
              <span className="font-mono text-lg tabular-nums text-[var(--color-destructive)]">● {timeLabel}</span>
            )}
          </div>
          <LevelMeter level={level} active={micOn} />

          {/* Primary action zone */}
          <div className="mt-8 flex flex-col items-center gap-6">
            {!take ? (
              <button
                type="button"
                onClick={isRecording ? stopRecording : startRecording}
                aria-label={isRecording ? 'Stop recording' : 'Start recording'}
                className={cn(
                  'flex h-36 w-36 flex-col items-center justify-center gap-1 rounded-full text-white shadow-lg transition-transform active:scale-95 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ring)]',
                  isRecording
                    ? 'bg-[var(--color-destructive)] hover:bg-[var(--color-destructive-hover)] animate-pulse'
                    : 'bg-[var(--color-destructive)] hover:bg-[var(--color-destructive-hover)]',
                )}
              >
                {isRecording ? <Square className="h-12 w-12" fill="currentColor" /> : <Mic className="h-14 w-14" />}
                <span className="text-base font-semibold">{isRecording ? 'Stop' : 'Record'}</span>
              </button>
            ) : (
              <ReviewControls
                take={take}
                playing={playing}
                onPlay={togglePlay}
                onRedo={startRecording}
                onSave={handleSave}
                saving={saving}
              />
            )}

            {!take && onSkip && !isRecording && (
              <Button variant="ghost" size="lg" className="text-base text-muted-foreground" leftIcon={<SkipForward className="h-5 w-5" />} onClick={onSkip}>
                Skip for now
              </Button>
            )}
          </div>
        </div>
      )}

      {!speakerName && micOn && (
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Tip: choose the speaker at the top so each recording is credited correctly.
        </p>
      )}
    </div>
  );
}

function ReviewControls({
  take,
  playing,
  onPlay,
  onRedo,
  onSave,
  saving,
}: {
  take: CapturedRecording;
  playing: boolean;
  onPlay: () => void;
  onRedo: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  const secs = (take.durationMs / 1000).toFixed(1);
  return (
    <div className="flex w-full max-w-md flex-col items-center gap-5">
      <button
        type="button"
        onClick={onPlay}
        aria-label={playing ? 'Pause playback' : 'Play your recording'}
        className="flex h-24 w-24 items-center justify-center rounded-full bg-[var(--color-secondary)] text-white shadow-lg transition-transform active:scale-95 hover:bg-[var(--color-secondary-hover)] focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ring)]"
      >
        {playing ? <Pause className="h-10 w-10" fill="currentColor" /> : <Play className="h-10 w-10" fill="currentColor" />}
      </button>
      <p className="text-base text-muted-foreground">
        {secs}s recorded{' '}
        {take.tooShort && <span className="ml-1 font-medium text-[var(--color-warning)]">· very short — did you get the whole word?</span>}
        {take.clipped && !take.tooShort && <span className="ml-1 font-medium text-[var(--color-warning)]">· a bit loud, try moving back</span>}
      </p>

      <div className="flex w-full flex-col gap-3 sm:flex-row">
        <Button
          size="lg"
          className="h-14 flex-1 text-lg"
          leftIcon={<Check className="h-6 w-6" />}
          onClick={onSave}
          loading={saving}
          loadingText="Saving…"
        >
          Save &amp; next
        </Button>
        <Button
          size="lg"
          variant="outline"
          className="h-14 flex-1 text-lg"
          leftIcon={<RotateCcw className="h-5 w-5" />}
          onClick={onRedo}
          disabled={saving}
        >
          Record again
        </Button>
      </div>
    </div>
  );
}
