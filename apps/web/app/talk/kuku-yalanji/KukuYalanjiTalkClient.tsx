'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Check,
  ChevronDown,
  Loader2,
  LockKeyhole,
  Mic,
  Play,
  RotateCcw,
  Square,
  Trash2,
  Volume2,
} from 'lucide-react';
import { Button, cn } from '@mobtranslate/ui';
import { useStudioMic } from '@/app/admin/recordings/studio/useStudioMic';
import { SpeakButton } from '@/components/audio/SpeakButton';
import type { CapturedRecording } from '@/lib/recording/types';
import {
  KUKU_YALANJI_VOICE_PROMPTS,
  REQUIRED_KUKU_YALANJI_VOICE_PROMPTS,
  type KukuYalanjiVoicePromptId,
} from '@/lib/kuku-yalanji-speech-prompts';
import type { KukuYalanjiReplyResponse } from '@/lib/kuku-yalanji-speech-types';

type CaptureTarget = KukuYalanjiVoicePromptId | 'sentence';
type PagePhase = 'voice' | 'talk';
type WorkState =
  | 'idle'
  | 'listening'
  | 'understanding'
  | 'replying'
  | 'checking';

interface ConversationTurn {
  id: string;
  transcript: string;
  understanding: string;
  replyEnglish: string;
  replyKuku: string;
  draftKuku: string;
  confidence: 'low' | 'medium';
  note: string;
  evidence: KukuYalanjiReplyResponse['evidence'];
  checking: boolean;
}

const MAX_LISTENING_WAIT_MS = 9 * 60 * 1000;

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function errorMessage(payload: unknown, fallback: string): string {
  if (
    payload &&
    typeof payload === 'object' &&
    'error' in payload &&
    typeof payload.error === 'string'
  ) {
    return payload.error;
  }
  return fallback;
}

function RecordingPlayback({ recording }: { recording: CapturedRecording }) {
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const url = useMemo(
    () => URL.createObjectURL(recording.opusBlob ?? recording.wavBlob),
    [recording],
  );

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      URL.revokeObjectURL(url);
    };
  }, [url]);

  return (
    <button
      type="button"
      className="inline-flex h-11 w-11 items-center justify-center rounded-full text-[var(--lang-accent)] transition-colors hover:bg-[var(--lang-accent-soft)]"
      aria-label={playing ? 'Stop voice example' : 'Hear voice example'}
      title={playing ? 'Stop' : 'Hear your recording'}
      onClick={() => {
        if (playing) {
          audioRef.current?.pause();
          setPlaying(false);
          return;
        }
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => setPlaying(false);
        audio.onerror = () => setPlaying(false);
        setPlaying(true);
        void audio.play().catch(() => setPlaying(false));
      }}
    >
      {playing ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />}
    </button>
  );
}

export default function KukuYalanjiTalkClient() {
  const mic = useStudioMic();
  const [phase, setPhase] = useState<PagePhase>('voice');
  const [selectedPromptId, setSelectedPromptId] =
    useState<KukuYalanjiVoicePromptId>(KUKU_YALANJI_VOICE_PROMPTS[0].id);
  const [voiceExamples, setVoiceExamples] = useState<
    Map<KukuYalanjiVoicePromptId, CapturedRecording>
  >(new Map());
  const voiceExamplesRef = useRef(voiceExamples);
  const [activeCapture, setActiveCapture] = useState<CaptureTarget | null>(
    null,
  );
  const activeCaptureRef = useRef<CaptureTarget | null>(null);
  const captureTimerRef = useRef<number | null>(null);
  const [captureSeconds, setCaptureSeconds] = useState(0);
  const captureStartedAtRef = useRef(0);
  const captureClockRef = useRef<number | null>(null);
  const [sentenceRecording, setSentenceRecording] =
    useState<CapturedRecording | null>(null);
  const [transcript, setTranscript] = useState('');
  const [workState, setWorkState] = useState<WorkState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [turns, setTurns] = useState<ConversationTurn[]>([]);
  const [replyAvailable, setReplyAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/speech/kuku-yalanji/status', {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as { replyAvailable?: unknown };
      })
      .then((status) => {
        if (status) setReplyAvailable(status.replyAvailable === true);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    voiceExamplesRef.current = voiceExamples;
  }, [voiceExamples]);

  const visiblePrompts = KUKU_YALANJI_VOICE_PROMPTS;
  const selectedPrompt =
    visiblePrompts.find((prompt) => prompt.id === selectedPromptId) ??
    visiblePrompts[0];
  const completePromptCount = visiblePrompts.filter((prompt) =>
    voiceExamples.has(prompt.id),
  ).length;
  const canStartTalking =
    voiceExamples.size === REQUIRED_KUKU_YALANJI_VOICE_PROMPTS &&
    !activeCapture;

  const clearCaptureTimers = useCallback(() => {
    if (captureTimerRef.current != null)
      window.clearTimeout(captureTimerRef.current);
    if (captureClockRef.current != null)
      window.clearInterval(captureClockRef.current);
    captureTimerRef.current = null;
    captureClockRef.current = null;
  }, []);

  useEffect(() => clearCaptureTimers, [clearCaptureTimers]);

  const sendForTranscription = useCallback(
    async (recording: CapturedRecording) => {
      const examples = KUKU_YALANJI_VOICE_PROMPTS.flatMap((prompt) => {
        const example = voiceExamplesRef.current.get(prompt.id);
        return example ? [{ prompt, recording: example }] : [];
      });
      if (examples.length < REQUIRED_KUKU_YALANJI_VOICE_PROMPTS) {
        setError('Please record all ten voice examples first.');
        return;
      }

      setWorkState('listening');
      setTranscript('');
      setError(null);
      const form = new FormData();
      form.append(
        'target',
        new File([recording.wavBlob], 'sentence.wav', { type: 'audio/wav' }),
      );
      for (const example of examples) {
        form.append('contextId', example.prompt.id);
        form.append(
          'contextAudio',
          new File([example.recording.wavBlob], `${example.prompt.id}.wav`, {
            type: 'audio/wav',
          }),
        );
      }

      try {
        const response = await fetch('/api/speech/kuku-yalanji/transcribe', {
          method: 'POST',
          body: form,
          cache: 'no-store',
        });
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(
            errorMessage(payload, 'I could not hear that recording.'),
          );
        }
        const { KukuYalanjiAsrResponseSchema } =
          await import('@/lib/kuku-yalanji-speech-types');
        let parsed = KukuYalanjiAsrResponseSchema.safeParse(payload);
        if (!parsed.success)
          throw new Error('The words could not be read from the result.');
        const deadline = Date.now() + MAX_LISTENING_WAIT_MS;
        while ('status' in parsed.data && parsed.data.status === 'pending') {
          if (Date.now() >= deadline) {
            throw new Error(
              'The listener is taking too long to start. Please try again.',
            );
          }
          await delay(parsed.data.retryAfterMs);
          const statusResponse = await fetch(
            '/api/speech/kuku-yalanji/transcribe/status',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ pollToken: parsed.data.pollToken }),
              cache: 'no-store',
            },
          );
          const statusPayload: unknown = await statusResponse
            .json()
            .catch(() => null);
          if (!statusResponse.ok && statusResponse.status !== 202) {
            throw new Error(
              errorMessage(statusPayload, 'I could not hear that recording.'),
            );
          }
          parsed = KukuYalanjiAsrResponseSchema.safeParse(statusPayload);
          if (!parsed.success)
            throw new Error('The words could not be read from the result.');
        }
        if ('status' in parsed.data) {
          throw new Error('The listener did not finish. Please try again.');
        }
        setTranscript(parsed.data.transcript);
        setWorkState('idle');
      } catch (requestError) {
        setWorkState('idle');
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'I could not hear that recording.',
        );
      }
    },
    [],
  );

  const stopCapture = useCallback(async () => {
    const target = activeCaptureRef.current;
    if (!target || !mic.recorder) return;
    activeCaptureRef.current = null;
    setActiveCapture(null);
    clearCaptureTimers();
    try {
      const recording = await mic.recorder.stop();
      if (recording.tooShort) {
        setError('Please speak for a little longer.');
        return;
      }
      if (recording.clipped) {
        setError(
          'That was very loud. Move a little further from the microphone and try again.',
        );
      } else {
        setError(null);
      }
      if (target === 'sentence') {
        setSentenceRecording(recording);
        await sendForTranscription(recording);
        return;
      }
      setVoiceExamples((current) => {
        const next = new Map(current);
        next.set(target, recording);
        return next;
      });
      const currentIndex = visiblePrompts.findIndex(
        (prompt) => prompt.id === target,
      );
      const nextPrompt = visiblePrompts[currentIndex + 1];
      if (nextPrompt) setSelectedPromptId(nextPrompt.id);
    } catch {
      setError('The recording could not be finished. Please try again.');
    }
  }, [clearCaptureTimers, mic.recorder, sendForTranscription, visiblePrompts]);

  const startCapture = useCallback(
    async (target: CaptureTarget) => {
      if (!mic.recorder || activeCaptureRef.current || workState !== 'idle')
        return;
      setError(null);
      try {
        await mic.recorder.start();
        activeCaptureRef.current = target;
        setActiveCapture(target);
        captureStartedAtRef.current = Date.now();
        setCaptureSeconds(0);
        captureClockRef.current = window.setInterval(() => {
          setCaptureSeconds((Date.now() - captureStartedAtRef.current) / 1000);
        }, 100);
        const maxMs = target === 'sentence' ? 30_000 : 12_000;
        captureTimerRef.current = window.setTimeout(() => {
          void stopCapture();
        }, maxMs);
      } catch {
        setError(
          'The microphone could not start. Check your browser permission and try again.',
        );
      }
    },
    [mic.recorder, stopCapture, workState],
  );

  const prepareReply = useCallback(async () => {
    const corrected = transcript.trim();
    if (!corrected || workState !== 'idle' || replyAvailable !== true) return;
    setError(null);
    setWorkState('understanding');
    try {
      const replyResponse = await fetch('/api/speech/kuku-yalanji/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: corrected,
          history: turns.slice(-4).map((turn) => ({
            transcript: turn.transcript,
            understanding: turn.understanding,
            replyEnglish: turn.replyEnglish,
            replyKuku: turn.replyKuku,
          })),
        }),
        cache: 'no-store',
      });
      const replyPayload: unknown = await replyResponse
        .json()
        .catch(() => null);
      if (!replyResponse.ok) {
        throw new Error(
          errorMessage(replyPayload, 'A reply could not be prepared.'),
        );
      }
      const { KukuYalanjiReplyResponseSchema } =
        await import('@/lib/kuku-yalanji-speech-types');
      const reply = KukuYalanjiReplyResponseSchema.parse(replyPayload);

      setWorkState('replying');
      const draftResponse = await fetch('/api/translate/kuku_yalanji', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: reply.replyEnglish,
          mode: 'translate',
          stage: 'draft',
        }),
        cache: 'no-store',
      });
      const draftPayload = (await draftResponse.json().catch(() => null)) as {
        success?: boolean;
        translation?: string;
        error?: string;
        reviewPending?: boolean;
      } | null;
      if (
        !draftResponse.ok ||
        !draftPayload?.success ||
        !draftPayload.translation
      ) {
        throw new Error(
          errorMessage(
            draftPayload,
            'The Kuku Yalanji reply could not be prepared.',
          ),
        );
      }

      const turnId = crypto.randomUUID();
      const reviewPending = draftPayload.reviewPending === true;
      const turn: ConversationTurn = {
        id: turnId,
        transcript: corrected,
        understanding: reply.understanding,
        replyEnglish: reply.replyEnglish,
        replyKuku: draftPayload.translation,
        draftKuku: draftPayload.translation,
        confidence: reply.confidence,
        note: reply.note,
        evidence: reply.evidence,
        checking: reviewPending,
      };
      setTurns((current) => [...current, turn]);
      setTranscript('');
      setSentenceRecording(null);
      if (!reviewPending) {
        setWorkState('idle');
        return;
      }

      setWorkState('checking');

      const checkedResponse = await fetch('/api/translate/kuku_yalanji', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: reply.replyEnglish,
          mode: 'translate',
          stage: 'complete',
        }),
        cache: 'no-store',
      });
      const checkedPayload = (await checkedResponse
        .json()
        .catch(() => null)) as {
        success?: boolean;
        translation?: string;
      } | null;
      setTurns((current) =>
        current.map((item) =>
          item.id === turnId
            ? {
                ...item,
                replyKuku:
                  checkedResponse.ok &&
                  checkedPayload?.success &&
                  checkedPayload.translation
                    ? checkedPayload.translation
                    : item.replyKuku,
                checking: false,
              }
            : item,
        ),
      );
      setWorkState('idle');
    } catch (requestError) {
      setWorkState('idle');
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'A reply could not be prepared.',
      );
    }
  }, [replyAvailable, transcript, turns, workState]);

  const workLabel =
    workState === 'listening'
      ? 'Listening carefully…'
      : workState === 'understanding'
        ? 'Working out the meaning…'
        : workState === 'replying'
          ? 'Preparing a reply…'
          : workState === 'checking'
            ? 'Checking the reply…'
            : null;

  return (
    <div
      data-language="kuku_yalanji"
      className="mx-auto w-full max-w-5xl pb-12"
    >
      <header className="border-b border-border pb-6">
        <div className="flex flex-wrap items-center gap-3 text-sm font-medium text-[var(--lang-accent)]">
          <span className="inline-flex items-center gap-2">
            <Volume2 className="h-4 w-4" aria-hidden="true" /> Kuku Yalanji
          </span>
          <span className="rounded-full bg-[var(--lang-accent-soft)] px-2.5 py-1 text-xs text-foreground">
            Early listening test
          </span>
        </div>
        <h1 className="mt-3 text-3xl font-bold text-foreground sm:text-4xl">
          Talk in Kuku Yalanji
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted-foreground">
          Read ten short lines so the listener can learn your voice. Then say a
          sentence and check what it heard. Spoken replies appear when that
          service is available.
        </p>
        <p className="mt-3 flex max-w-2xl items-start gap-2 text-sm leading-relaxed text-muted-foreground">
          <LockKeyhole
            className="mt-0.5 h-4 w-4 shrink-0 text-[var(--lang-accent)]"
            aria-hidden="true"
          />
          Your recordings go to our speech provider for this session, are
          removed from the temporary job within about seven minutes, and are
          never used for training.
        </p>
      </header>

      <div
        className="mt-5 grid grid-cols-2 border-b border-border text-sm font-medium"
        aria-label="Conversation steps"
      >
        <button
          type="button"
          onClick={() => setPhase('voice')}
          className={cn(
            'border-b-2 px-3 py-3 text-left transition-colors',
            phase === 'voice'
              ? 'border-[var(--lang-accent)] text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          <span className="mr-2 text-xs">1</span> Learn your voice
        </button>
        <button
          type="button"
          disabled={!canStartTalking && phase !== 'talk'}
          onClick={() => canStartTalking && setPhase('talk')}
          className={cn(
            'border-b-2 px-3 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-45',
            phase === 'talk'
              ? 'border-[var(--lang-accent)] text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          <span className="mr-2 text-xs">2</span> Talk
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="mt-5 flex items-start gap-3 border border-destructive/40 bg-destructive/8 px-4 py-3 text-sm text-foreground"
        >
          <AlertCircle
            className="mt-0.5 h-4 w-4 shrink-0 text-destructive"
            aria-hidden="true"
          />
          <span>{error}</span>
        </div>
      )}

      {phase === 'voice' ? (
        <section className="mt-7" aria-labelledby="voice-heading">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2
                id="voice-heading"
                className="text-xl font-semibold text-foreground"
              >
                Read each line aloud
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {completePromptCount} of {REQUIRED_KUKU_YALANJI_VOICE_PROMPTS}{' '}
                recorded. Speak naturally in your own voice.
              </p>
            </div>
            {voiceExamples.size > 0 && (
              <Button
                variant="ghost"
                className="h-9 gap-2 text-sm"
                onClick={() => {
                  setVoiceExamples(new Map());
                  setSelectedPromptId(KUKU_YALANJI_VOICE_PROMPTS[0].id);
                }}
                disabled={Boolean(activeCapture)}
              >
                <Trash2 className="h-4 w-4" /> Clear recordings
              </Button>
            )}
          </div>

          <div className="mt-5 grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <div className="min-h-[22rem] min-w-0 border border-border bg-card p-5 sm:p-7">
              <div className="flex items-center justify-between gap-4 text-sm text-muted-foreground">
                <span>
                  Line{' '}
                  {visiblePrompts.findIndex(
                    (item) => item.id === selectedPrompt.id,
                  ) + 1}{' '}
                  of {REQUIRED_KUKU_YALANJI_VOICE_PROMPTS}
                </span>
                {voiceExamples.has(selectedPrompt.id) && (
                  <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300">
                    <Check className="h-4 w-4" /> Recorded
                  </span>
                )}
              </div>
              <div className="flex min-h-40 flex-col justify-center border-b border-border py-8 text-center">
                <p
                  lang="gvn"
                  className="break-words text-3xl font-semibold leading-snug text-foreground [overflow-wrap:anywhere] sm:text-4xl"
                >
                  {selectedPrompt.kuku}
                </p>
                <p className="mt-3 text-sm text-muted-foreground">
                  {selectedPrompt.english}
                </p>
              </div>

              <div className="mt-6 flex flex-col items-center">
                <button
                  type="button"
                  aria-label={
                    activeCapture === selectedPrompt.id
                      ? 'Stop recording'
                      : `Record line: ${selectedPrompt.kuku}`
                  }
                  onClick={() =>
                    activeCapture === selectedPrompt.id
                      ? void stopCapture()
                      : void startCapture(selectedPrompt.id)
                  }
                  disabled={
                    Boolean(
                      activeCapture && activeCapture !== selectedPrompt.id,
                    ) || workState !== 'idle'
                  }
                  className={cn(
                    'flex h-16 w-16 items-center justify-center rounded-full text-white shadow-sm transition-all',
                    activeCapture === selectedPrompt.id
                      ? 'bg-red-600 hover:bg-red-700'
                      : 'bg-[var(--lang-accent)] hover:brightness-95',
                    'disabled:cursor-not-allowed disabled:opacity-45',
                  )}
                >
                  {activeCapture === selectedPrompt.id ? (
                    <Square className="h-6 w-6" fill="currentColor" />
                  ) : (
                    <Mic className="h-7 w-7" />
                  )}
                </button>
                <p
                  className="mt-3 h-6 text-sm font-medium text-foreground"
                  aria-live="polite"
                >
                  {activeCapture === selectedPrompt.id
                    ? `Recording ${captureSeconds.toFixed(1)}s — tap to stop`
                    : voiceExamples.has(selectedPrompt.id)
                      ? 'Tap to record again'
                      : 'Tap, read the line, then stop'}
                </p>
                <div
                  className="mt-3 h-2 w-full max-w-xs overflow-hidden rounded-full bg-muted"
                  aria-hidden="true"
                >
                  <div
                    className="h-full origin-left bg-[var(--lang-accent)] transition-transform duration-75"
                    style={{
                      transform: `scaleX(${activeCapture ? Math.max(0.03, Math.min(1, mic.level * 5)) : 0})`,
                    }}
                  />
                </div>
                {voiceExamples.has(selectedPrompt.id) && (
                  <div className="mt-3">
                    <RecordingPlayback
                      recording={voiceExamples.get(selectedPrompt.id)!}
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="min-w-0 space-y-2" aria-label="Voice examples">
              {visiblePrompts.map((prompt, index) => {
                const done = voiceExamples.has(prompt.id);
                return (
                  <button
                    key={prompt.id}
                    type="button"
                    onClick={() => setSelectedPromptId(prompt.id)}
                    disabled={Boolean(activeCapture)}
                    className={cn(
                      'flex min-h-12 w-full items-center gap-3 border px-3 py-2 text-left transition-colors',
                      selectedPrompt.id === prompt.id
                        ? 'border-[var(--lang-accent)] bg-[var(--lang-accent-soft)]'
                        : 'border-border hover:bg-muted/60',
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs',
                        done
                          ? 'bg-[var(--lang-accent)] text-white'
                          : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {done ? <Check className="h-3.5 w-3.5" /> : index + 1}
                    </span>
                    <span className="min-w-0">
                      <span
                        lang="gvn"
                        className="block truncate text-sm font-semibold text-foreground"
                      >
                        {prompt.kuku}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {prompt.english}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-border pt-5">
            <Button
              className="h-11 gap-2 bg-[var(--lang-accent)] px-5 text-white hover:brightness-95"
              disabled={!canStartTalking}
              onClick={() => setPhase('talk')}
            >
              Start talking <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </section>
      ) : (
        <section className="mt-7" aria-labelledby="talk-heading">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div>
              <h2
                id="talk-heading"
                className="text-xl font-semibold text-foreground"
              >
                Say one sentence
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Speak for up to 30 seconds, then check every word it heard.
              </p>

              <div className="mt-5 border border-border bg-card p-5 sm:p-7">
                <div className="flex min-h-44 flex-col items-center justify-center">
                  <button
                    type="button"
                    aria-label={
                      activeCapture === 'sentence'
                        ? 'Stop sentence recording'
                        : 'Record a Kuku Yalanji sentence'
                    }
                    onClick={() =>
                      activeCapture === 'sentence'
                        ? void stopCapture()
                        : void startCapture('sentence')
                    }
                    disabled={
                      Boolean(activeCapture && activeCapture !== 'sentence') ||
                      workState !== 'idle'
                    }
                    className={cn(
                      'flex h-20 w-20 items-center justify-center rounded-full text-white shadow-sm transition-all',
                      activeCapture === 'sentence'
                        ? 'bg-red-600 hover:bg-red-700'
                        : 'bg-[var(--lang-accent)] hover:brightness-95',
                      'disabled:cursor-not-allowed disabled:opacity-45',
                    )}
                  >
                    {activeCapture === 'sentence' ? (
                      <Square className="h-7 w-7" fill="currentColor" />
                    ) : workState === 'listening' ? (
                      <Loader2 className="h-8 w-8 animate-spin" />
                    ) : (
                      <Mic className="h-9 w-9" />
                    )}
                  </button>
                  <p
                    className="mt-4 h-6 text-sm font-medium text-foreground"
                    aria-live="polite"
                  >
                    {activeCapture === 'sentence'
                      ? `Recording ${captureSeconds.toFixed(1)}s — tap to stop`
                      : (workLabel ?? 'Tap to speak')}
                  </p>
                  <div
                    className="mt-3 h-2 w-full max-w-sm overflow-hidden rounded-full bg-muted"
                    aria-hidden="true"
                  >
                    <div
                      className="h-full origin-left bg-[var(--lang-accent)] transition-transform duration-75"
                      style={{
                        transform: `scaleX(${activeCapture ? Math.max(0.03, Math.min(1, mic.level * 5)) : 0})`,
                      }}
                    />
                  </div>
                  {sentenceRecording && workState === 'idle' && (
                    <div className="mt-3">
                      <RecordingPlayback recording={sentenceRecording} />
                    </div>
                  )}
                </div>

                {(transcript || workState === 'listening') && (
                  <div className="mt-5 border-t border-border pt-5">
                    <label
                      htmlFor="heard-transcript"
                      className="text-sm font-semibold text-foreground"
                    >
                      What I heard
                    </label>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Fix any words the listener got wrong.
                    </p>
                    {replyAvailable === false && (
                      <p className="mt-3 border-l-2 border-amber-500 pl-3 text-sm leading-relaxed text-muted-foreground">
                        Spoken replies are temporarily unavailable. You can
                        still check and copy what the listener heard.
                      </p>
                    )}
                    <textarea
                      id="heard-transcript"
                      lang="gvn"
                      value={transcript}
                      disabled={workState !== 'idle'}
                      onChange={(event) =>
                        setTranscript(event.target.value.slice(0, 600))
                      }
                      placeholder={
                        workState === 'listening'
                          ? 'Listening…'
                          : 'The words will appear here'
                      }
                      className="mt-3 min-h-28 w-full resize-y border border-input bg-background px-3 py-3 text-lg leading-relaxed text-foreground outline-none transition-colors focus:border-[var(--lang-accent)] focus:ring-2 focus:ring-[var(--lang-accent-soft)] disabled:opacity-60"
                    />
                    <div className="mt-4 flex flex-wrap gap-3">
                      <Button
                        className="h-11 gap-2 bg-[var(--lang-accent)] px-5 text-white hover:brightness-95"
                        disabled={
                          !transcript.trim() ||
                          workState !== 'idle' ||
                          replyAvailable !== true
                        }
                        onClick={() => void prepareReply()}
                      >
                        {replyAvailable === false
                          ? 'Replies unavailable'
                          : 'Reply'}
                        {replyAvailable !== false && (
                          <ArrowRight className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        className="h-11 gap-2"
                        disabled={workState !== 'idle'}
                        onClick={() => {
                          setTranscript('');
                          setSentenceRecording(null);
                        }}
                      >
                        <RotateCcw className="h-4 w-4" /> Try again
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {turns.length > 0 && (
                <div className="mt-8 space-y-5" aria-label="Conversation">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-xl font-semibold text-foreground">
                      Conversation
                    </h2>
                    <Button
                      variant="ghost"
                      className="h-11 gap-2 text-sm"
                      onClick={() => setTurns([])}
                    >
                      <Trash2 className="h-4 w-4" /> Clear
                    </Button>
                  </div>
                  {turns.map((turn) => (
                    <article
                      key={turn.id}
                      className="border border-border bg-card px-4 py-4 sm:px-5"
                    >
                      <div>
                        <p className="text-xs font-semibold uppercase text-muted-foreground">
                          You said
                        </p>
                        <p
                          lang="gvn"
                          className="mt-1 text-lg font-medium text-foreground"
                        >
                          {turn.transcript}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Approximate meaning: {turn.understanding}
                        </p>
                      </div>
                      <div className="mt-4 border-t border-border pt-4">
                        <p className="text-xs font-semibold uppercase text-muted-foreground">
                          Reply
                        </p>
                        <div className="mt-1 flex items-start gap-2">
                          <p
                            lang="gvn"
                            className="min-w-0 flex-1 text-xl font-semibold text-foreground"
                          >
                            {turn.replyKuku}
                          </p>
                          <SpeakButton
                            text={turn.replyKuku}
                            englishText={turn.replyEnglish}
                            lang="kuku_yalanji"
                            variant="labeled"
                            label="Hear reply"
                          />
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {turn.replyEnglish}
                        </p>
                        {turn.checking && (
                          <p
                            className="mt-2 inline-flex items-center gap-2 text-sm text-muted-foreground"
                            aria-live="polite"
                          >
                            <Loader2 className="h-4 w-4 animate-spin" />{' '}
                            Checking the reply…
                          </p>
                        )}
                        <details className="group mt-3 text-sm">
                          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 font-medium text-foreground">
                            <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />{' '}
                            Why this answer?
                          </summary>
                          <div className="mt-2 space-y-2 border-l border-border pl-4 text-muted-foreground">
                            <p>{turn.note}</p>
                            {turn.draftKuku !== turn.replyKuku && (
                              <p>
                                <span className="font-medium text-foreground">
                                  First reply:
                                </span>{' '}
                                <span lang="gvn">{turn.draftKuku}</span>
                              </p>
                            )}
                            {turn.evidence.length > 0 && (
                              <p>
                                Dictionary matches:{' '}
                                {turn.evidence
                                  .filter((item) => item.exact)
                                  .slice(0, 6)
                                  .map(
                                    (item) =>
                                      `${item.headword} (${item.gloss})`,
                                  )
                                  .join(', ') || 'no exact word matches'}
                                .
                              </p>
                            )}
                          </div>
                        </details>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>

            <aside className="space-y-5 text-sm">
              <div className="border border-border p-4">
                <div className="flex items-center gap-2 font-semibold text-foreground">
                  <LockKeyhole className="h-4 w-4 text-[var(--lang-accent)]" />{' '}
                  Your recordings are not saved
                </div>
                <p className="mt-2 leading-relaxed text-muted-foreground">
                  Recordings are sent to our speech provider, removed from the
                  temporary job within about seven minutes, and never used for
                  training.
                </p>
              </div>
              <div className="border border-amber-500/40 bg-amber-500/8 p-4">
                <h3 className="font-semibold text-foreground">
                  Check every word
                </h3>
                <p className="mt-2 leading-relaxed text-muted-foreground">
                  This early test can mishear words and misunderstand meaning.
                  It is not a fluent-speaker check.
                </p>
              </div>
              <div className="border border-border p-4">
                <h3 className="font-semibold text-foreground">
                  About the voice
                </h3>
                <p className="mt-2 leading-relaxed text-muted-foreground">
                  Spoken replies use a computer voice as a pronunciation aid,
                  not a recording of a Kuku Yalanji speaker.
                </p>
              </div>
              <Button
                variant="outline"
                className="h-11 w-full gap-2"
                onClick={() => setPhase('voice')}
              >
                <Mic className="h-4 w-4" /> Change voice examples
              </Button>
            </aside>
          </div>
        </section>
      )}
    </div>
  );
}
