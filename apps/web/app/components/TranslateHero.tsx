'use client';

import React, { useEffect, useState, useRef } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Check,
  ArrowLeftRight,
  ChevronDown,
  Copy,
  ExternalLink,
  GitCompare,
  Languages,
  Loader2,
  MessageSquare,
} from 'lucide-react';
import { SpeakButton } from '@/components/audio/SpeakButton';
import Translator from './Translator';
import { TranslationCorrectionDialog } from '@/components/improvements/TranslationCorrectionDialog';
import { track } from '@/lib/analytics';
import type { Language } from '@/lib/supabase/types';
import type {
  KukuYalanjiDraftInference,
  KukuYalanjiHybridInference,
  TranslationCacheState,
} from '@/lib/kuku-yalanji-hybrid-types';
import type {
  ReverseDictionaryExactInference,
  ReverseTranslationInference,
} from '@/lib/reverse-translation-types';

interface TranslateHeroProps {
  languages: Language[];
}

const EXAMPLES = ['Hello', 'Thank you', 'Water', 'My friend'];
const MAX_TRANSLATION_CHARS = 400;

type Mode = 'translate' | 'chat';
type Direction = 'to_language' | 'to_english';

interface TranslationResult {
  translation: string;
  gloss?: string;
  inference?:
    | KukuYalanjiHybridInference
    | KukuYalanjiDraftInference
    | ReverseTranslationInference
    | ReverseDictionaryExactInference
    | {
        route: 'custom_model';
        modelId: string;
        version: string;
        task: 'translate';
        latencyMs: number;
        validation: 'unverified_research_preview';
      }
    | {
        route: 'dictionary_prompt';
        modelId: string;
        cache: { translation: TranslationCacheState };
      }
    | {
        route: 'dictionary_exact';
        validation: 'dictionary_record';
        modelId: 'mobtranslate-dictionary';
        dictionaryRevision: string;
        sourceUrl: string;
      };
}

const REVIEW_DECISION_LABELS: Record<
  KukuYalanjiHybridInference['review']['decision'],
  string
> = {
  dictionary_exact: 'Found in the dictionary',
  kept_draft: 'No supported change found',
  revised_draft: 'Adjusted after checking',
  insufficient_evidence: 'Some parts could not be checked',
  review_unavailable: 'Only the first translation is available',
};

const REVIEW_SUPPORT_LABELS: Record<
  KukuYalanjiHybridInference['review']['confidence'],
  string
> = {
  low: 'Limited support',
  medium: 'Some support',
  high: 'Strong support',
};

export default function TranslateHero({ languages }: TranslateHeroProps) {
  const [mode, setMode] = useState<Mode>('translate');
  const [direction, setDirection] = useState<Direction>('to_language');
  const [input, setInput] = useState('');
  const [target, setTarget] = useState(
    languages.find((l) => l.code === 'kuku_yalanji')?.code ||
      languages[0]?.code ||
      'kuku_yalanji',
  );
  const [loading, setLoading] = useState(false);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [result, setResult] = useState<TranslationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [reverseExamples, setReverseExamples] = useState<string[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const requestSequenceRef = useRef(0);

  const targetName =
    languages.find((l) => l.code === target)?.name || 'Indigenous';
  const languageTag = target === 'kuku_yalanji' ? 'gvn' : target;
  const reversed = direction === 'to_english';
  // The left pane is always the source, the right pane always the output —
  // swapping changes which language sits on each side, not which pane you type in.
  const sourceName = reversed ? targetName : 'English';
  const outputName = reversed ? 'English' : targetName;
  const sourceLanguageTag = reversed ? languageTag : 'en';
  const outputLanguageTag = reversed ? 'en' : languageTag;
  const reverseInference =
    result?.inference?.route === 'dictionary_reverse_review'
      ? result.inference
      : null;
  const reverseExactInference =
    result?.inference?.route === 'dictionary_exact_reverse'
      ? result.inference
      : null;
  const hybridInference =
    result?.inference?.route === 'huggingface_grammar_review'
      ? result.inference
      : null;
  const exactDictionaryInference =
    result?.inference?.route === 'dictionary_exact' ? result.inference : null;
  const dictionaryExact =
    Boolean(exactDictionaryInference) ||
    hybridInference?.review.decision === 'dictionary_exact';
  const draftInference =
    result?.inference?.route === 'huggingface_draft' ? result.inference : null;

  // Reverse mode asks the reader to type in a language they may not know, so
  // the example chips have to come from that language's own dictionary rather
  // than the fixed English list.
  useEffect(() => {
    if (!reversed) {
      setReverseExamples([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/dictionaries/${encodeURIComponent(target)}/words?limit=60`,
        );
        if (!res.ok) return;
        const data = await res.json();
        const words: string[] = (data?.data ?? [])
          .map((entry: { word?: string }) => entry.word)
          .filter(
            (word: unknown): word is string =>
              typeof word === 'string' && word.trim().length > 1,
          );
        if (cancelled || words.length === 0) return;
        const picked: string[] = [];
        const pool = [...words];
        while (picked.length < 4 && pool.length > 0) {
          picked.push(
            ...pool.splice(Math.floor(Math.random() * pool.length), 1),
          );
        }
        setReverseExamples(picked);
      } catch {
        // Examples are a convenience; never surface a failure for them.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reversed, target]);

  const translate = async () => {
    if (!input.trim()) return;
    const requestSequence = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestSequence;
    const sourceText = input;
    const targetLanguage = target;
    const requestDirection = direction;
    track('translate', {
      language: target,
      text_length: input.trim().length,
      direction: requestDirection,
    });
    setLoading(true);
    setReviewLoading(false);
    setError(null);
    setReviewError(null);
    setResult(null);
    try {
      // Reverse has no fine-tuned model to draft with, so it is a single call.
      const draftStage =
        targetLanguage === 'kuku_yalanji' && requestDirection === 'to_language';
      const res = await fetch(`/api/translate/${targetLanguage}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: sourceText,
          mode: 'translate',
          direction: requestDirection,
          ...(draftStage ? { stage: 'draft' } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok || data.success === false) {
        throw new Error(data.error || 'Translation failed');
      }
      if (requestSequenceRef.current !== requestSequence) return;
      setResult({
        translation: data.translation,
        gloss: data.gloss,
        inference: data.inference,
      });

      const shouldReview =
        data.reviewPending === true &&
        data.inference?.route === 'huggingface_draft';
      if (shouldReview) {
        setLoading(false);
        setReviewLoading(true);
        try {
          const reviewResponse = await fetch(
            `/api/translate/${targetLanguage}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                text: sourceText,
                mode: 'translate',
                direction: requestDirection,
                stage: 'review',
              }),
            },
          );
          const reviewData = await reviewResponse.json();
          if (!reviewResponse.ok || reviewData.success === false) {
            throw new Error(
              reviewData.error || 'The translation check did not finish.',
            );
          }
          if (requestSequenceRef.current !== requestSequence) return;
          setResult({
            translation: reviewData.translation,
            gloss: reviewData.gloss,
            inference: reviewData.inference,
          });
        } catch {
          if (requestSequenceRef.current !== requestSequence) return;
          setReviewError(
            'We could not finish checking this translation. The first translation is still shown.',
          );
        } finally {
          if (requestSequenceRef.current === requestSequence) {
            setReviewLoading(false);
          }
        }
      }
    } catch (e) {
      if (requestSequenceRef.current !== requestSequence) return;
      setError(
        e instanceof Error ? e.message : 'Something went wrong. Try again.',
      );
    } finally {
      if (requestSequenceRef.current === requestSequence) setLoading(false);
    }
  };

  const copy = async () => {
    if (!result?.translation) return;
    await navigator.clipboard.writeText(result.translation);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const swap = () => {
    requestSequenceRef.current += 1;
    const nextDirection: Direction = reversed ? 'to_language' : 'to_english';
    // Carry the translation up into the input, the way a two-pane translator
    // does — the text is already in the language that is about to become the
    // source. With no result yet, leave whatever the user typed alone.
    if (result?.translation) setInput(result.translation);
    setDirection(nextDirection);
    setLoading(false);
    setReviewLoading(false);
    setResult(null);
    setError(null);
    setReviewError(null);
    track('translate_swap_direction', {
      language: target,
      direction: nextDirection,
    });
    inputRef.current?.focus();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') translate();
  };

  return (
    <div id="translate" className="max-w-3xl mx-auto scroll-mt-24">
      {/* Mode toggle + language picker */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <div
          className="inline-flex rounded-lg bg-[rgba(255,255,255,0.08)] p-1 text-sm"
          role="tablist"
          aria-label="Mode"
        >
          {(['translate', 'chat'] as Mode[]).map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              onClick={() => {
                requestSequenceRef.current += 1;
                setMode(m);
                // Chat is English-in only; reverse has no meaning there.
                if (m === 'chat') setDirection('to_language');
                setLoading(false);
                setReviewLoading(false);
                setResult(null);
                setError(null);
                setReviewError(null);
                track('hero_mode_switch', { mode: m });
              }}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md font-medium transition-colors ${
                mode === m
                  ? 'bg-[#faf8f5] text-[#33180c]'
                  : 'text-[#faf8f5]/70 hover:text-[#faf8f5]'
              }`}
            >
              {m === 'translate' ? (
                <Languages className="w-3.5 h-3.5" />
              ) : (
                <MessageSquare className="w-3.5 h-3.5" />
              )}
              {m === 'translate' ? 'Translate' : 'Chat'}
            </button>
          ))}
        </div>

        <label className="inline-flex items-center gap-2 text-sm text-[#faf8f5]/70">
          <span className="hidden sm:inline">Into</span>
          <select
            value={target}
            onChange={(e) => {
              requestSequenceRef.current += 1;
              setTarget(e.target.value);
              setLoading(false);
              setReviewLoading(false);
              setResult(null);
              setError(null);
              setReviewError(null);
            }}
            aria-label="Target language"
            className="rounded-lg border border-[rgba(255,255,255,0.15)] bg-[rgba(255,255,255,0.08)] text-[#faf8f5] px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#ecb485]/50"
          >
            {languages.map((l) => (
              <option
                key={l.code}
                value={l.code}
                className="bg-[#33180c] text-[#faf8f5]"
              >
                {l.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {mode === 'chat' ? (
        <Translator availableLanguages={languages} showExamples />
      ) : (
        <>
          <div
            data-language={target}
            className="grid grid-cols-1 md:grid-cols-2 rounded-2xl border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.05)] overflow-hidden"
          >
            {/* Source input */}
            <div className="relative p-5 md:border-r border-[rgba(255,255,255,0.1)] flex flex-col">
              <div className="flex items-center justify-between mb-3">
                <span
                  className={`text-xs font-medium uppercase tracking-[0.15em] ${
                    reversed ? 'text-[#ecb485]' : 'text-[#faf8f5]/50'
                  }`}
                >
                  {sourceName}
                </span>
                {reversed && input.trim() && (
                  <SpeakButton
                    text={input}
                    lang={target}
                    className="text-[#ecb485] hover:bg-[rgba(255,255,255,0.1)]"
                  />
                )}
              </div>
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => {
                  requestSequenceRef.current += 1;
                  setInput(e.target.value);
                  setLoading(false);
                  setReviewLoading(false);
                  setResult(null);
                  setError(null);
                  setReviewError(null);
                }}
                onKeyDown={onKey}
                lang={sourceLanguageTag}
                placeholder={`Enter ${sourceName} text…`}
                aria-label={`${sourceName} text to translate`}
                maxLength={MAX_TRANSLATION_CHARS}
                rows={4}
                className="flex-1 w-full resize-none bg-transparent text-[#faf8f5] text-lg leading-relaxed placeholder:text-[#faf8f5]/35 focus:outline-none"
              />
              <div className="flex items-center justify-between mt-3">
                <span className="text-xs text-[#faf8f5]/40">
                  {input.length} / {MAX_TRANSLATION_CHARS}
                </span>
                <button
                  onClick={translate}
                  disabled={!input.trim() || loading || reviewLoading}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#ecb485] text-[#33180c] font-semibold px-4 py-2 text-sm hover:bg-[#f4d2b5] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ArrowRight className="w-4 h-4" />
                  )}
                  Translate
                </button>
              </div>

              {/* Swap direction — on the divider between the two panes */}
              <button
                onClick={swap}
                disabled={loading || reviewLoading}
                aria-label={`Translate ${outputName} to ${sourceName} instead`}
                title={`Swap to ${outputName} → ${sourceName}`}
                className="absolute z-10 inline-flex h-11 w-11 items-center justify-center rounded-full border border-[rgba(255,255,255,0.15)] bg-[#33180c] text-[#ecb485] shadow-lg transition-colors hover:border-[#ecb485]/60 hover:bg-[#3f2011] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ecb485]/60 disabled:opacity-40 disabled:cursor-not-allowed bottom-[-22px] left-1/2 -translate-x-1/2 md:bottom-auto md:left-auto md:right-[-22px] md:top-1/2 md:-translate-y-1/2 md:translate-x-0"
              >
                <ArrowLeftRight
                  className="h-4 w-4 rotate-90 md:rotate-0"
                  aria-hidden="true"
                />
              </button>
            </div>

            {/* Output */}
            <div className="p-5 flex flex-col min-h-[180px] bg-[rgba(255,255,255,0.02)]">
              <div className="flex items-center justify-between mb-3">
                <span
                  className={`text-xs font-medium uppercase tracking-[0.15em] ${
                    reversed ? 'text-[#faf8f5]/50' : 'text-[#ecb485]'
                  }`}
                >
                  {outputName}
                </span>
                {result?.translation && !reversed && (
                  <SpeakButton
                    text={result.translation}
                    englishText={input}
                    lang={target}
                    className="text-[#ecb485] hover:bg-[rgba(255,255,255,0.1)]"
                  />
                )}
              </div>

              <div className="flex-1" aria-live="polite">
                {loading ? (
                  <div className="space-y-3">
                    <div className="space-y-3" aria-hidden="true">
                      <div className="h-7 w-2/3 rounded bg-[rgba(255,255,255,0.12)] animate-pulse" />
                      <div className="h-4 w-1/2 rounded bg-[rgba(255,255,255,0.07)] animate-pulse" />
                    </div>
                    <p className="text-xs leading-relaxed text-[#faf8f5]/55">
                      {reversed || target !== 'kuku_yalanji'
                        ? 'Translating with dictionary evidence…'
                        : 'Translating…'}
                    </p>
                  </div>
                ) : error ? (
                  <div
                    className="flex items-start gap-2 text-[#faf8f5]/80"
                    role="alert"
                  >
                    <AlertTriangle className="w-4 h-4 mt-1 text-[#f4a056] shrink-0" />
                    <div>
                      <p className="text-sm mb-2">{error}</p>
                      <button
                        onClick={translate}
                        className="text-sm font-medium text-[#ecb485] hover:underline"
                      >
                        Try again
                      </button>
                    </div>
                  </div>
                ) : result?.translation ? (
                  <>
                    <p
                      className="font-display text-2xl md:text-3xl leading-snug text-[#faf8f5]"
                      lang={outputLanguageTag}
                    >
                      {result.translation}
                    </p>
                    {reverseInference?.review.breakdown ? (
                      <p className="mt-2 text-sm text-[#faf8f5]/55">
                        <span className="font-medium text-[#faf8f5]/65">
                          Word by word:{' '}
                        </span>
                        {reverseInference.review.breakdown}
                      </p>
                    ) : reverseExactInference &&
                      reverseExactInference.senses.length > 1 ? (
                      <p className="mt-2 text-sm text-[#faf8f5]/55">
                        <span className="font-medium text-[#faf8f5]/65">
                          {reverseExactInference.senses.length} dictionary
                          entries share this spelling
                        </span>
                      </p>
                    ) : (
                      result.gloss && (
                        <p className="mt-2 text-sm text-[#faf8f5]/55">
                          <span className="font-medium text-[#faf8f5]/65">
                            Approximate meaning:{' '}
                          </span>
                          {result.gloss}
                        </p>
                      )
                    )}
                    {reviewLoading && draftInference && (
                      <div
                        className="mt-4 border-t border-[rgba(255,255,255,0.08)] pt-3"
                        role="status"
                      >
                        <div className="flex items-center gap-2 text-sm text-[#faf8f5]/70">
                          <Loader2 className="h-4 w-4 animate-spin text-[#ecb485]" />
                          <span>Checking key words and grammar…</span>
                        </div>
                        <div className="mt-3 space-y-2" aria-hidden="true">
                          <div className="h-2.5 w-4/5 rounded bg-[rgba(255,255,255,0.09)] animate-pulse" />
                          <div className="h-2.5 w-3/5 rounded bg-[rgba(255,255,255,0.06)] animate-pulse" />
                        </div>
                      </div>
                    )}
                    {reviewError && (
                      <p
                        className="mt-4 border-t border-[rgba(255,255,255,0.08)] pt-3 text-sm text-[#faf8f5]/60"
                        role="status"
                      >
                        {reviewError}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-[#faf8f5]/35 text-lg">
                    Translation appears here.
                  </p>
                )}
              </div>

              {result?.translation && (
                <>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-4 pt-3 border-t border-[rgba(255,255,255,0.08)] text-xs text-[#faf8f5]/55">
                    <button
                      onClick={copy}
                      className="inline-flex min-h-11 items-center gap-1.5 hover:text-[#faf8f5] transition-colors"
                    >
                      {copied ? (
                        <Check className="w-3.5 h-3.5" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                    <span className="inline-flex items-center gap-1.5">
                      {dictionaryExact || reverseExactInference ? (
                        <BookOpen className="w-3.5 h-3.5" />
                      ) : (
                        <AlertTriangle className="w-3.5 h-3.5" />
                      )}
                      {reverseExactInference
                        ? 'Dictionary entry · source-linked'
                        : reverseInference
                          ? 'Dictionary-guided AI · needs community verification'
                          : exactDictionaryInference
                            ? 'From the dictionary'
                            : dictionaryExact
                              ? 'Dictionary result · source-linked'
                              : hybridInference
                                ? 'AI suggestion · not checked by a fluent speaker'
                                : draftInference
                                  ? reviewLoading
                                    ? 'First translation · checks still running'
                                    : 'First translation · checks could not be completed'
                                  : result.inference?.route === 'custom_model'
                                    ? 'MobTranslate v24.3 research model · unverified draft'
                                    : 'Dictionary-guided AI · needs community verification'}
                      {(exactDictionaryInference || reverseExactInference) && (
                        <a
                          href={
                            (exactDictionaryInference ?? reverseExactInference)!
                              .sourceUrl
                          }
                          className="inline-flex items-center gap-1 text-[#ecb485] hover:underline"
                        >
                          View entry
                          <ExternalLink
                            className="h-3 w-3"
                            aria-hidden="true"
                          />
                        </a>
                      )}
                    </span>
                    {!reviewLoading && (
                      <TranslationCorrectionDialog
                        languageCode={target}
                        sourceText={input}
                        currentTranslation={result.translation}
                        triggerClassName="inline-flex min-h-11 items-center gap-1.5 text-[#faf8f5]/55 hover:text-[#ecb485] transition-colors"
                      />
                    )}
                  </div>

                  {reverseInference && (
                    <details className="group mt-1 border-t border-[rgba(255,255,255,0.08)]">
                      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-md py-2 text-left text-sm text-[#faf8f5]/75 transition-colors hover:text-[#faf8f5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ecb485]/60 [&::-webkit-details-marker]:hidden">
                        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5">
                          <GitCompare className="h-4 w-4 shrink-0 text-[#ecb485]" />
                          <span className="font-medium">Why this result?</span>
                          <span className="basis-full pl-6 text-xs text-[#faf8f5]/45 sm:basis-auto sm:pl-0">
                            {
                              REVIEW_SUPPORT_LABELS[
                                reverseInference.review.confidence
                              ]
                            }
                          </span>
                        </span>
                        <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none" />
                      </summary>

                      <div className="pb-1 text-sm leading-relaxed text-[#faf8f5]/70">
                        <section className="border-t border-[rgba(255,255,255,0.08)] py-4">
                          <h3 className="mb-2 font-sans text-sm font-semibold text-[#faf8f5]">
                            How this was read
                          </h3>
                          <p>{reverseInference.review.summary}</p>
                        </section>

                        {reverseInference.review.evidence.length > 0 && (
                          <section className="border-t border-[rgba(255,255,255,0.08)] py-4">
                            <h3 className="mb-2 flex items-center gap-2 font-sans text-sm font-semibold text-[#faf8f5]">
                              <BookOpen className="h-4 w-4 text-[#ecb485]" />{' '}
                              Dictionary entries used
                            </h3>
                            <ul className="divide-y divide-[rgba(255,255,255,0.07)]">
                              {reverseInference.review.evidence.map(
                                (evidence) => (
                                  <li
                                    key={evidence.id}
                                    className="py-2.5 first:pt-0 last:pb-0"
                                  >
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="min-w-0">
                                        <p
                                          className="font-medium text-[#faf8f5]/85"
                                          lang={languageTag}
                                        >
                                          {evidence.title}
                                        </p>
                                        <p className="mt-0.5 text-xs text-[#faf8f5]/55">
                                          {evidence.detail}
                                        </p>
                                        <p className="mt-0.5 text-xs text-[#faf8f5]/40">
                                          {evidence.sourceLabel}
                                        </p>
                                      </div>
                                      <a
                                        href={evidence.sourceUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        aria-label={`Open source for ${evidence.title}`}
                                        title={evidence.sourceLabel}
                                        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-[#ecb485] hover:bg-[rgba(255,255,255,0.08)] hover:text-[#f4d2b5]"
                                      >
                                        <ExternalLink className="h-3.5 w-3.5" />
                                      </a>
                                    </div>
                                  </li>
                                ),
                              )}
                            </ul>
                          </section>
                        )}

                        {reverseInference.review.caveats.length > 0 && (
                          <section className="border-t border-[rgba(255,255,255,0.08)] py-4">
                            <h3 className="mb-2 font-sans text-sm font-semibold text-[#faf8f5]">
                              What could not be checked
                            </h3>
                            <ul className="space-y-1.5 pl-5 text-[#faf8f5]/60 list-disc">
                              {reverseInference.review.caveats.map((caveat) => (
                                <li key={caveat}>{caveat}</li>
                              ))}
                            </ul>
                          </section>
                        )}
                      </div>
                    </details>
                  )}

                  {hybridInference && (
                    <details className="group mt-1 border-t border-[rgba(255,255,255,0.08)]">
                      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-md py-2 text-left text-sm text-[#faf8f5]/75 transition-colors hover:text-[#faf8f5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ecb485]/60 [&::-webkit-details-marker]:hidden">
                        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5">
                          <GitCompare className="h-4 w-4 shrink-0 text-[#ecb485]" />
                          <span className="font-medium">Why this result?</span>
                          <span className="basis-full pl-6 text-xs text-[#faf8f5]/45 sm:basis-auto sm:pl-0">
                            {
                              REVIEW_DECISION_LABELS[
                                hybridInference.review.decision
                              ]
                            }
                          </span>
                        </span>
                        <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none" />
                      </summary>

                      <div className="pb-1 text-sm leading-relaxed text-[#faf8f5]/70">
                        <section className="border-t border-[rgba(255,255,255,0.08)] py-4">
                          <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                            <h3 className="font-sans text-sm font-semibold text-[#faf8f5]">
                              How it was checked
                            </h3>
                            <span className="text-xs text-[#faf8f5]/45">
                              {
                                REVIEW_DECISION_LABELS[
                                  hybridInference.review.decision
                                ]
                              }{' '}
                              ·{' '}
                              {
                                REVIEW_SUPPORT_LABELS[
                                  hybridInference.review.confidence
                                ]
                              }
                            </span>
                          </div>
                          <p>{hybridInference.review.summary}</p>
                          {hybridInference.review.changes.length > 0 && (
                            <div className="mt-3">
                              <h4 className="text-xs font-semibold uppercase tracking-[0.12em] text-[#faf8f5]/50">
                                What changed
                              </h4>
                              <ul className="mt-2 space-y-1.5 pl-5 text-[#faf8f5]/60 list-disc">
                                {hybridInference.review.changes.map(
                                  (change) => (
                                    <li key={change}>{change}</li>
                                  ),
                                )}
                              </ul>
                            </div>
                          )}
                        </section>

                        <section className="border-t border-[rgba(255,255,255,0.08)] py-4">
                          <h3 className="mb-2 font-sans text-sm font-semibold text-[#faf8f5]">
                            First translation
                          </h3>
                          <p className="text-base text-[#faf8f5]" lang="gvn">
                            {hybridInference.draft.translation}
                          </p>
                        </section>

                        {hybridInference.review.evidence.length > 0 && (
                          <section className="border-t border-[rgba(255,255,255,0.08)] py-4">
                            <h3 className="mb-2 flex items-center gap-2 font-sans text-sm font-semibold text-[#faf8f5]">
                              <BookOpen className="h-4 w-4 text-[#ecb485]" />{' '}
                              Dictionary and language notes
                            </h3>
                            <ul className="divide-y divide-[rgba(255,255,255,0.07)]">
                              {hybridInference.review.evidence.map(
                                (evidence) => (
                                  <li
                                    key={evidence.id}
                                    className="py-2.5 first:pt-0 last:pb-0"
                                  >
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="min-w-0">
                                        <p
                                          className="font-medium text-[#faf8f5]/85"
                                          lang={
                                            evidence.kind === 'dictionary'
                                              ? 'gvn'
                                              : undefined
                                          }
                                        >
                                          {evidence.title}
                                        </p>
                                        <p className="mt-0.5 text-xs text-[#faf8f5]/55">
                                          {evidence.detail}
                                        </p>
                                      </div>
                                      <a
                                        href={evidence.sourceUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        aria-label={`Open source for ${evidence.title}`}
                                        title={evidence.sourceLabel}
                                        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-[#ecb485] hover:bg-[rgba(255,255,255,0.08)] hover:text-[#f4d2b5]"
                                      >
                                        <ExternalLink className="h-3.5 w-3.5" />
                                      </a>
                                    </div>
                                  </li>
                                ),
                              )}
                            </ul>
                          </section>
                        )}

                        {hybridInference.review.caveats.length > 0 && (
                          <section className="border-t border-[rgba(255,255,255,0.08)] py-4">
                            <h3 className="mb-2 font-sans text-sm font-semibold text-[#faf8f5]">
                              What could not be checked
                            </h3>
                            <ul className="space-y-1.5 pl-5 text-[#faf8f5]/60 list-disc">
                              {hybridInference.review.caveats.map((caveat) => (
                                <li key={caveat}>{caveat}</li>
                              ))}
                            </ul>
                          </section>
                        )}

                        <section className="border-t border-[rgba(255,255,255,0.08)] py-4 text-xs text-[#faf8f5]/55">
                          This is an AI-generated suggestion. It has not been
                          checked by a fluent Kuku Yalanji speaker.
                        </section>

                        <details className="group/technical border-t border-[rgba(255,255,255,0.08)]">
                          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 py-2 text-xs text-[#faf8f5]/55 hover:text-[#faf8f5]/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ecb485]/60 [&::-webkit-details-marker]:hidden">
                            <span>Technical details</span>
                            <ChevronDown className="h-3.5 w-3.5 transition-transform duration-200 group-open/technical:rotate-180 motion-reduce:transition-none" />
                          </summary>
                          <div className="space-y-2 pb-4 text-xs text-[#faf8f5]/50">
                            <p>
                              Translation model:{' '}
                              <a
                                href={hybridInference.draft.sourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-[#ecb485] hover:text-[#f4d2b5]"
                              >
                                MobTranslate v24.3{' '}
                                <ExternalLink className="h-3 w-3" />
                              </a>{' '}
                              on Hugging Face ·{' '}
                              {hybridInference.draft.latencyMs.toLocaleString()}{' '}
                              ms
                              {hybridInference.draft.queueMs > 0
                                ? ` · ${hybridInference.draft.queueMs.toLocaleString()} ms queued`
                                : ''}
                            </p>
                            <p>
                              Automated checker:{' '}
                              {hybridInference.review.modelId}
                              {hybridInference.review.latencyMs != null
                                ? ` · ${hybridInference.review.latencyMs.toLocaleString()} ms`
                                : ' · did not complete'}
                            </p>
                            <p>
                              Saved-result cache: translation{' '}
                              {hybridInference.cache.draft}; notes{' '}
                              {hybridInference.cache.evidence}; check{' '}
                              {hybridInference.cache.review}; final result{' '}
                              {hybridInference.cache.resolved}.
                            </p>
                            <p>
                              Your text is processed by Hugging Face and OpenAI.
                              The explanation is generated by AI, not a record
                              of private model reasoning.
                            </p>
                          </div>
                        </details>
                      </div>
                    </details>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Examples */}
          <div className="flex items-center justify-center gap-2 mt-4 flex-wrap">
            <span className="text-xs text-[#faf8f5]/40 mr-1">Try:</span>
            {(reversed ? reverseExamples : EXAMPLES).map((ex) => (
              <button
                key={ex}
                lang={sourceLanguageTag}
                onClick={() => {
                  requestSequenceRef.current += 1;
                  setInput(ex);
                  setResult(null);
                  setError(null);
                  setReviewError(null);
                  inputRef.current?.focus();
                }}
                className="px-3 py-1 text-xs rounded-full border border-[rgba(255,255,255,0.15)] text-[#faf8f5]/70 hover:text-[#faf8f5] hover:border-[rgba(255,255,255,0.3)] hover:bg-[rgba(255,255,255,0.08)] transition-all"
              >
                {ex}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
