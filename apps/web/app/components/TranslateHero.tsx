'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Loader2,
  Search,
} from 'lucide-react';
import { track } from '@/lib/analytics';
import type { Language } from '@/lib/supabase/types';
import { getHybridLanguageIdentity } from '@/lib/hybrid-language-identities';

interface TranslateHeroProps {
  languages: Language[];
}

interface SearchRow {
  id?: string;
  type?: string;
  word?:
    | string
    | {
        id?: string;
        word?: string;
        word_class?: { name?: string; abbreviation?: string } | null;
      }
    | null;
  definition?: string | null;
  translation?: string | null;
  primary_definition?: string | null;
  word_class?: { name?: string; abbreviation?: string } | null;
}

interface DictionaryHit {
  id: string;
  word: string;
  meaning: string;
  wordClass?: string;
}

const EXAMPLES: Record<string, string[]> = {
  kuku_yalanji: ['water', 'child', 'woman', 'country'],
  anindilyakwa: ['water', 'man', 'fish'],
  migmaq: ['water', 'child', 'woman', 'country'],
};

function toDictionaryHits(rows: SearchRow[]): DictionaryHit[] {
  const hits = new Map<string, DictionaryHit>();

  for (const row of rows) {
    const nestedWord =
      row.word && typeof row.word === 'object' ? row.word : null;
    const word =
      (typeof row.word === 'string' ? row.word : nestedWord?.word)?.trim() ||
      '';
    const id = (nestedWord?.id || row.id || '').trim();
    if (!id || !word) continue;

    const meaning = (
      row.definition ||
      row.translation ||
      row.primary_definition ||
      ''
    ).trim();
    const wordClass =
      nestedWord?.word_class?.name ||
      nestedWord?.word_class?.abbreviation ||
      row.word_class?.name ||
      row.word_class?.abbreviation ||
      undefined;
    const existing = hits.get(id);
    if (existing) {
      if (!existing.meaning && meaning) existing.meaning = meaning;
      continue;
    }
    hits.set(id, { id, word, meaning, wordClass });
  }

  return [...hits.values()].slice(0, 6);
}

export default function TranslateHero({ languages }: TranslateHeroProps) {
  const [target, setTarget] = useState(
    languages.find((language) => language.code === 'kuku_yalanji')?.code ||
      languages[0]?.code ||
      'kuku_yalanji',
  );
  const [input, setInput] = useState('');
  const [hits, setHits] = useState<DictionaryHit[]>([]);
  const [searchedQuery, setSearchedQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedLanguage = languages.find(
    (language) => language.code === target,
  );
  const targetName = selectedLanguage?.name || 'this language';
  const languageTag =
    (typeof selectedLanguage?.metadata?.languageTag === 'string'
      ? selectedLanguage.metadata.languageTag
      : undefined) ||
    getHybridLanguageIdentity(target)?.languageTag ||
    target.replaceAll('_', '-');
  const examples = useMemo(
    () => EXAMPLES[target] ?? ['water', 'family', 'country'],
    [target],
  );

  useEffect(() => {
    const query = input.trim();
    if (query.length < 2) {
      setHits([]);
      setSearchedQuery('');
      setLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          q: query,
          dictionary_code: target,
          limit: '18',
        });
        const response = await fetch(`/api/v2/public/search?${params}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('Dictionary search failed');
        const data = (await response.json()) as { results?: SearchRow[] };
        setHits(toDictionaryHits(data.results ?? []));
        setSearchedQuery(query);
      } catch (searchError) {
        if (controller.signal.aborted) return;
        setError(
          searchError instanceof Error
            ? searchError.message
            : 'Dictionary search failed',
        );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 260);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [input, target]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!input.trim()) return;
    track('dictionary_lookup', {
      language: target,
      text_length: input.trim().length,
      surface: 'homepage',
    });
  }

  return (
    <div id="translate" className="mx-auto max-w-3xl scroll-mt-24">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-2 rounded-full border border-[#faf8f5]/15 bg-[#faf8f5]/[0.07] px-3 py-1.5 text-xs font-medium text-[#faf8f5]/75">
          <CheckCircle2 className="h-3.5 w-3.5 text-[#ecb485]" />
          Source-backed dictionary lookup
        </div>

        <label className="inline-flex items-center gap-2 text-sm text-[#faf8f5]/65">
          <span className="hidden sm:inline">Search</span>
          <select
            value={target}
            onChange={(event) => {
              setTarget(event.target.value);
              setHits([]);
              setSearchedQuery('');
              setError(null);
            }}
            aria-label="Dictionary language"
            className="rounded-lg border border-[#faf8f5]/15 bg-[#faf8f5]/[0.08] px-3 py-2 text-sm text-[#faf8f5] focus:outline-none focus:ring-2 focus:ring-[#ecb485]/50"
          >
            {languages.map((language) => (
              <option
                key={language.code}
                value={language.code}
                className="bg-[#33180c] text-[#faf8f5]"
              >
                {language.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[#faf8f5]/15 bg-[#faf8f5]/[0.07] shadow-[0_24px_80px_rgba(16,6,2,0.28)] backdrop-blur-sm">
        <form onSubmit={submit} className="p-4 sm:p-5">
          <label htmlFor="dictionary-lookup" className="sr-only">
            Search a {targetName} word or English meaning
          </label>
          <div className="flex min-h-16 items-center gap-3 rounded-xl border border-[#faf8f5]/15 bg-[#1f0d06]/40 px-4 transition-colors focus-within:border-[#ecb485]/60 focus-within:bg-[#1f0d06]/55">
            {loading ? (
              <Loader2 className="h-5 w-5 shrink-0 animate-spin text-[#ecb485]" />
            ) : (
              <Search className="h-5 w-5 shrink-0 text-[#ecb485]" />
            )}
            <input
              id="dictionary-lookup"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={`Search ${targetName} or an English meaning`}
              maxLength={80}
              autoComplete="off"
              className="min-w-0 flex-1 bg-transparent py-4 text-lg text-[#faf8f5] outline-none placeholder:text-[#faf8f5]/35"
            />
            <button
              type="submit"
              disabled={!input.trim()}
              className="hidden min-h-11 items-center gap-2 rounded-lg bg-[#ecb485] px-4 text-sm font-semibold text-[#33180c] transition-colors hover:bg-[#f4d2b5] disabled:cursor-not-allowed disabled:opacity-40 sm:inline-flex"
            >
              Look up
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="mr-1 text-xs text-[#faf8f5]/45">Try</span>
            {examples.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => setInput(example)}
                className="min-h-9 rounded-full border border-[#faf8f5]/10 px-3 text-xs text-[#faf8f5]/65 transition-colors hover:border-[#ecb485]/40 hover:text-[#faf8f5]"
              >
                {example}
              </button>
            ))}
          </div>
        </form>

        <div
          className="border-t border-[#faf8f5]/10 bg-[#faf8f5]/[0.025]"
          aria-live="polite"
        >
          {error ? (
            <div className="p-5 text-sm text-[#f4d2b5]" role="alert">
              The dictionary could not be reached. Please try again.
            </div>
          ) : searchedQuery && !loading && hits.length === 0 ? (
            <div className="p-6 text-center sm:p-8">
              <BookOpen className="mx-auto mb-3 h-6 w-6 text-[#ecb485]" />
              <p className="font-display text-xl text-[#faf8f5]">
                No matching entry yet
              </p>
              <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-[#faf8f5]/55">
                Try a shorter word or browse the working collection. A missing
                result is left missing rather than filled with a machine guess.
              </p>
              <Link
                href={`/dictionaries/${target}`}
                className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-[#ecb485] hover:underline"
              >
                Browse {targetName}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ) : hits.length > 0 ? (
            <div>
              <div className="flex items-center justify-between px-5 py-3 text-xs uppercase tracking-[0.14em] text-[#faf8f5]/45">
                <span>
                  {hits.length} {hits.length === 1 ? 'entry' : 'entries'}
                </span>
                <span>Open for sources</span>
              </div>
              <div className="divide-y divide-[#faf8f5]/10 border-t border-[#faf8f5]/10">
                {hits.map((hit) => (
                  <Link
                    key={hit.id}
                    href={`/dictionaries/${target}/words/${encodeURIComponent(hit.word)}`}
                    className="group flex min-h-[76px] items-center gap-4 px-5 py-4 transition-colors hover:bg-[#faf8f5]/[0.06]"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <span
                          className="font-display text-xl font-semibold text-[#faf8f5]"
                          lang={languageTag}
                        >
                          {hit.word}
                        </span>
                        {hit.wordClass ? (
                          <span className="text-xs text-[#ecb485]/75">
                            {hit.wordClass}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-0.5 truncate text-sm text-[#faf8f5]/60">
                        {hit.meaning || 'Meaning recorded on the dictionary entry'}
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 shrink-0 text-[#faf8f5]/30 transition-transform group-hover:translate-x-0.5 group-hover:text-[#ecb485]" />
                  </Link>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3 p-5 text-sm leading-relaxed text-[#faf8f5]/55">
              <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-[#ecb485]" />
              <p>
                Search in either direction: enter a word in {targetName}, or an
                English meaning. Each result opens its recorded source and
                review trail where available.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
