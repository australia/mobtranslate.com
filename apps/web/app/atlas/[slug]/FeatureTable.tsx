'use client';

import { useMemo, useState } from 'react';

export interface AtlasFeature {
  feature_id: string;
  source: string; // Grambank | WALS | AUS extension
  layer: string;
  domain: string | null;
  label: string;
  value: string;
  state: 'present' | 'absent' | 'unknown' | 'na' | 'value';
  raw: string | null;
}

// Value-state → chip style. Colour is NEVER the only signal: the resolved value
// label ('present' / 'absent' / 'SV' / 'unknown' …) is always spelled out in the
// chip, so this is WCAG "never colour alone" compliant.
const STATE_STYLE: Record<string, string> = {
  present:
    'bg-eucalyptus-500/15 text-eucalyptus-800 dark:text-eucalyptus-300 border-eucalyptus-500/30',
  absent: 'bg-muted text-muted-foreground border-border',
  unknown: 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30',
  na: 'bg-muted/60 text-muted-foreground border-border italic',
  value: 'bg-primary/10 text-primary border-primary/25',
};

const SOURCE_ORDER = ['Grambank', 'WALS', 'AUS extension'];

const humanizeDomain = (d: string | null) =>
  !d
    ? 'Other'
    : d
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase())
        .replace(/And/g, 'and')
        .replace(/Or/g, 'or');

export default function FeatureTable({ features }: { features: AtlasFeature[] }) {
  const sources = useMemo(() => {
    const set = new Set(features.map((f) => f.source));
    return SOURCE_ORDER.filter((s) => set.has(s));
  }, [features]);

  const [source, setSource] = useState<string>('all');
  const [stateFilter, setStateFilter] = useState<string>('all');
  const [q, setQ] = useState('');

  // A comprehensive language carries ~280 features across ~26 domains; opening
  // every group at once turns the profile into a 20k-px data dump. Collapse the
  // domain groups by default (counts stay visible on each summary) and auto-open
  // them only when a filter is narrowing the set — i.e. when the reader is
  // actively hunting for something.
  const filterActive = source !== 'all' || stateFilter !== 'all' || q.trim() !== '';

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return features.filter((f) => {
      if (source !== 'all' && f.source !== source) return false;
      if (stateFilter === 'coded' && f.state === 'unknown') return false;
      if (stateFilter !== 'all' && stateFilter !== 'coded' && f.state !== stateFilter) return false;
      if (
        query &&
        !f.label.toLowerCase().includes(query) &&
        !f.value.toLowerCase().includes(query) &&
        !f.feature_id.toLowerCase().includes(query)
      )
        return false;
      return true;
    });
  }, [features, source, stateFilter, q]);

  // group filtered features by source -> domain
  const grouped = useMemo(() => {
    const bySource = new Map<string, Map<string, AtlasFeature[]>>();
    for (const f of filtered) {
      const dm = bySource.get(f.source) ?? new Map<string, AtlasFeature[]>();
      const arr = dm.get(f.domain ?? '') ?? [];
      arr.push(f);
      dm.set(f.domain ?? '', arr);
      bySource.set(f.source, dm);
    }
    return SOURCE_ORDER.filter((s) => bySource.has(s)).map((s) => ({
      source: s,
      domains: Array.from(bySource.get(s)!.entries()).sort((a, b) =>
        a[0].localeCompare(b[0]),
      ),
    }));
  }, [filtered]);

  const stateChips: { key: string; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'coded', label: 'Coded only' },
    { key: 'present', label: 'Present' },
    { key: 'absent', label: 'Absent' },
    { key: 'value', label: 'Multi-value' },
    { key: 'unknown', label: 'Unknown' },
  ];

  return (
    <div>
      {/* controls */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <FilterChip active={source === 'all'} onClick={() => setSource('all')}>
            All sources
          </FilterChip>
          {sources.map((s) => (
            <FilterChip key={s} active={source === s} onClick={() => setSource(s)}>
              {s}
            </FilterChip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {stateChips.map((c) => (
            <FilterChip
              key={c.key}
              active={stateFilter === c.key}
              onClick={() => setStateFilter(c.key)}
              subtle
            >
              {c.label}
            </FilterChip>
          ))}
        </div>
        <label className="relative block">
          <span className="sr-only">Filter features by name</span>
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter features by wording…"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          />
        </label>
      </div>

      <p className="mt-3 text-[12px] text-muted-foreground" aria-live="polite">
        Showing {filtered.length} of {features.length} coded features.
      </p>

      {/* grouped tables */}
      <div className="mt-3 space-y-4">
        {grouped.length === 0 && (
          <p className="rounded-lg border border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
            No features match this filter.
          </p>
        )}
        {grouped.map(({ source: s, domains }) => (
          <div key={s} className="overflow-hidden rounded-xl border border-border">
            <div className="flex items-center justify-between bg-muted/50 px-4 py-2">
              <h3 className="text-[13px] font-semibold uppercase tracking-wide text-foreground">
                {s}
              </h3>
              <span className="text-[11px] text-muted-foreground">
                {domains.reduce((n, [, arr]) => n + arr.length, 0)} features
              </span>
            </div>
            {domains.map(([domain, rows]) => (
              <details key={domain} open={filterActive} className="border-t border-border/70">
                <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-2 text-[12px] font-medium text-muted-foreground hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40">
                  <span>{humanizeDomain(domain)}</span>
                  <span className="text-[11px] tabular-nums">{rows.length}</span>
                </summary>
                <ul className="divide-y divide-border/60">
                  {rows.map((f) => (
                    <li
                      key={`${f.layer}:${f.feature_id}`}
                      className="flex flex-col gap-1.5 px-4 py-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-[13.5px] leading-snug text-foreground">{f.label}</p>
                        <p className="mt-0.5 font-mono text-[10.5px] uppercase tracking-wide text-muted-foreground">
                          {f.source} {f.feature_id}
                        </p>
                      </div>
                      <span
                        className={`inline-flex shrink-0 items-center self-start rounded-full border px-2.5 py-0.5 text-[12px] font-medium ${
                          STATE_STYLE[f.state] ?? STATE_STYLE.value
                        }`}
                        title={`Coded value: ${f.value}${f.raw ? ` (raw ${f.raw})` : ''}`}
                      >
                        {f.value}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
  subtle,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  subtle?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3 py-1 text-[12.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
        active
          ? 'border-primary/40 bg-primary/12 text-primary'
          : subtle
            ? 'border-border bg-card text-muted-foreground hover:text-foreground'
            : 'border-border bg-card text-foreground hover:border-primary/30'
      }`}
    >
      {children}
    </button>
  );
}
