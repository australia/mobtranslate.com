'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { GraduationCap, Check, X, Mic, Square, Play, RotateCcw, Info, Trophy, ChevronLeft } from 'lucide-react';
import { Button, Input, cn } from '@mobtranslate/ui';
import { SpeakButton } from '@/components/audio/SpeakButton';
import type { Lesson } from '@/lib/lessons/content';

export function LessonView({ lesson }: { lesson: Lesson }) {
  return (
    <div data-language={lesson.languageCode} className="mx-auto max-w-2xl px-4 pb-24 pt-6">
      <Link href={`/lessons/${lesson.languageCode}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" /> All lessons
      </Link>

      {/* Header */}
      <header className="mt-3">
        <div className="flex items-center gap-2 text-[var(--lang-accent,var(--color-primary))]">
          <GraduationCap className="h-5 w-5" />
          <span className="text-sm font-semibold uppercase tracking-wide">{lesson.languageName} · Lesson {lesson.number}</span>
        </div>
        <h1 className="mt-2 font-display text-4xl font-bold text-foreground">{lesson.title}</h1>
        <p className="mt-1 font-display text-xl text-[var(--lang-accent,var(--color-primary))]">{lesson.subtitle}</p>
        <p className="mt-3 text-lg text-muted-foreground">{lesson.intro}</p>
        <ul className="mt-4 space-y-1.5">
          {lesson.objectives.map((o) => (
            <li key={o} className="flex items-start gap-2 text-foreground">
              <Check className="mt-1 h-4 w-4 flex-shrink-0 text-[var(--color-secondary)]" />
              <span>{o}</span>
            </li>
          ))}
        </ul>
      </header>

      {lesson.confirmNote && (
        <p className="mt-5 flex items-start gap-2 rounded-xl border border-border bg-muted/50 p-3 text-sm text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
          {lesson.confirmNote}
        </p>
      )}

      {/* Vocabulary */}
      <Section title="Words to know" step={1}>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {lesson.vocab.map((v) => (
            <div key={v.term} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
              <SpeakButton text={v.term} englishText={v.gloss} lang={lesson.languageCode} size="md" />
              <div className="min-w-0 flex-1">
                <p className="font-display text-lg font-semibold text-foreground">
                  {v.term} {v.confirm && <ToConfirm />}
                </p>
                <p className="text-sm text-muted-foreground">{v.gloss}</p>
                {v.note && <p className="text-xs text-muted-foreground/80">{v.note}</p>}
              </div>
            </div>
          ))}
        </div>
        <SynthNote />
      </Section>

      {/* Phrases */}
      <Section title="Say it" step={2}>
        <div className="space-y-3">
          {lesson.phrases.map((p) => (
            <div key={p.term} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-start gap-3">
                <SpeakButton
                  text={p.term.replace(/…/g, '')}
                  englishText={p.gloss}
                  lang={lesson.languageCode}
                  size="lg"
                />
                <div className="min-w-0 flex-1">
                  <p className="font-display text-2xl font-bold text-foreground">
                    {p.term} {p.confirm && <ToConfirm />}
                  </p>
                  <p className="mt-1 text-base text-foreground">{p.gloss}</p>
                  {p.literal && <p className="mt-0.5 text-sm italic text-muted-foreground">{p.literal}</p>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Build your introduction */}
      <Section title="Build your introduction" step={3}>
        <IntroBuilder lesson={lesson} />
      </Section>

      {/* Practice out loud */}
      <Section title="Now you try" step={4}>
        <p className="mb-3 text-base text-muted-foreground">Record yourself saying “{lesson.subtitle}” and play it back. (Stays on your device.)</p>
        <PracticeRecorder />
      </Section>

      {/* Quiz */}
      <Section title="Check yourself" step={5}>
        <Quiz lesson={lesson} />
      </Section>

      {lesson.sourceNote && <p className="mt-8 text-center text-sm text-muted-foreground">{lesson.sourceNote}</p>}
    </div>
  );
}

function Section({ title, step, children }: { title: string; step: number; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 flex items-center gap-2 text-xl font-bold text-foreground">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--lang-accent-soft,var(--color-muted))] text-sm font-bold text-[var(--lang-accent,var(--color-primary))]">{step}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function ToConfirm() {
  return <span className="ml-1 align-middle rounded-full bg-[var(--color-warning)]/15 px-2 py-0.5 text-[11px] font-medium text-[var(--color-warning)]">to confirm</span>;
}

function SynthNote() {
  return <p className="mt-2 text-xs text-muted-foreground">🔊 Audio is a synthesized guide — listen to a speaker for the true sound.</p>;
}

function IntroBuilder({ lesson }: { lesson: Lesson }) {
  const [name, setName] = useState('');
  const [place, setPlace] = useState('');
  const fill = (s: string) => s.replace('{name}', name.trim() || '…').replace('{place}', place.trim() || '…');

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-foreground">Your name</span>
          <Input size="lg" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mary" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-foreground">Your place / country</span>
          <Input size="lg" value={place} onChange={(e) => setPlace(e.target.value)} placeholder="e.g. Mossman" />
        </label>
      </div>
      <div className="mt-4 space-y-2">
        {lesson.builder.lines.map((line, i) => {
          const text = fill(line.template);
          return (
            <div key={i} className="flex items-center gap-3 rounded-xl bg-muted/50 p-3">
              <SpeakButton
                text={text.replace(/…/g, '').replace(/-mun/g, 'mun')}
                englishText={fill(line.gloss)}
                lang={lesson.languageCode}
                size="md"
              />
              <div className="min-w-0 flex-1">
                <p className="font-display text-lg font-semibold text-foreground">
                  {text} {line.confirm && <ToConfirm />}
                </p>
                <p className="text-sm text-muted-foreground">{fill(line.gloss)}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Quiz({ lesson }: { lesson: Lesson }) {
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const score = useMemo(
    () => lesson.quiz.reduce((n, q, i) => (answers[i] === q.answer ? n + 1 : n), 0),
    [answers, lesson.quiz],
  );
  const done = Object.keys(answers).length === lesson.quiz.length;

  return (
    <div className="space-y-4">
      {lesson.quiz.map((q, i) => {
        const chosen = answers[i];
        return (
          <div key={i} className="rounded-2xl border border-border bg-card p-4">
            <p className="mb-3 text-base font-medium text-foreground">
              {q.ask === 'meaning' ? (
                <>What does <span className="font-display font-bold text-[var(--lang-accent,var(--color-primary))]">{q.prompt}</span> mean?</>
              ) : (
                <>How do you say <span className="font-semibold">“{q.prompt}”</span>?</>
              )}
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {q.options.map((opt) => {
                const isChosen = chosen === opt;
                const isCorrect = opt === q.answer;
                const show = chosen != null;
                return (
                  <button
                    key={opt}
                    type="button"
                    disabled={chosen != null}
                    onClick={() => setAnswers((a) => ({ ...a, [i]: opt }))}
                    className={cn(
                      'flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left text-base transition-colors',
                      !show && 'border-border hover:border-[var(--lang-accent,var(--color-primary))] hover:bg-muted',
                      show && isCorrect && 'border-[var(--color-secondary)] bg-[var(--color-secondary)]/10 text-foreground',
                      show && isChosen && !isCorrect && 'border-[var(--color-destructive)] bg-[var(--color-destructive)]/10 text-foreground',
                      show && !isChosen && !isCorrect && 'border-border opacity-60',
                    )}
                  >
                    <span>{opt}</span>
                    {show && isCorrect && <Check className="h-4 w-4 flex-shrink-0 text-[var(--color-secondary)]" />}
                    {show && isChosen && !isCorrect && <X className="h-4 w-4 flex-shrink-0 text-[var(--color-destructive)]" />}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {done && (
        <div className="flex items-center gap-3 rounded-2xl border border-[var(--color-secondary)]/40 bg-[var(--color-secondary)]/10 p-4">
          <Trophy className="h-8 w-8 flex-shrink-0 text-[var(--color-secondary)]" />
          <div className="flex-1">
            <p className="text-lg font-bold text-foreground">
              {score === lesson.quiz.length ? 'Perfect! Lesson complete 🎉' : `You got ${score} / ${lesson.quiz.length}`}
            </p>
            <p className="text-sm text-muted-foreground">Practise the phrases out loud, then move on when you’re ready.</p>
          </div>
          <Button variant="outline" size="sm" leftIcon={<RotateCcw className="h-4 w-4" />} onClick={() => setAnswers({})}>
            Retry
          </Button>
        </div>
      )}
    </div>
  );
}

function PracticeRecorder() {
  type S = 'idle' | 'recording' | 'recorded';
  const [state, setState] = useState<S>('idle');
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const urlRef = useRef<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const start = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        urlRef.current = URL.createObjectURL(new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' }));
        setState('recorded');
      };
      mediaRef.current = mr;
      mr.start();
      setState('recording');
    } catch {
      setError('We couldn’t use the microphone. Check your browser’s permission.');
    }
  };
  const stop = () => mediaRef.current?.stop();
  const play = () => {
    if (!urlRef.current) return;
    if (!audioRef.current) {
      audioRef.current = new Audio(urlRef.current);
      audioRef.current.onended = () => setPlaying(false);
    }
    audioRef.current.src = urlRef.current;
    audioRef.current.currentTime = 0;
    void audioRef.current.play();
    setPlaying(true);
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-5 text-center">
      {state === 'recording' ? (
        <Button size="lg" variant="destructive" className="h-14 px-8 text-lg" leftIcon={<Square className="h-5 w-5" fill="currentColor" />} onClick={stop}>
          Stop
        </Button>
      ) : state === 'recorded' ? (
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button size="lg" className="h-14 px-8 text-lg" leftIcon={<Play className="h-5 w-5" fill="currentColor" />} onClick={play} disabled={playing}>
            {playing ? 'Playing…' : 'Hear yourself'}
          </Button>
          <Button size="lg" variant="outline" className="h-14 px-6 text-lg" leftIcon={<RotateCcw className="h-5 w-5" />} onClick={start}>
            Again
          </Button>
        </div>
      ) : (
        <Button size="lg" className="h-14 px-8 text-lg" leftIcon={<Mic className="h-6 w-6" />} onClick={start}>
          Record yourself
        </Button>
      )}
      {error && <p className="mt-3 text-sm text-[var(--color-destructive)]">{error}</p>}
    </div>
  );
}
