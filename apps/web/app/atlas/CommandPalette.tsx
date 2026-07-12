'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, MapPin, MapPinOff, X } from 'lucide-react';
import type { AtlasSearchItem } from './atlasConfig';

interface CommandPaletteProps {
  items: AtlasSearchItem[];
  colorOf: Record<string, string>;
  onOpen: (slug: string) => void;
  /** notify parent so the map can highlight a hovered/active result */
  onActive?: (slug: string | null) => void;
}

function familyLabel(f: string) {
  return f === 'unclassified' ? 'Unclassified' : f;
}

const LEX_LABEL: Record<string, string> = {
  live: 'live dictionary',
  open_resource: 'open resource',
  pointer_only: 'catalogue pointer',
  none: 'no lexical data',
};

/**
 * Client-side command palette over the full 980-languoid index. Matches name,
 * family, macroarea, glottocode, ISO 639-3 and AUSTLANG codes. Unlocated
 * languages ARE searchable (with an honest "location unknown" marker) so no
 * language is discoverable only via the map.
 */
export default function CommandPalette({
  items,
  colorOf,
  onOpen,
  onActive,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // "/" or Cmd/Ctrl-K focuses the search from anywhere on the page
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable;
      if ((e.key === '/' && !typing) || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [] as AtlasSearchItem[];
    const terms = q.split(/\s+/).filter(Boolean);
    const scored: { item: AtlasSearchItem; score: number }[] = [];
    for (const it of items) {
      const hayName = it.name.toLowerCase();
      const fields = [
        hayName,
        familyLabel(it.family).toLowerCase(),
        (it.macroarea || '').toLowerCase(),
        (it.glottocode || '').toLowerCase(),
        (it.iso639_3 || '').toLowerCase(),
        ...it.austlang.map((a) => a.toLowerCase()),
      ];
      const hay = fields.join(' ');
      let ok = true;
      let score = 0;
      for (const t of terms) {
        if (!hay.includes(t)) {
          ok = false;
          break;
        }
        // prioritise name-prefix and name matches
        if (hayName.startsWith(t)) score += 100;
        else if (hayName.includes(t)) score += 40;
        if ((it.glottocode || '') === t || (it.iso639_3 || '') === t) score += 80;
        if (it.austlang.some((a) => a.toLowerCase() === t)) score += 70;
        score += 5;
      }
      if (ok) {
        // located + richer languages float slightly up on ties
        if (it.located) score += 2;
        if (it.lexicon_state === 'live') score += 3;
        scored.push({ item: it, score });
      }
    }
    scored.sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name));
    return scored.slice(0, 40).map((s) => s.item);
  }, [query, items]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    onActive?.(results[active]?.slug ?? null);
    // scroll active row into view
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, results]);

  const open = focused && (results.length > 0 || query.trim().length > 0);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const it = results[active];
      if (it) onOpen(it.slug);
    } else if (e.key === 'Escape') {
      inputRef.current?.blur();
      setFocused(false);
    }
  };

  return (
    <div className="relative w-full">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          size={18}
          aria-hidden="true"
        />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls="atlas-search-results"
          aria-autocomplete="list"
          aria-activedescendant={open && results[active] ? `atlas-opt-${active}` : undefined}
          aria-label="Search all 980 Australian languages by name, family, region, or code"
          placeholder="Search 980 languages — name, family, region, Glottocode, ISO, AUSTLANG…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 120)}
          onKeyDown={onKeyDown}
          className="h-12 w-full rounded-xl border border-border bg-card pl-11 pr-24 text-base text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground/80 focus:border-primary focus:ring-2 focus:ring-primary/30"
        />
        <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-1.5">
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Clear search"
            >
              <X size={16} />
            </button>
          )}
          <kbd className="hidden select-none items-center gap-0.5 rounded-md border border-border bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground sm:flex">
            /
          </kbd>
        </div>
      </div>

      {open && (
        <ul
          ref={listRef}
          id="atlas-search-results"
          role="listbox"
          aria-label="Search results"
          className="absolute z-40 mt-2 max-h-[min(60vh,28rem)] w-full overflow-auto rounded-xl border border-border bg-popover p-1.5 shadow-xl"
        >
          {results.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">
              No language matches <span className="font-medium text-foreground">“{query}”</span>.
              <div className="mt-1 text-xs">Try a family (e.g. “Gunwinyguan”), a region, or a code.</div>
            </li>
          )}
          {results.map((it, i) => (
            <li key={it.slug} data-idx={i}>
              <button
                type="button"
                id={`atlas-opt-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onOpen(it.slug);
                }}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors ${
                  i === active ? 'bg-primary/10' : 'hover:bg-muted/60'
                }`}
              >
                <span
                  className="mt-0.5 h-3 w-3 shrink-0 rounded-full ring-1 ring-black/10"
                  style={{ backgroundColor: colorOf[it.family] ?? '#7a7268' }}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-medium text-foreground" lang="mis">
                      {it.name}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {familyLabel(it.family)}
                    </span>
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                    {it.located ? (
                      <span className="inline-flex items-center gap-1">
                        <MapPin size={11} />
                        {it.approx ? 'approx. location' : 'located'}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400">
                        <MapPinOff size={11} />
                        location unknown
                      </span>
                    )}
                    {it.glottocode && <span className="font-mono">{it.glottocode}</span>}
                    {it.iso639_3 && <span className="font-mono">{it.iso639_3}</span>}
                    {it.austlang[0] && <span className="font-mono">{it.austlang[0]}</span>}
                    <span>· {LEX_LABEL[it.lexicon_state] ?? it.lexicon_state}</span>
                  </span>
                </span>
              </button>
            </li>
          ))}
          {results.length >= 40 && (
            <li className="px-3 py-2 text-center text-[11px] text-muted-foreground">
              Showing the first 40 matches — refine your search, or browse the full{' '}
              <a href="/atlas/directory" className="text-primary underline">
                directory
              </a>
              .
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
