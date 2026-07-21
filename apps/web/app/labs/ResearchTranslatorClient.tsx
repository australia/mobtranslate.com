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

export type ResearchTranslatorConfig = {
  apiPath: string;
  dataLanguage: string;
  targetLang: string;
  targetName: string;
  modelLabel: string;
  directionLabel: string;
  title: string;
  description: string;
  notice: string;
  disclaimer: string;
  examples: string[];
  dictionaryHref: string;
  dictionaryLabel: string;
  docsHref: string;
  docsLabel: string;
  activePath: string;
  maxCharacters?: number;
};

type ResearchResponse = {
  success: boolean;
  translation?: string;
  latencyMs?: number;
  model?: string;
  error?: string;
};

type RequestState = 'idle' | 'loading' | 'success' | 'error';

const TRANSLATORS = [
  { href: '/labs/v2', label: 'Kuku Yalanji' },
  { href: '/labs/migmaq', label: "Mi'gmaq" },
];

export default function ResearchTranslatorClient({ config }: { config: ResearchTranslatorConfig }) {
  const maxCharacters = config.maxCharacters ?? 400;
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
      const response = await fetch(config.apiPath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const payload = (await response.json()) as ResearchResponse;

      if (!response.ok || !payload.success || !payload.translation) {
        throw new Error(payload.error || 'The model did not return a translation.');
      }

      setTranslation(payload.translation);
      setModelId(payload.model ?? config.modelLabel);
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
    <main data-language={config.dataLanguage} className="container-custom py-7 sm:py-9 lg:py-12">
      <nav aria-label="Research translators" className="mb-7 flex w-fit max-w-full gap-1 overflow-x-auto rounded-lg bg-muted p-1">
        {TRANSLATORS.map((translator) => {
          const active = translator.href === config.activePath;
          return (
            <Link
              key={translator.href}
              href={translator.href}
              aria-current={active ? 'page' : undefined}
              className={`inline-flex min-h-11 shrink-0 items-center rounded-md px-3 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring ${
                active ? 'bg-background text-foreground shadow-sm' : 'text-foreground/70 hover:text-foreground'
              }`}
            >
              {translator.label}
            </Link>
          );
        })}
      </nav>

      <header className="max-w-3xl">
        <div className="flex flex-wrap items-center gap-2 text-sm text-foreground/70">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/20 px-2.5 py-1 font-medium text-foreground">
            <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />
            Research preview
          </span>
          <span>{config.directionLabel} · {config.modelLabel}</span>
        </div>
        <h1 className="mt-4 text-3xl font-semibold tracking-normal sm:text-4xl">{config.title}</h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-foreground/75">{config.description}</p>
      </header>

      <div
        role="note"
        className="mt-6 flex gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm leading-relaxed text-foreground sm:p-5"
      >
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden="true" />
        <p><strong className="font-semibold">Research preview.</strong> {config.notice}</p>
      </div>

      <form
        onSubmit={translate}
        className="mt-7 overflow-hidden rounded-lg border border-border bg-card"
        aria-label={`English to ${config.targetName} research translator`}
      >
        <div className="grid lg:grid-cols-2">
          <section className="min-w-0 p-4 sm:p-6" aria-labelledby={`${config.dataLanguage}-english-label`}>
            <div className="flex items-center justify-between gap-4">
              <label id={`${config.dataLanguage}-english-label`} htmlFor={`${config.dataLanguage}-source`} className="text-sm font-semibold">
                English
              </label>
              <span className="shrink-0 text-xs tabular-nums text-foreground/65">{source.length}/{maxCharacters}</span>
            </div>
            <textarea
              id={`${config.dataLanguage}-source`}
              value={source}
              onChange={(event) => updateSource(event.target.value)}
              onKeyDown={onKeyDown}
              aria-keyshortcuts="Enter"
              readOnly={state === 'loading'}
              maxLength={maxCharacters}
              rows={7}
              placeholder="Write an English sentence"
              className="mt-3 min-h-44 w-full resize-y rounded-lg border border-input bg-background p-4 text-lg leading-relaxed text-foreground placeholder:text-foreground/55 focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <div className="-mx-1 mt-4 flex gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0" aria-label="Example sentences">
              {config.examples.map((example) => (
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
                <Button type="button" variant="ghost" onClick={reset} disabled={state === 'loading'}>Clear</Button>
              )}
              <Button type="submit" loading={state === 'loading'} loadingText="Translating" disabled={!source.trim()} leftIcon={<ArrowRight className="h-4 w-4" />}>
                Translate
              </Button>
            </div>
          </section>

          <section
            className="flex min-h-64 min-w-0 flex-col border-t border-border bg-[var(--lang-accent-soft)] p-4 sm:min-h-80 sm:p-6 lg:border-l lg:border-t-0"
            aria-labelledby={`${config.dataLanguage}-output-label`}
            aria-live="polite"
          >
            <div className="flex items-center justify-between gap-4">
              <h2 id={`${config.dataLanguage}-output-label`} className="text-sm font-semibold">{config.targetName}</h2>
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
                  <p lang={config.targetLang} className="break-words font-display text-3xl font-semibold leading-snug text-foreground sm:text-4xl">{translation}</p>
                  <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs tabular-nums text-foreground/65">
                    {latencyMs !== null && (
                      <span className="inline-flex items-center gap-2"><Clock3 className="h-4 w-4" /> {(latencyMs / 1000).toFixed(1)} seconds</span>
                    )}
                    {modelId && (
                      <span className="inline-flex items-center gap-1.5"><FlaskConical className="h-3.5 w-3.5" /> {modelId}</span>
                    )}
                  </div>
                </div>
              ) : state === 'error' ? (
                <div className="animate-fade-in">
                  <AlertTriangle className="h-6 w-6 text-foreground/70" />
                  <p className="mt-3 max-w-md text-sm leading-relaxed text-foreground/80">{error}</p>
                  <Button type="submit" variant="secondary" size="sm" className="mt-5" leftIcon={<RotateCcw className="h-4 w-4" />}>Try again</Button>
                </div>
              ) : (
                <div className="text-foreground/60">
                  <Languages className="h-8 w-8" />
                  <p className="mt-3 text-sm">Your {config.targetName} draft will appear here.</p>
                </div>
              )}
            </div>
          </section>
        </div>

        <div className="hidden gap-3 border-t border-border bg-background px-6 py-4 lg:flex lg:items-center lg:justify-between">
          <p className="text-sm text-foreground/65">{config.modelLabel} · experimental · {config.directionLabel}</p>
          <div className="flex gap-2">
            {(source || translation) && (
              <Button type="button" variant="ghost" onClick={reset} disabled={state === 'loading'}>Clear</Button>
            )}
            <Button type="submit" loading={state === 'loading'} loadingText="Translating" disabled={!source.trim()} leftIcon={<ArrowRight className="h-4 w-4" />}>Translate</Button>
          </div>
        </div>
      </form>

      <section className="mt-6 flex flex-col gap-4 border-t border-border pt-5 text-sm text-foreground/70 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex max-w-2xl gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <p className="leading-relaxed">{config.disclaimer}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-3">
          <Link href={config.dictionaryHref} className="font-medium text-[var(--lang-accent)] hover:underline">{config.dictionaryLabel}</Link>
          <Link href={config.docsHref} className="font-medium text-[var(--lang-accent)] hover:underline">{config.docsLabel}</Link>
        </div>
      </section>
    </main>
  );
}
