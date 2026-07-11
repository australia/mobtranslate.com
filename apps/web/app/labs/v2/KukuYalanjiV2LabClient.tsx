'use client';

import { useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Clock3,
  Copy,
  FlaskConical,
  Languages,
  RotateCcw,
} from 'lucide-react';
import { Button } from '@mobtranslate/ui';

const MAX_CHARACTERS = 400;

const EXAMPLES = [
  'The woman went down to the river.',
  'The children are sitting here.',
  'We saw the kangaroo in the bush yesterday.',
  'I am hungry and I want to eat fish.',
];

interface LabsV2Response {
  success: boolean;
  translation?: string;
  latencyMs?: number;
  model?: string;
  error?: string;
}

type RequestState = 'idle' | 'loading' | 'success' | 'error';

export default function KukuYalanjiV2LabClient() {
  const [source, setSource] = useState('');
  const [translation, setTranslation] = useState('');
  const [modelId, setModelId] = useState('');
  const [error, setError] = useState('');
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [state, setState] = useState<RequestState>('idle');
  const [copied, setCopied] = useState(false);

  const updateSource = (value: string) => {
    setSource(value);
    if (state === 'success' || state === 'error') {
      setTranslation('');
      setModelId('');
      setError('');
      setLatencyMs(null);
      setCopied(false);
      setState('idle');
    }
  };

  const translate = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    const text = source.trim();
    if (!text || state === 'loading') return;

    setState('loading');
    setError('');
    setTranslation('');
    setModelId('');
    setLatencyMs(null);
    setCopied(false);

    try {
      const response = await fetch('/api/labs/v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const payload = (await response.json()) as LabsV2Response;

      if (!response.ok || !payload.success || !payload.translation) {
        throw new Error(payload.error || 'The model did not return a translation.');
      }

      setTranslation(payload.translation);
      setModelId(payload.model ?? 'v21.2-claude-balanced-replay');
      setLatencyMs(payload.latencyMs ?? null);
      setState('success');
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Translation failed. Please try again.',
      );
      setState('error');
    }
  };

  // Enter submits; Shift+Enter inserts a newline.
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void translate();
    }
  };

  const copyTranslation = async () => {
    if (!translation) return;
    try {
      await navigator.clipboard.writeText(translation);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const reset = () => {
    setSource('');
    setTranslation('');
    setModelId('');
    setError('');
    setLatencyMs(null);
    setState('idle');
    setCopied(false);
  };

  return (
    <main data-language="gvn" className="container-custom py-7 sm:py-9 lg:py-12">
      <header className="max-w-3xl">
        <div className="flex flex-wrap items-center gap-2 text-sm text-foreground/70">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/20 px-2.5 py-1 font-medium text-foreground">
            <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />
            Research preview
          </span>
          <span>English to Kuku Yalanji · model v21.2</span>
        </div>
        <h1 className="mt-4 text-3xl font-semibold tracking-normal sm:text-4xl">
          Kuku Yalanji translator (v2)
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-foreground/75">
          Write one English sentence and see a live draft from our experimental v21.2
          model. This is a research tool, separate from the dictionary — it is here so we
          can study how well the model translates.
        </p>
      </header>

      {/* Prominent, unmissable research-preview notice. */}
      <div
        role="note"
        className="mt-6 flex gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm leading-relaxed text-foreground sm:p-5"
      >
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
        <p>
          <strong className="font-semibold">Research preview.</strong>{' '}
          Machine translation from an experimental model (v21.2).{' '}
          <strong className="font-semibold">Not elder-verified; may contain errors.</strong>{' '}
          The{' '}
          <Link href="/dictionaries/kuku_yalanji" className="font-medium underline underline-offset-2">
            dictionary
          </Link>{' '}
          and human recordings remain the authoritative sources.
        </p>
      </div>

      <form
        onSubmit={translate}
        className="mt-7 overflow-hidden rounded-lg border border-border bg-card"
        aria-label="English to Kuku Yalanji research translator"
      >
        <div className="grid lg:grid-cols-2">
          <section className="p-4 sm:p-6" aria-labelledby="labs-english-label">
            <div className="flex items-center justify-between gap-4">
              <label id="labs-english-label" htmlFor="labs-source" className="text-sm font-semibold">
                English
              </label>
              <span className="text-xs tabular-nums text-foreground/65">
                {source.length}/{MAX_CHARACTERS}
              </span>
            </div>
            <textarea
              id="labs-source"
              value={source}
              onChange={(event) => updateSource(event.target.value)}
              onKeyDown={onKeyDown}
              readOnly={state === 'loading'}
              maxLength={MAX_CHARACTERS}
              rows={7}
              placeholder="Write an English sentence…"
              className="mt-3 min-h-44 w-full resize-y rounded-lg border border-input bg-background p-4 text-lg leading-relaxed text-foreground placeholder:text-foreground/55 focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="mt-2 text-xs text-foreground/55">
              Press <kbd className="rounded border border-border px-1 py-0.5 font-sans">Enter</kbd> to
              translate · <kbd className="rounded border border-border px-1 py-0.5 font-sans">Shift</kbd>+
              <kbd className="rounded border border-border px-1 py-0.5 font-sans">Enter</kbd> for a new line
            </p>
            <div
              className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
              aria-label="Example sentences"
            >
              {EXAMPLES.map((example) => (
                <button
                  key={example}
                  type="button"
                  disabled={state === 'loading'}
                  onClick={() => updateSource(example)}
                  className="min-h-11 max-w-72 shrink-0 rounded-full bg-muted px-3 text-left text-xs font-medium text-foreground/75 transition-colors hover:bg-border focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {example}
                </button>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-end gap-2 lg:hidden">
              {(source || translation) && (
                <Button type="button" variant="ghost" onClick={reset} disabled={state === 'loading'}>
                  Clear
                </Button>
              )}
              <Button
                type="submit"
                loading={state === 'loading'}
                loadingText="Translating"
                disabled={!source.trim()}
                leftIcon={<ArrowRight className="h-4 w-4" />}
              >
                Translate
              </Button>
            </div>
          </section>

          <section
            className="flex min-h-64 flex-col border-t border-border bg-[var(--lang-accent-soft)] p-4 sm:min-h-80 sm:p-6 lg:border-l lg:border-t-0"
            aria-labelledby="labs-kuku-label"
            aria-live="polite"
          >
            <div className="flex items-center justify-between gap-4">
              <h2 id="labs-kuku-label" className="text-sm font-semibold">
                Kuku Yalanji
              </h2>
              {state === 'success' && (
                <button
                  type="button"
                  onClick={copyTranslation}
                  title="Copy translation"
                  aria-label="Copy translation"
                  className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-foreground/70 hover:bg-background/60 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {copied ? <Check className="h-5 w-5" /> : <Copy className="h-5 w-5" />}
                </button>
              )}
            </div>

            <div className="flex flex-1 flex-col justify-center py-8">
              {state === 'loading' ? (
                <div className="space-y-3" aria-label="Generating translation">
                  <div className="h-8 w-4/5 animate-pulse rounded bg-foreground/10" />
                  <div className="h-8 w-3/5 animate-pulse rounded bg-foreground/10" />
                  <div className="mt-6 h-4 w-28 animate-pulse rounded bg-foreground/10" />
                </div>
              ) : state === 'success' ? (
                <div className="animate-fade-in">
                  <p
                    lang="gvn"
                    className="font-display text-3xl font-semibold leading-snug text-foreground sm:text-4xl"
                  >
                    {translation}
                  </p>
                  <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs tabular-nums text-foreground/65">
                    {latencyMs !== null && (
                      <span className="inline-flex items-center gap-2">
                        <Clock3 className="h-4 w-4" /> {(latencyMs / 1000).toFixed(1)} seconds
                      </span>
                    )}
                    {modelId && (
                      <span className="inline-flex items-center gap-1.5">
                        <FlaskConical className="h-3.5 w-3.5" /> {modelId}
                      </span>
                    )}
                  </div>
                </div>
              ) : state === 'error' ? (
                <div className="animate-fade-in">
                  <AlertTriangle className="h-6 w-6 text-foreground/70" />
                  <p className="mt-3 max-w-md text-sm leading-relaxed text-foreground/80">{error}</p>
                  <Button
                    type="submit"
                    variant="secondary"
                    size="sm"
                    className="mt-5"
                    leftIcon={<RotateCcw className="h-4 w-4" />}
                  >
                    Try again
                  </Button>
                </div>
              ) : (
                <div className="text-foreground/60">
                  <Languages className="h-8 w-8" />
                  <p className="mt-3 text-sm">Your Kuku Yalanji draft will appear here.</p>
                </div>
              )}
            </div>
          </section>
        </div>

        <div className="hidden gap-3 border-t border-border bg-background px-6 py-4 lg:flex lg:items-center lg:justify-between">
          <p className="text-sm text-foreground/65">
            Model v21.2 · experimental · English → Kuku Yalanji
          </p>
          <div className="flex gap-2">
            {(source || translation) && (
              <Button type="button" variant="ghost" onClick={reset} disabled={state === 'loading'}>
                Clear
              </Button>
            )}
            <Button
              type="submit"
              loading={state === 'loading'}
              loadingText="Translating"
              disabled={!source.trim()}
              leftIcon={<ArrowRight className="h-4 w-4" />}
            >
              Translate
            </Button>
          </div>
        </div>
      </form>

      <section className="mt-6 flex flex-col gap-4 border-t border-border pt-5 text-sm text-foreground/70 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex max-w-2xl gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <p className="leading-relaxed">
            Draft output from an experimental model — not a speaker-certified translation. Please
            check important language with a fluent Kuku Yalanji speaker before relying on it.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-3">
          <Link
            href="/dictionaries/kuku_yalanji"
            className="font-medium text-[var(--lang-accent)] hover:underline"
          >
            Dictionary
          </Link>
          <Link href="/translate/v2" className="font-medium text-[var(--lang-accent)] hover:underline">
            Translate (v1 draft)
          </Link>
        </div>
      </section>
    </main>
  );
}
