'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Clock3,
  Copy,
  Languages,
  RotateCcw,
} from 'lucide-react';
import { Button } from '@mobtranslate/ui';
import type { TranslateV2Response } from '@/lib/models/types';

const MODEL_ID = 'kuku-yalanji-nllb-lora';
const MODEL_VERSION = 'v21.2-claude-balanced-replay-guarded-20260714';
const MAX_CHARACTERS = 400;

const EXAMPLES = [
  'The woman saw the water.',
  'The children are sitting here.',
  'We, not you, saw the jalkay salmon there.',
];

type RequestState = 'idle' | 'loading' | 'success' | 'error';

export default function KukuYalanjiTranslatorClient() {
  const [source, setSource] = useState('');
  const [translation, setTranslation] = useState('');
  const [error, setError] = useState('');
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [state, setState] = useState<RequestState>('idle');
  const [copied, setCopied] = useState(false);

  const updateSource = (value: string) => {
    setSource(value);
    if (state === 'success' || state === 'error') {
      setTranslation('');
      setError('');
      setLatencyMs(null);
      setCopied(false);
      setState('idle');
    }
  };

  const translate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = source.trim();
    if (!text || state === 'loading') return;

    setState('loading');
    setError('');
    setTranslation('');
    setLatencyMs(null);
    setCopied(false);

    try {
      const response = await fetch('/api/translate/v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelId: MODEL_ID,
          version: MODEL_VERSION,
          direction: 'eng-gvn',
          text,
          maxNewTokens: 208,
          numBeams: 1,
          noRepeatNgramSize: 4,
          repetitionPenalty: 1.1,
          lengthPenalty: 1,
        }),
      });
      const payload = await response.json() as TranslateV2Response;

      if (!response.ok || !payload.success || !payload.translation) {
        throw new Error(payload.error || 'The model did not return a translation.');
      }

      setTranslation(payload.translation);
      setLatencyMs(payload.latencyMs ?? null);
      setState('success');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Translation failed. Please try again.');
      setState('error');
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
    setError('');
    setLatencyMs(null);
    setState('idle');
    setCopied(false);
  };

  return (
    <main data-language="gvn" className="container-custom py-7 sm:py-9 lg:py-12">
      <header className="max-w-3xl">
        <div className="flex flex-wrap items-center gap-2 text-sm text-foreground/70">
          <span className="rounded-full bg-amber-500/20 px-2.5 py-1 font-medium text-foreground">Research draft</span>
          <span>English to Kuku Yalanji</span>
        </div>
        <h1 className="mt-4 text-3xl font-semibold tracking-normal sm:text-4xl">Translate a sentence</h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-foreground/75">
          Enter one English sentence and review the model&apos;s Kuku Yalanji draft.
        </p>
      </header>

      <form onSubmit={translate} className="mt-7 overflow-hidden rounded-lg border border-border bg-card" aria-label="English to Kuku Yalanji translator">
        <div className="grid lg:grid-cols-2">
          <section className="p-4 sm:p-6" aria-labelledby="english-input-label">
            <div className="flex items-center justify-between gap-4">
              <label id="english-input-label" htmlFor="translation-source" className="text-sm font-semibold">English</label>
              <span className="text-xs tabular-nums text-foreground/65">{source.length}/{MAX_CHARACTERS}</span>
            </div>
            <textarea
              id="translation-source"
              value={source}
              onChange={(event) => updateSource(event.target.value)}
              readOnly={state === 'loading'}
              maxLength={MAX_CHARACTERS}
              rows={7}
              placeholder="Type an English sentence"
              className="mt-3 min-h-44 w-full resize-y rounded-lg border border-input bg-background p-4 text-lg leading-relaxed text-foreground placeholder:text-foreground/55 focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0" aria-label="Example sentences">
              {EXAMPLES.map((example) => (
                <button
                  key={example}
                  type="button"
                  disabled={state === 'loading'}
                  onClick={() => {
                    updateSource(example);
                  }}
                  className="min-h-11 max-w-64 shrink-0 rounded-full bg-muted px-3 text-left text-xs font-medium text-foreground/75 transition-colors hover:bg-border focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {example}
                </button>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-end gap-2 lg:hidden">
              {(source || translation) && (
                <Button type="button" variant="ghost" onClick={reset} disabled={state === 'loading'}>Clear</Button>
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

          <section className="flex min-h-64 flex-col border-t border-border bg-[var(--lang-accent-soft)] p-4 sm:min-h-80 sm:p-6 lg:border-l lg:border-t-0" aria-labelledby="kuku-output-label" aria-live="polite">
            <div className="flex items-center justify-between gap-4">
              <h2 id="kuku-output-label" className="text-sm font-semibold">Kuku Yalanji</h2>
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
                  <p lang="gvn" className="font-display text-3xl font-semibold leading-snug text-foreground sm:text-4xl">{translation}</p>
                  {latencyMs !== null && (
                    <p className="mt-5 flex items-center gap-2 text-xs tabular-nums text-foreground/65">
                      <Clock3 className="h-4 w-4" /> {(latencyMs / 1000).toFixed(1)} seconds
                    </p>
                  )}
                </div>
              ) : state === 'error' ? (
                <div className="animate-fade-in">
                  <AlertTriangle className="h-6 w-6 text-foreground/70" />
                  <p className="mt-3 max-w-md text-sm leading-relaxed text-foreground/80">{error}</p>
                  <Button type="submit" variant="secondary" size="sm" className="mt-5" leftIcon={<RotateCcw className="h-4 w-4" />}>
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
          <p className="text-sm text-foreground/65">Model v21.2 · validated guarded decoder</p>
          <div className="flex gap-2">
            {(source || translation) && (
              <Button type="button" variant="ghost" onClick={reset} disabled={state === 'loading'}>Clear</Button>
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
            This is a synthetic-model draft, not a speaker-certified translation. Check important language with a fluent Kuku Yalanji speaker.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-3">
          <Link href="/dictionaries/kuku_yalanji/research" className="font-medium text-[var(--lang-accent)] hover:underline">Corpus evidence</Link>
          <Link href={`/translate/v2/${MODEL_ID}/${MODEL_VERSION}`} className="font-medium text-[var(--lang-accent)] hover:underline">Model details</Link>
        </div>
      </section>
    </main>
  );
}
