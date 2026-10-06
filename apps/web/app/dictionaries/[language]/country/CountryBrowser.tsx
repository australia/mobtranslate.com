'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { CATEGORY_LABELS, COUNTRY_CATEGORIES, COUNTRY_TYPE_LABELS, COUNTRY_TYPES } from '@/lib/country/schema';
import type { CountryCategory, CountryType } from '@/lib/country/schema';

export type CountryCard = {
  slug: string;
  title: string;
  category: CountryCategory;
  words: string[];
  scientificName?: string;
  countryTypes: CountryType[];
  blurb: string;
  thumb?: string;
};

const chip = (active: boolean) =>
  `rounded-full border px-3 py-1 text-sm transition-colors ${
    active
      ? 'border-[var(--lang-accent)] bg-[var(--lang-accent)] text-[var(--color-background)]'
      : 'border-border bg-card text-foreground hover:border-[var(--lang-accent)]'
  }`;

export function CountryBrowser({ language, cards }: { language: string; cards: CountryCard[] }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<CountryCategory | null>(null);
  const [place, setPlace] = useState<CountryType | null>(null);

  const categories = COUNTRY_CATEGORIES.filter((c) => cards.some((card) => card.category === c));
  const places = COUNTRY_TYPES.filter((t) => cards.some((card) => card.countryTypes.includes(t)));

  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('en-AU');
    return cards.filter(
      (card) =>
        (!category || card.category === category) &&
        (!place || card.countryTypes.includes(place)) &&
        (!q ||
          [card.title, card.scientificName ?? '', ...card.words].some((text) => text.toLocaleLowerCase('en-AU').includes(q))),
    );
  }, [cards, query, category, place]);

  const grouped = categories
    .map((c) => ({ category: c, items: visible.filter((card) => card.category === c) }))
    .filter((group) => group.items.length > 0);

  return (
    <div>
      <label className="relative mb-4 block">
        <span className="sr-only">Search Country entries</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search in English, Kuku Yalanji or scientific name"
          className="w-full rounded-lg border border-input bg-card py-2.5 pl-9 pr-3 text-base focus:border-[var(--lang-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--lang-accent)]/30"
        />
      </label>

      <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Filter by kind">
        <button type="button" className={chip(category === null)} onClick={() => setCategory(null)}>
          Everything
        </button>
        {categories.map((c) => (
          <button key={c} type="button" className={chip(category === c)} onClick={() => setCategory(category === c ? null : c)}>
            {CATEGORY_LABELS[c]}
          </button>
        ))}
      </div>
      <div className="mb-8 flex flex-wrap gap-2" role="group" aria-label="Filter by country">
        {places.map((t) => (
          <button key={t} type="button" className={chip(place === t)} onClick={() => setPlace(place === t ? null : t)}>
            {COUNTRY_TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      {grouped.length === 0 && <p className="text-muted-foreground">Nothing matches that yet.</p>}

      {grouped.map((group) => (
        <section key={group.category} className="mb-10">
          <h2 className="mb-3 text-xl font-semibold tracking-tight">{CATEGORY_LABELS[group.category]}</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {group.items.map((card) => (
              <li key={card.slug}>
                <Link
                  href={`/dictionaries/${language}/country/${card.slug}`}
                  className="flex h-full gap-3 rounded-lg border border-border bg-card px-4 py-3 no-underline transition-colors hover:border-[var(--lang-accent)]"
                >
                  {card.thumb && (
                    // eslint-disable-next-line @next/next/no-img-element -- static pre-sized assets
                    <img
                      src={card.thumb}
                      alt=""
                      loading="lazy"
                      className="h-20 w-20 shrink-0 rounded-md bg-muted object-cover"
                    />
                  )}
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground">{card.title}</p>
                    <p className="text-sm">
                      <span className="font-medium text-[var(--lang-accent)]">{card.words.join(' · ')}</span>
                      {card.scientificName && <em className="ml-2 text-muted-foreground">{card.scientificName}</em>}
                    </p>
                    <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">{card.blurb}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
