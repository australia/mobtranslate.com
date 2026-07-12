'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, ArrowRight, Info } from 'lucide-react';
import GrammarMap, { type GrammarPointCollection, type SlugPaint } from './GrammarMap';
import {
  buildValueColors,
  colorForDatum,
  humanizeDomain,
  familyLabel,
  GREY_UNKNOWN,
  GREY_NOT_CODED,
  NEUTRAL_FAINT,
  type StateChar,
} from './grammarColors';
import type { GrammarCatalog, GrammarFeature } from './grammarTypes';

interface FeatureExplorerProps {
  catalog: GrammarCatalog;
  points: GrammarPointCollection;
  /** fetched values map (null while the matrix is still downloading) */
  values: Record<string, Record<string, [string, StateChar]>> | null;
  loading: boolean;
}

const SOURCE_ORDER = ['Grambank', 'WALS', 'AUS extension'];

export default function FeatureExplorer({ catalog, points, values, loading }: FeatureExplorerProps) {
  const { features, domains, metric } = catalog;
  const langSet = useMemo(() => new Set(Object.keys(catalog.langs)), [catalog.langs]);
  const totalGenuine = catalog.coverage.genuine_languoids;

  // default to a well-covered, easily-grasped binary Grambank feature
  const defaultKey = useMemo(() => {
    const cand = features
      .filter((f) => f.layer === 'grambank' && f.values.length <= 3)
      .sort((a, b) => b.coded - a.coded)[0];
    return (cand ?? features[0])?.key ?? '';
  }, [features]);

  const [featureKey, setFeatureKey] = useState<string>(defaultKey);
  const [q, setQ] = useState('');
  const [source, setSource] = useState<string>('all');
  const [domain, setDomain] = useState<string>('all');
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);

  const feature: GrammarFeature | undefined = useMemo(
    () => features.find((f) => f.key === featureKey),
    [features, featureKey],
  );

  const filteredFeatures = useMemo(() => {
    const query = q.trim().toLowerCase();
    return features.filter((f) => {
      if (source !== 'all' && f.source !== source) return false;
      if (domain !== 'all' && (f.domain ?? 'other') !== domain) return false;
      if (query && !f.gloss.toLowerCase().includes(query) && !f.id.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [features, q, source, domain]);

  const coloring = useMemo(
    () => (feature ? buildValueColors(feature.values) : { colorByValue: {}, legend: [] }),
    [feature],
  );

  // per-slug paint for the map
  const featureValues = feature && values ? values[feature.key] ?? {} : null;
  const paint = useMemo<Record<string, SlugPaint>>(() => {
    const p: Record<string, SlugPaint> = {};
    if (!feature || !featureValues) return p;
    for (const f of points.features) {
      const slug = f.properties.slug;
      const d = colorForDatum(featureValues[slug], coloring.colorByValue, langSet.has(slug));
      p[slug] = { c: d.color, o: d.opacity, r: d.kind === 'value' ? 0.6 : 0 };
    }
    return p;
  }, [feature, featureValues, points, coloring.colorByValue, langSet]);

  const detailForSlug = useCallback(
    (slug: string): string => {
      if (!feature) return '';
      const d = featureValues?.[slug];
      if (d) {
        if (d[1] === 'u') return "coded '?' (unknown)";
        if (d[1] === 'x') return 'not applicable';
        return d[0];
      }
      return langSet.has(slug) ? 'feature not coded' : 'not grammatically profiled';
    },
    [feature, featureValues, langSet],
  );

  const selectedDetail = selectedSlug ? detailForSlug(selectedSlug) : null;
  const selectedName =
    selectedSlug && catalog.langs[selectedSlug]
      ? catalog.langs[selectedSlug].name
      : points.features.find((f) => f.properties.slug === selectedSlug)?.properties.name ?? selectedSlug;

  const notCoded = feature ? Math.max(0, langSet.size - feature.coded - feature.unknown - feature.na) : 0;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[20rem_1fr]">
      {/* Feature picker rail */}
      <div className="flex min-h-0 flex-col rounded-2xl border border-border bg-card shadow-sm">
        <div className="border-b border-border p-3">
          <label className="relative block">
            <span className="sr-only">Search grammatical features</span>
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              <Search size={15} />
            </span>
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search 431 features by wording…"
              className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            />
          </label>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <MiniChip active={source === 'all'} onClick={() => setSource('all')}>
              All sources
            </MiniChip>
            {SOURCE_ORDER.filter((s) => catalog.coverage.by_source[s]).map((s) => (
              <MiniChip key={s} active={source === s} onClick={() => setSource(s)}>
                {s} · {catalog.coverage.by_source[s]}
              </MiniChip>
            ))}
          </div>
          <div className="mt-2">
            <label className="sr-only" htmlFor="domain-select">
              Filter by domain
            </label>
            <select
              id="domain-select"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-[13px] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              <option value="all">All domains ({features.length})</option>
              {domains.map((d) => (
                <option key={d.id} value={d.id}>
                  {humanizeDomain(d.id)} ({d.count})
                </option>
              ))}
            </select>
          </div>
        </div>

        <ul className="max-h-[52vh] min-h-[240px] overflow-auto p-1.5" aria-label="Grammatical features">
          {filteredFeatures.length === 0 && (
            <li className="px-3 py-6 text-center text-[13px] text-muted-foreground">No features match.</li>
          )}
          {filteredFeatures.slice(0, 300).map((f) => {
            const activeF = f.key === featureKey;
            return (
              <li key={f.key}>
                <button
                  type="button"
                  onClick={() => {
                    setFeatureKey(f.key);
                    setSelectedSlug(null);
                  }}
                  aria-pressed={activeF}
                  className={`w-full rounded-lg px-2.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
                    activeF ? 'bg-primary/12 ring-1 ring-primary/30' : 'hover:bg-muted'
                  }`}
                >
                  <span className="block text-[12.5px] leading-snug text-foreground">{f.gloss}</span>
                  <span className="mt-0.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                    <span>
                      {f.source} {f.id}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums normal-case">{f.coded} coded</span>
                  </span>
                </button>
              </li>
            );
          })}
          {filteredFeatures.length > 300 && (
            <li className="px-3 py-2 text-center text-[11px] text-muted-foreground">
              Showing first 300 of {filteredFeatures.length} — refine the search.
            </li>
          )}
        </ul>
      </div>

      {/* Map + legend */}
      <div className="flex flex-col gap-3">
        {/* Selected feature header */}
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          {feature ? (
            <>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-[15px] font-semibold text-foreground">{feature.gloss}</h3>
                <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
                  {feature.source} {feature.id} · {humanizeDomain(feature.domain)}
                </span>
              </div>
              <p className="mt-1.5 text-[12.5px] leading-snug text-muted-foreground">
                Coded for <span className="font-semibold text-foreground">{feature.coded}</span> of{' '}
                {langSet.size} grammatically-profiled languages
                <span className="text-muted-foreground/80"> ({langSet.size} of {totalGenuine.toLocaleString()} total)</span>
                {feature.unknown > 0 && (
                  <>
                    {' '}· <span className="font-semibold text-foreground">{feature.unknown}</span> coded{' '}
                    &lsquo;?&rsquo; (unknown)
                  </>
                )}
                .
              </p>

              {/* Value legend — colour is NEVER the only signal: labels spelled out */}
              <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
                {coloring.legend.map((row) => (
                  <li key={row.value} className="flex items-center gap-1.5 text-[12.5px]">
                    <span
                      className="h-3 w-3 shrink-0 rounded-full ring-1 ring-black/10"
                      style={{ backgroundColor: row.color }}
                      aria-hidden="true"
                    />
                    <span className="text-foreground">{row.value}</span>
                    <span className="tabular-nums text-[11px] text-muted-foreground">{row.count}</span>
                  </li>
                ))}
                {feature.unknown > 0 && (
                  <li className="flex items-center gap-1.5 text-[12.5px]">
                    <span
                      className="h-3 w-3 shrink-0 rounded-full ring-1 ring-black/10"
                      style={{ backgroundColor: GREY_UNKNOWN }}
                      aria-hidden="true"
                    />
                    <span className="text-foreground">coded &lsquo;?&rsquo; (unknown)</span>
                    <span className="tabular-nums text-[11px] text-muted-foreground">{feature.unknown}</span>
                  </li>
                )}
                {notCoded > 0 && (
                  <li className="flex items-center gap-1.5 text-[12.5px]">
                    <span
                      className="h-3 w-3 shrink-0 rounded-full ring-1 ring-black/10"
                      style={{ backgroundColor: GREY_NOT_CODED }}
                      aria-hidden="true"
                    />
                    <span className="text-foreground">profiled, feature not coded</span>
                    <span className="tabular-nums text-[11px] text-muted-foreground">{notCoded}</span>
                  </li>
                )}
                <li className="flex items-center gap-1.5 text-[12.5px]">
                  <span
                    className="h-3 w-3 shrink-0 rounded-full ring-1 ring-black/10"
                    style={{ backgroundColor: NEUTRAL_FAINT, opacity: 0.3 }}
                    aria-hidden="true"
                  />
                  <span className="text-muted-foreground">not grammatically profiled</span>
                </li>
              </ul>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Pick a feature to colour the map.</p>
          )}
        </div>

        {/* Map */}
        <div className="relative h-[58vh] min-h-[420px] overflow-hidden rounded-2xl border border-border bg-muted/40 shadow-sm">
          <GrammarMap
            points={points}
            paint={paint}
            detailForSlug={detailForSlug}
            selectedSlug={selectedSlug}
            onSelect={setSelectedSlug}
          />
          {loading && (
            <div className="pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2 rounded-full border border-border bg-card/90 px-3 py-1 text-[11px] text-muted-foreground shadow-sm backdrop-blur-sm">
              Loading grammar data…
            </div>
          )}

          {/* clicked-language card */}
          {selectedSlug && feature && (
            <div className="absolute bottom-3 left-3 z-20 w-[min(18rem,calc(100%-1.5rem))] rounded-xl border border-border bg-card/95 p-3.5 shadow-xl backdrop-blur-sm">
              <button
                type="button"
                onClick={() => setSelectedSlug(null)}
                className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Close"
              >
                ×
              </button>
              <h4 className="pr-5 text-[15px] font-semibold leading-tight text-foreground" lang="mis">
                {selectedName}
              </h4>
              <p className="mt-1.5 text-[12.5px] text-muted-foreground">{feature.gloss}</p>
              <p className="mt-1 text-[14px] font-semibold text-foreground">{selectedDetail}</p>
              {catalog.langs[selectedSlug] && (
                <Link
                  href={`/atlas/${selectedSlug}`}
                  className="mt-2.5 inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:underline"
                >
                  Open full profile <ArrowRight size={13} />
                </Link>
              )}
            </div>
          )}
        </div>

        <p className="flex items-start gap-1.5 text-[11.5px] leading-snug text-muted-foreground">
          <Info size={13} className="mt-px shrink-0" />
          <span>
            Grambank&rsquo;s ~195 variables are a standardized cross-linguistic <em>baseline</em> for
            comparison, not the whole grammar of a language. Grey means the value is honestly unknown or
            not coded — never &ldquo;absent&rdquo;.
          </span>
        </p>
      </div>
    </div>
  );
}

function MiniChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-2.5 py-0.5 text-[11.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
        active ? 'border-primary/40 bg-primary/12 text-primary' : 'border-border bg-card text-muted-foreground hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );
}
