'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Search, X } from 'lucide-react';
import type { DictionaryLanguage, DictionaryTierId } from '@/lib/db/queries';

// ---------------------------------------------------------------------------
// Client-side browser for the /dictionaries index.
//
// Every language is a first-class, official dictionary (operator directive,
// 2026-07-12). We do NOT rank them into "real" vs "lesser" tiers. What we DO
// keep is honest SOURCE ATTRIBUTION — a neutral provenance chip on every entry
// — because the open licences require it (Wiktionary = CC-BY-SA 4.0; E.M. Curr
// 1886-87 = public domain) and because knowing where a lexicon came from is
// simply good scholarship. Attribution is not demotion.
//
// Two presentations, chosen by the shape of the data (not by rank):
//   • Community + Wiktionary dictionaries carry a description, a region and a
//     family — they get a full card.
//   • The 187 Curr vocabularies are single-locality comparative wordlists with
//     no description; forcing them into the same tall card leaves a broken-
//     looking void. They read as what they are: a dense, scannable INDEX of
//     Edward Curr's 1886-87 survey, one dignified row per locality.
// ---------------------------------------------------------------------------

const SOURCE: Record<DictionaryTierId, string> = {
  curated: 'Community',
  wiktionary: 'Wiktionary',
  curr: 'Curr 1886–87',
};

/** Neutral, quiet provenance chip. Source is attribution, never a downgrade.
 *  Softly filled so it reads as provenance, distinct from the outline family tag. */
function SourceChip({ tierId }: { tierId: DictionaryTierId }) {
  return (
    <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
      {SOURCE[tierId]}
    </span>
  );
}

/** Strip the trailing "(Curr #NN)" catalogue tag; surface the number separately. */
function splitCurrName(name: string): { place: string; number: string | null } {
  const m = name.match(/\(Curr #(\d+)\)\s*$/i);
  const number = m ? m[1] : null;
  let place = name.replace(/\s*\(Curr #\d+\)\s*$/i, '').trim();
  // A handful of localities were never named in the source — don't echo boilerplate.
  if (/^Curr Vocabulary\b/i.test(place)) place = 'Unnamed locality';
  return { place, number };
}

// -- Rich card (Community + Wiktionary) -------------------------------------

function LanguageCard({ lang }: { lang: DictionaryLanguage }) {
  const subtitle = lang.locality || lang.region;

  return (
    <Link
      href={`/dictionaries/${lang.code}`}
      data-language={lang.code}
      className="group relative flex flex-col rounded-xl border border-border bg-card p-5 no-underline transition-[border-color,box-shadow] duration-200 hover:border-[var(--lang-accent)] hover:shadow-[0_1px_3px_rgba(0,0,0,0.04),0_8px_24px_-12px_var(--lang-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none"
    >
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-display text-xl font-semibold leading-tight transition-colors group-hover:text-[var(--lang-accent)]">
            {lang.name}
          </h3>
          {subtitle && (
            <p className="mt-1 truncate text-sm text-muted-foreground">{subtitle}</p>
          )}
        </div>
        <ArrowUpRight
          className="mt-0.5 h-5 w-5 shrink-0 text-[var(--lang-accent)] opacity-0 transition-all duration-200 group-hover:opacity-100 motion-reduce:transition-none"
          aria-hidden
        />
      </div>

      {lang.description && (
        <p className="mb-4 line-clamp-2 flex-1 text-sm leading-relaxed text-muted-foreground">
          {lang.description}
        </p>
      )}

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-border/60 pt-3.5">
        <span className="text-sm text-muted-foreground">
          <span className="font-semibold tabular-nums text-[var(--lang-accent)]">
            {lang.wordCount.toLocaleString()}
          </span>{' '}
          {lang.wordCount === 1 ? 'word' : 'words'}
        </span>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {lang.family && (
            <span className="inline-flex items-center rounded-md border border-border px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {lang.family}
            </span>
          )}
          <SourceChip tierId={lang.tierId} />
        </div>
      </div>
    </Link>
  );
}

// -- Dense index row (Curr) --------------------------------------------------

function CurrRow({ lang }: { lang: DictionaryLanguage }) {
  const { place, number } = splitCurrName(lang.name);

  return (
    <Link
      href={`/dictionaries/${lang.code}`}
      data-language={lang.code}
      className="group flex min-h-11 items-center gap-3 rounded-lg border border-border bg-card px-3.5 py-2 no-underline transition-[border-color,background-color] duration-150 hover:border-[var(--lang-accent)] hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none"
    >
      {number && (
        <span className="w-11 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
          #{number}
        </span>
      )}
      <span className="min-w-0 flex-1 truncate text-[0.9375rem] font-medium transition-colors group-hover:text-[var(--lang-accent)]">
        {place}
        {lang.region && (
          <span className="ml-2 text-xs font-normal text-muted-foreground">{lang.region}</span>
        )}
      </span>
      <span
        className="shrink-0 text-sm tabular-nums text-muted-foreground"
        aria-label={`${lang.wordCount} entries`}
      >
        {lang.wordCount.toLocaleString()}
      </span>
    </Link>
  );
}

// -- Section header ----------------------------------------------------------

function SectionHeader({
  title,
  hint,
  count,
}: {
  title: string;
  hint?: string;
  count: number;
}) {
  return (
    <div className="mb-4 flex items-baseline justify-between gap-4">
      <div className="min-w-0">
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        {hint && <p className="mt-0.5 text-sm leading-snug text-muted-foreground">{hint}</p>}
      </div>
      <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
        {count.toLocaleString()}
      </span>
    </div>
  );
}

// -- Browser -----------------------------------------------------------------

export default function DictionariesBrowser({
  languages,
}: {
  languages: DictionaryLanguage[];
}) {
  const [query, setQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<DictionaryTierId | 'all'>('all');
  const [familyFilter, setFamilyFilter] = useState<string>('all');

  const families = useMemo(() => {
    const set = new Set<string>();
    for (const l of languages) if (l.family) set.add(l.family);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [languages]);

  // Richest dictionaries first, then alphabetical — showcase the real content.
  const sorted = useMemo(
    () =>
      [...languages].sort(
        (a, b) => b.wordCount - a.wordCount || a.name.localeCompare(b.name)
      ),
    [languages]
  );

  const sourceCounts = useMemo(() => {
    const c: Record<string, number> = { all: languages.length };
    for (const l of languages) c[l.tierId] = (c[l.tierId] || 0) + 1;
    return c;
  }, [languages]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sorted.filter((l) => {
      if (sourceFilter !== 'all' && l.tierId !== sourceFilter) return false;
      if (familyFilter !== 'all') {
        if (familyFilter === '__none__') {
          if (l.family) return false;
        } else if (l.family !== familyFilter) {
          return false;
        }
      }
      if (q) {
        const hay = `${l.name} ${l.code} ${l.region ?? ''} ${l.family ?? ''} ${l.locality ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [sorted, query, sourceFilter, familyFilter]);

  const rich = useMemo(() => filtered.filter((l) => l.tierId !== 'curr'), [filtered]);
  const curr = useMemo(() => filtered.filter((l) => l.tierId === 'curr'), [filtered]);

  const richTitle = useMemo(() => {
    const hasCommunity = rich.some((l) => l.tierId === 'curated');
    const hasWiktionary = rich.some((l) => l.tierId === 'wiktionary');
    if (hasCommunity && hasWiktionary) return 'Community & Wiktionary dictionaries';
    if (hasWiktionary) return 'Wiktionary vocabularies';
    return 'Community dictionaries';
  }, [rich]);

  const hasFilters = query.trim() !== '' || sourceFilter !== 'all' || familyFilter !== 'all';

  const clearAll = () => {
    setQuery('');
    setSourceFilter('all');
    setFamilyFilter('all');
  };

  const sourceChips: { id: DictionaryTierId | 'all'; label: string }[] = [
    { id: 'all', label: 'All sources' },
    { id: 'curated', label: 'Community' },
    { id: 'wiktionary', label: 'Wiktionary' },
    { id: 'curr', label: 'Curr 1886–87' },
  ];

  return (
    <div className="pb-16">
      {/* Controls */}
      <div className="sticky top-0 z-10 -mx-4 mb-8 border-b border-border bg-background/85 px-4 py-4 backdrop-blur-md">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-[1.15rem] w-[1.15rem] -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search 220 dictionaries by name, region, family or code…"
              aria-label="Search dictionaries"
              className="h-11 w-full rounded-lg border border-border bg-card pl-10 pr-10 text-base shadow-sm transition-[border-color,box-shadow] placeholder:text-muted-foreground focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-2.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <select
            value={familyFilter}
            onChange={(e) => setFamilyFilter(e.target.value)}
            className="h-11 rounded-lg border border-border bg-card px-3 text-sm shadow-sm transition-colors focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-ring sm:w-52"
            aria-label="Filter by language family"
          >
            <option value="all">All families</option>
            {families.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
            <option value="__none__">Unclassified</option>
          </select>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {sourceChips.map((chip) => {
            const active = sourceFilter === chip.id;
            const n = sourceCounts[chip.id] ?? 0;
            return (
              <button
                key={chip.id}
                type="button"
                onClick={() => setSourceFilter(chip.id)}
                aria-pressed={active}
                className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  active
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-border bg-card text-muted-foreground hover:border-foreground/40 hover:text-foreground'
                }`}
              >
                {chip.label}
                <span className={`tabular-nums ${active ? 'opacity-70' : 'opacity-60'}`}>{n}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Result count */}
      <div className="mb-6 flex items-center gap-3">
        <p className="text-sm text-muted-foreground">
          {filtered.length === languages.length ? (
            <>
              <span className="font-medium text-foreground tabular-nums">
                {languages.length.toLocaleString()}
              </span>{' '}
              official dictionaries
            </>
          ) : (
            <>
              <span className="font-medium text-foreground tabular-nums">
                {filtered.length.toLocaleString()}
              </span>{' '}
              of {languages.length.toLocaleString()} dictionaries
            </>
          )}
        </p>
        {hasFilters && (
          <button
            type="button"
            onClick={clearAll}
            className="text-sm font-medium text-[var(--color-primary)] underline-offset-4 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:rounded"
          >
            Clear filters
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/40 px-6 py-16 text-center">
          <p className="text-base font-medium">No dictionaries match your search.</p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
            {query.trim() ? (
              <>
                Nothing found for “{query.trim()}”. Try a place name (like{' '}
                <em>Cooktown</em>), a language family, or a broader term.
              </>
            ) : (
              <>Try widening the source or family filter.</>
            )}
          </p>
          <button
            type="button"
            onClick={clearAll}
            className="mt-5 inline-flex h-9 items-center rounded-lg border border-border bg-card px-4 text-sm font-medium transition-colors hover:border-foreground/40 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Reset filters
          </button>
        </div>
      ) : (
        <div className="space-y-12">
          {rich.length > 0 && (
            <section>
              <SectionHeader
                title={richTitle}
                hint="Living community lexicons and openly-licensed vocabularies, each with region and family."
                count={rich.length}
              />
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {rich.map((lang) => (
                  <LanguageCard key={lang.code} lang={lang} />
                ))}
              </div>
            </section>
          )}

          {curr.length > 0 && (
            <section>
              <SectionHeader
                title="Historical vocabularies"
                hint="Comparative wordlists from Edward M. Curr’s The Australian Race (1886–87), one per locality — with entry counts."
                count={curr.length}
              />
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {curr.map((lang) => (
                  <CurrRow key={lang.code} lang={lang} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
