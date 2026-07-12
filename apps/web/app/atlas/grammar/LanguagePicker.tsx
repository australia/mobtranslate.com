'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { familyLabel } from './grammarColors';

export interface PickableLang {
  slug: string;
  name: string;
  family: string;
  n: number; // coded feature count
}

interface LanguagePickerProps {
  langs: PickableLang[];
  /** slugs already chosen elsewhere (shown but disabled) */
  exclude?: string[];
  placeholder?: string;
  label: string;
  onPick: (slug: string) => void;
}

/**
 * A small keyboard-operable combobox over the grammatically-profiled languages.
 * WAI-ARIA combobox pattern: input owns a listbox, arrow keys move, Enter picks,
 * Escape closes. Each option shows the coded-feature count so the reader can see
 * how much grammar the language actually has.
 */
export default function LanguagePicker({
  langs,
  exclude = [],
  placeholder = 'Search a language…',
  label,
  onPick,
}: LanguagePickerProps) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const excludeSet = useMemo(() => new Set(exclude), [exclude]);

  const results = useMemo(() => {
    const query = q.trim().toLowerCase();
    const arr = langs
      .filter((l) => (query ? l.name.toLowerCase().includes(query) || l.slug.includes(query) : true))
      .sort((a, b) => a.name.localeCompare(b.name));
    return arr.slice(0, 60);
  }, [langs, q]);

  useEffect(() => {
    setActive(0);
  }, [q, open]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const pick = (slug: string) => {
    if (excludeSet.has(slug)) return;
    onPick(slug);
    setQ('');
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const r = results[active];
      if (r && !excludeSet.has(r.slug)) pick(r.slug);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <label className="relative block">
        <span className="sr-only">{label}</span>
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
          <Search size={15} />
        </span>
        <input
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-label={label}
          value={q}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-8 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        />
        {q && (
          <button
            type="button"
            onClick={() => {
              setQ('');
              setOpen(true);
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
            aria-label="Clear"
          >
            <X size={14} />
          </button>
        )}
      </label>

      {open && results.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-border bg-popover p-1 shadow-xl"
        >
          {results.map((l, i) => {
            const disabled = excludeSet.has(l.slug);
            return (
              <li key={l.slug} role="option" aria-selected={i === active} aria-disabled={disabled}>
                <button
                  type="button"
                  disabled={disabled}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(l.slug)}
                  className={`flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-1.5 text-left text-[13px] ${
                    disabled
                      ? 'cursor-not-allowed text-muted-foreground/50'
                      : i === active
                        ? 'bg-primary/12 text-foreground'
                        : 'text-foreground hover:bg-muted'
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate" lang="mis">
                    {l.name}
                    {disabled && <span className="ml-1.5 text-[11px] text-muted-foreground">· chosen</span>}
                  </span>
                  <span className="shrink-0 truncate text-[11px] text-muted-foreground">
                    {familyLabel(l.family)}
                  </span>
                  <span className="shrink-0 tabular-nums text-[11px] text-muted-foreground">{l.n}f</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
