'use client';

import { useEffect, useState } from 'react';

// Chooses which location's segments a Country page shows. The page renders
// every segment (so it reads fine without JavaScript and search engines see
// it all); this sets data-at on the page root, and the page's CSS hides the
// other locations. The choice is remembered across pages and can be linked
// with ?at=<location>.
const STORAGE_KEY = 'country:location';
const ALL = 'all';

export type PickerLocation = { id: string; name: string; region: string };

const chip = (active: boolean) =>
  `rounded-full border px-3 py-1 text-sm transition-colors ${
    active
      ? 'border-[var(--lang-accent)] bg-[var(--lang-accent)] text-[var(--color-background)]'
      : 'border-border bg-card text-foreground hover:border-[var(--lang-accent)]'
  }`;

function readStored(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function store(value: string) {
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Private windows and blocked storage: the choice just isn't remembered.
  }
}

export function LocationPicker({ rootId, locations }: { rootId: string; locations: PickerLocation[] }) {
  const [at, setAt] = useState<string>(ALL);

  useEffect(() => {
    const ids = new Set(locations.map((location) => location.id));
    const fromUrl = new URLSearchParams(window.location.search).get('at');
    const initial = [fromUrl, readStored()].find((value) => value && (value === ALL || ids.has(value)));
    if (initial) setAt(initial);
  }, [locations]);

  useEffect(() => {
    const root = document.getElementById(rootId);
    if (!root) return;
    if (at === ALL) root.removeAttribute('data-at');
    else root.setAttribute('data-at', at);
  }, [at, rootId]);

  const choose = (value: string) => {
    setAt(value);
    store(value);
    const url = new URL(window.location.href);
    if (value === ALL) url.searchParams.delete('at');
    else url.searchParams.set('at', value);
    window.history.replaceState(null, '', url);
  };

  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Show country for">
      <span className="mr-1 text-sm font-medium text-muted-foreground">Show country for</span>
      <button type="button" className={chip(at === ALL)} aria-pressed={at === ALL} onClick={() => choose(ALL)}>
        Every place
      </button>
      {locations.map((location) => (
        <button
          key={location.id}
          type="button"
          className={chip(at === location.id)}
          aria-pressed={at === location.id}
          onClick={() => choose(location.id)}
        >
          {location.name}
          <span className={at === location.id ? 'opacity-80' : 'text-muted-foreground'}> · {location.region}</span>
        </button>
      ))}
    </div>
  );
}
