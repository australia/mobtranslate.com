'use client';

import { useState } from 'react';
import { Eye, Mic, Volume2, ArrowRight, Check } from 'lucide-react';
import { Button } from '@mobtranslate/ui';

const STEPS = [
  {
    icon: Eye,
    title: 'We show you a word',
    body: 'A word in your language appears in big letters, with what it means in English underneath.',
  },
  {
    icon: Mic,
    title: 'Say it out loud',
    body: 'Tap the big red button once to start, say the word, then tap it again to stop. Take your time.',
  },
  {
    icon: Volume2,
    title: 'Listen, then keep it',
    body: 'Play your recording back. Happy with it? Tap Keep. Not quite right? Tap Record again. That’s it.',
  },
];

/**
 * First-run, plain-language walkthrough. Three steps, one screen each, fully
 * skippable, and re-openable any time from Help. No jargon.
 */
export function Walkthrough({ onDone, onSkip }: { onDone: () => void; onSkip: () => void }) {
  const [i, setI] = useState(0);
  const step = STEPS[i];
  const Icon = step.icon;
  const last = i === STEPS.length - 1;

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col px-6" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))', paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>
      <div className="flex justify-end pt-2">
        <Button variant="ghost" size="lg" className="text-base text-muted-foreground" onClick={onSkip}>
          Skip
        </Button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <div className="flex h-28 w-28 items-center justify-center rounded-full bg-[var(--color-primary)]/12">
          <Icon className="h-14 w-14 text-[var(--color-primary)]" strokeWidth={1.75} />
        </div>
        <p className="mt-4 text-base font-semibold uppercase tracking-wide text-muted-foreground">
          Step {i + 1} of {STEPS.length}
        </p>
        <h1 className="mt-2 text-3xl font-bold leading-tight text-foreground text-balance">{step.title}</h1>
        <p className="mt-4 max-w-sm text-xl leading-relaxed text-muted-foreground text-pretty">{step.body}</p>
      </div>

      <div className="flex items-center justify-center gap-2 py-6" aria-hidden>
        {STEPS.map((_, idx) => (
          <span
            key={idx}
            className={`h-2.5 rounded-full transition-all duration-200 motion-reduce:transition-none ${idx === i ? 'w-8 bg-[var(--color-primary)]' : 'w-2.5 bg-border'}`}
          />
        ))}
      </div>

      <Button
        size="lg"
        fullWidth
        className="h-16 text-xl"
        leftIcon={last ? <Check className="h-6 w-6" /> : undefined}
        onClick={() => (last ? onDone() : setI((n) => n + 1))}
      >
        {last ? 'Let’s start' : 'Next'}
        {!last && <ArrowRight className="ml-2 h-6 w-6" />}
      </Button>
    </div>
  );
}
