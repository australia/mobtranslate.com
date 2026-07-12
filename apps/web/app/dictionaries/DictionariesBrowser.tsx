'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { Badge } from '@mobtranslate/ui';
import { ArrowRight, Search, X } from 'lucide-react';
import type { DictionaryLanguage, DictionaryTierId } from '@/lib/db/queries';

// ---------------------------------------------------------------------------
// Client-side browser for the /dictionaries index.
//
// Every language is a first-class, official dictionary (operator directive,
// 2026-07-12). We do NOT rank them into "real" vs "lesser" tiers. What we DO
// keep is honest SOURCE ATTRIBUTION — a neutral provenance chip on every card
// — because the open licences require it (Wiktionary = CC-BY-SA 4.0; E.M. Curr
// 1886-87 = public domain) and because knowing where a lexicon came from is
// simply good scholarship. Attribution is not demotion.
// ---------------------------------------------------------------------------

type SourceMeta = { label: string; filterLabel: string };

const SOURCE: Record<DictionaryTierId, SourceMeta> = {
  curated: { label: 'Community', filterLabel: 'Community' },
  wiktionary: { label: 'Wiktionary', filterLabel: 'Wiktionary' },
  curr: { label: 'Curr 1886–87', filterLabel: 'Curr 1886–87' },
};

function LanguageCard({
  lang,
  maxWords,
}: {
  lang: DictionaryLanguage;
  maxWords: number;
}) {
  const src = SOURCE[lang.tierId];
  const fillPercent = maxWords > 0 ? (lang.wordCount / maxWords) * 100 : 0;
  const subtitle = lang.locality || lang.region;
  // Curr entries carry auto-generated boilerplate descriptions — skip them.
  const showDescription = lang.description && lang.tierId !== 'curr';

  return (
    <Link
      href={`/dictionaries/${lang.code}`}
      data-language={lang.code}
      className="group block no-underline rounded-xl border border-border bg-card p-6 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-[var(--lang-accent)]"
    >
      <div className="flex items-start justify-between mb-2 gap-3">
        <div className="min-w-0">
          <h3 className="text-xl font-display font-semibold transition-colors group-hover:text-[var(--lang-accent)] truncate">
            {lang.name}
          </h3>
          {subtitle && (
            <p className="text-sm text-muted-foreground mt-1 truncate">{subtitle}</p>
          )}
        </div>
        <ArrowRight className="w-5 h-5 shrink-0 text-[var(--lang-accent)] opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200 mt-1.5" />
      </div>

      {showDescription && (
        <p className="text-sm text-muted-foreground mb-4 line-clamp-2 leading-relaxed">
          {lang.description}
        </p>
      )}

      <div className="mb-4 mt-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-sm font-semibold">
            {lang.wordCount.toLocaleString()} {lang.wordCount === 1 ? 'word' : 'words'}
          </span>
        </div>
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-[var(--lang-accent)] transition-all duration-700 ease-out"
            style={{ width: `${Math.max(fillPercent, 3)}%` }}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {lang.family && <Badge variant="outline">{lang.family}</Badge>}
        <Badge variant="secondary">{src.label}</Badge>
      </div>
    </Link>
  );
}

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

  const maxWords = useMemo(
    () => Math.max(1, ...languages.map((l) => l.wordCount)),
    [languages]
  );

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

  const sourceChips: { id: DictionaryTierId | 'all'; label: string }[] = [
    { id: 'all', label: 'All sources' },
    { id: 'curated', label: 'Community' },
    { id: 'wiktionary', label: 'Wiktionary' },
    { id: 'curr', label: 'Curr 1886–87' },
  ];

  return (
    <div className="pb-16">
      {/* Controls */}
      <div className="sticky top-0 z-10 -mx-4 px-4 py-4 mb-6 bg-background/90 backdrop-blur border-b border-border">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
                <Search className="h-5 w-5" />
              </div>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name, region, family or code…"
                className="w-full h-11 pl-10 pr-10 rounded-lg border border-border bg-background text-base shadow-sm transition-all placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <select
              value={familyFilter}
              onChange={(e) => setFamilyFilter(e.target.value)}
              className="h-11 px-3 rounded-lg border border-border bg-background text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
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

          <div className="flex flex-wrap gap-2">
            {sourceChips.map((chip) => {
              const active = sourceFilter === chip.id;
              const n = sourceCounts[chip.id] ?? 0;
              return (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => setSourceFilter(chip.id)}
                  className={`px-3 h-8 rounded-full border text-sm font-medium transition-colors ${
                    active
                      ? 'bg-foreground text-background border-foreground'
                      : 'bg-background text-muted-foreground border-border hover:border-foreground/40 hover:text-foreground'
                  }`}
                >
                  {chip.label}
                  <span className="ml-1.5 opacity-60 tabular-nums">{n}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Result count */}
      <p className="text-sm text-muted-foreground mb-6">
        Showing {filtered.length.toLocaleString()} of {languages.length.toLocaleString()} dictionaries
      </p>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center text-muted-foreground">
          No dictionaries match your filters.
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((lang) => (
            <LanguageCard key={lang.code} lang={lang} maxWords={maxWords} />
          ))}
        </div>
      )}
    </div>
  );
}
