'use client';

import {
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import {
  Search,
  X,
  MapPin,
  MapPinOff,
  Grid3x3,
  BookOpen,
  Clock,
  ChevronRight,
  SlidersHorizontal,
} from 'lucide-react';
import { TIER_LABEL } from '../atlasConfig';

// -------------------------------------------------------------- shared types

export interface DirRow {
  slug: string;
  name: string;
  family: string;
  macroarea: string;
  level: string | null;
  tier: string;
  glottocode: string | null;
  iso639_3: string | null;
  austlang: string[];
  located: boolean;
  approx: boolean;
  has_grammar: boolean;
  lexicon_state: string;
  dated: boolean;
  endangerment: string;
  color: string;
  score: number;
  /** precomputed lowercase search haystack */
  _s: string;
}

export interface FacetMeta {
  total: number;
  families: { family: string; count: number }[];
  tiers: Record<string, number>;
  macroareas: Record<string, number>;
  endangerment: Record<string, number>;
  coverage: {
    located: number;
    unlocated: number;
    grammar: number;
    lexical: number;
    dated: number;
  };
}

// ------------------------------------------------------------- label helpers

function familyLabel(f: string) {
  return f === 'unclassified' ? 'Unclassified' : f;
}

const LEX_LABEL: Record<string, string> = {
  live: 'Live dictionary',
  open_resource: 'Open resource',
  pointer_only: 'Catalogue pointer',
  none: 'No lexical data',
};
const LEX_SHORT: Record<string, string> = {
  live: 'Dictionary',
  open_resource: 'Open lexicon',
  pointer_only: 'Pointer only',
  none: 'No lexicon',
};

// AES endangerment — least → most endangered, then unknown last.
const ENDANGERMENT_ORDER: Record<string, number> = {
  'not endangered': 0,
  threatened: 1,
  shifting: 2,
  moribund: 3,
  'nearly extinct': 4,
  extinct: 5,
  unknown: 6,
};
const ENDANGERMENT_TONE: Record<string, string> = {
  'not endangered':
    'border-eucalyptus-500/40 bg-eucalyptus-500/10 text-eucalyptus-800 dark:text-eucalyptus-300',
  threatened: 'border-amber-600/40 bg-amber-500/10 text-amber-800 dark:text-amber-300',
  shifting: 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300',
  moribund: 'border-ochre-700/40 bg-ochre-600/10 text-ochre-800 dark:text-ochre-300',
  'nearly extinct': 'border-red-600/40 bg-red-500/10 text-red-700 dark:text-red-300',
  extinct: 'border-red-700/40 bg-red-600/10 text-red-700 dark:text-red-300',
  unknown: 'border-border bg-muted/50 text-muted-foreground',
};

const PAGE = 100;

const SELECT_CLS =
  'h-9 rounded-lg border border-border bg-card px-2.5 text-[13px] text-foreground ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50';

// A small on/off coverage facet chip.
function FacetChip({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-card text-muted-foreground hover:text-foreground'
      }`}
    >
      {icon}
      {label}
      <span
        className={`tabular-nums text-[11px] ${
          active ? 'text-primary-foreground/80' : 'text-muted-foreground/70'
        }`}
      >
        {count}
      </span>
    </button>
  );
}

// A compact coverage badge (icon + short text — never colour alone).
function CovBadge({
  tone,
  icon,
  children,
  title,
}: {
  tone: string;
  icon: ReactNode;
  children: ReactNode;
  title: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-none ${tone}`}
    >
      {icon}
      {children}
    </span>
  );
}

export default function DirectoryTable({
  rows,
  facets,
}: {
  rows: DirRow[];
  facets: FacetMeta;
}) {
  const [query, setQuery] = useState('');
  const [family, setFamily] = useState('all');
  const [location, setLocation] = useState<'all' | 'located' | 'unlocated'>('all');
  const [endangerment, setEndangerment] = useState('all');
  const [tier, setTier] = useState('all');
  const [macro, setMacro] = useState('all');
  const [needDict, setNeedDict] = useState(false);
  const [needGrammar, setNeedGrammar] = useState(false);
  const [needDated, setNeedDated] = useState(false);
  const [sort, setSort] = useState<'name' | 'family' | 'coverage'>('name');
  const [visible, setVisible] = useState(PAGE);

  const dq = useDeferredValue(query);

  const filterSig = `${dq}|${family}|${location}|${endangerment}|${tier}|${macro}|${needDict}|${needGrammar}|${needDated}|${sort}`;
  useEffect(() => {
    setVisible(PAGE);
  }, [filterSig]);

  const filtered = useMemo(() => {
    const q = dq.trim().toLowerCase();
    const out = rows.filter((r) => {
      if (q && !r._s.includes(q)) return false;
      if (family !== 'all' && r.family !== family) return false;
      if (location === 'located' && !r.located) return false;
      if (location === 'unlocated' && r.located) return false;
      if (endangerment !== 'all' && r.endangerment !== endangerment) return false;
      if (tier !== 'all' && r.tier !== tier) return false;
      if (macro !== 'all' && r.macroarea !== macro) return false;
      if (needDict && r.lexicon_state !== 'live' && r.lexicon_state !== 'open_resource')
        return false;
      if (needGrammar && !r.has_grammar) return false;
      if (needDated && !r.dated) return false;
      return true;
    });

    out.sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'family') {
        return (
          a.family.localeCompare(b.family) || a.name.localeCompare(b.name)
        );
      }
      // coverage: most-known first, name as tiebreak
      return b.score - a.score || a.name.localeCompare(b.name);
    });
    return out;
  }, [
    rows,
    dq,
    family,
    location,
    endangerment,
    tier,
    macro,
    needDict,
    needGrammar,
    needDated,
    sort,
  ]);

  const shown = filtered.slice(0, visible);
  const anyFilter =
    query !== '' ||
    family !== 'all' ||
    location !== 'all' ||
    endangerment !== 'all' ||
    tier !== 'all' ||
    macro !== 'all' ||
    needDict ||
    needGrammar ||
    needDated;

  function reset() {
    setQuery('');
    setFamily('all');
    setLocation('all');
    setEndangerment('all');
    setTier('all');
    setMacro('all');
    setNeedDict(false);
    setNeedGrammar(false);
    setNeedDated(false);
  }

  const endangermentOptions = Object.keys(facets.endangerment).sort(
    (a, b) => (ENDANGERMENT_ORDER[a] ?? 9) - (ENDANGERMENT_ORDER[b] ?? 9),
  );
  const tierOptions = ['comprehensive', 'documented', 'classified', 'listed'].filter(
    (t) => facets.tiers[t],
  );
  const macroOptions = Object.keys(facets.macroareas).sort();

  return (
    <div className="flex flex-col gap-4">
      {/* ---- controls ---- */}
      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        {/* search */}
        <div className="relative">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, family, Glottocode, ISO 639-3 or AUSTLANG code…"
            aria-label="Search all 980 Australian languages by name, family, or code"
            className="h-11 w-full rounded-xl border border-border bg-background pl-9 pr-9 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X size={15} />
            </button>
          )}
        </div>

        {/* select filters */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground">
            <SlidersHorizontal size={14} aria-hidden="true" />
            Filter
          </span>

          <label className="sr-only" htmlFor="dir-family">
            Family
          </label>
          <select
            id="dir-family"
            value={family}
            onChange={(e) => setFamily(e.target.value)}
            className={SELECT_CLS}
          >
            <option value="all">All families ({facets.total})</option>
            {facets.families.map((f) => (
              <option key={f.family} value={f.family}>
                {familyLabel(f.family)} ({f.count})
              </option>
            ))}
          </select>

          <label className="sr-only" htmlFor="dir-location">
            Location
          </label>
          <select
            id="dir-location"
            value={location}
            onChange={(e) =>
              setLocation(e.target.value as 'all' | 'located' | 'unlocated')
            }
            className={SELECT_CLS}
          >
            <option value="all">Any location</option>
            <option value="located">Located ({facets.coverage.located})</option>
            <option value="unlocated">
              Location unknown ({facets.coverage.unlocated})
            </option>
          </select>

          <label className="sr-only" htmlFor="dir-endangerment">
            Endangerment
          </label>
          <select
            id="dir-endangerment"
            value={endangerment}
            onChange={(e) => setEndangerment(e.target.value)}
            className={SELECT_CLS}
          >
            <option value="all">Any endangerment</option>
            {endangermentOptions.map((e) => (
              <option key={e} value={e}>
                {e[0].toUpperCase() + e.slice(1)} ({facets.endangerment[e]})
              </option>
            ))}
          </select>

          <label className="sr-only" htmlFor="dir-tier">
            Documentation tier
          </label>
          <select
            id="dir-tier"
            value={tier}
            onChange={(e) => setTier(e.target.value)}
            className={SELECT_CLS}
          >
            <option value="all">Any tier</option>
            {tierOptions.map((t) => (
              <option key={t} value={t}>
                {TIER_LABEL[t] ?? t} ({facets.tiers[t]})
              </option>
            ))}
          </select>

          {macroOptions.length > 1 && (
            <>
              <label className="sr-only" htmlFor="dir-macro">
                Region
              </label>
              <select
                id="dir-macro"
                value={macro}
                onChange={(e) => setMacro(e.target.value)}
                className={SELECT_CLS}
              >
                <option value="all">Any region</option>
                {macroOptions.map((m) => (
                  <option key={m} value={m}>
                    {m} ({facets.macroareas[m]})
                  </option>
                ))}
              </select>
            </>
          )}
        </div>

        {/* coverage facet chips + sort */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <FacetChip
            active={needDict}
            onClick={() => setNeedDict((v) => !v)}
            icon={<BookOpen size={13} aria-hidden="true" />}
            label="Has dictionary"
            count={facets.coverage.lexical}
          />
          <FacetChip
            active={needGrammar}
            onClick={() => setNeedGrammar((v) => !v)}
            icon={<Grid3x3 size={13} aria-hidden="true" />}
            label="Grammar profiled"
            count={facets.coverage.grammar}
          />
          <FacetChip
            active={needDated}
            onClick={() => setNeedDated((v) => !v)}
            icon={<Clock size={13} aria-hidden="true" />}
            label="Dated position"
            count={facets.coverage.dated}
          />

          <div className="ml-auto flex items-center gap-2">
            <label
              htmlFor="dir-sort"
              className="text-[12px] font-medium text-muted-foreground"
            >
              Sort
            </label>
            <select
              id="dir-sort"
              value={sort}
              onChange={(e) =>
                setSort(e.target.value as 'name' | 'family' | 'coverage')
              }
              className={SELECT_CLS}
            >
              <option value="name">Name (A–Z)</option>
              <option value="family">Family</option>
              <option value="coverage">Most documented</option>
            </select>
          </div>
        </div>
      </div>

      {/* ---- count + reset ---- */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-muted-foreground" aria-live="polite">
          Showing{' '}
          <span className="font-semibold text-foreground">
            {filtered.length.toLocaleString()}
          </span>{' '}
          of {facets.total.toLocaleString()} languages
          {filtered.length > shown.length && (
            <>
              {' '}
              · {shown.length.toLocaleString()} rendered
            </>
          )}
        </p>
        {anyFilter && (
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-1 text-[12.5px] font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            <X size={13} />
            Clear filters
          </button>
        )}
      </div>

      {/* ---- table ---- */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-10 text-center">
          <p className="text-sm font-medium text-foreground">No languages match.</p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Try a broader search or{' '}
            <button
              type="button"
              onClick={reset}
              className="font-medium text-primary underline underline-offset-2"
            >
              clear the filters
            </button>
            . Every one of the {facets.total.toLocaleString()} languages is here — nothing is
            hidden.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-sm">
          <table className="w-full min-w-[880px] border-collapse text-left text-[13.5px]">
            <caption className="sr-only">
              Directory of {facets.total} Australian languoids — name, family, region,
              coverage, endangerment and documentation tier. Sorted by {sort}.
            </caption>
            <thead>
              <tr className="border-b border-border bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="px-4 py-2.5 font-semibold">
                  Language
                </th>
                <th scope="col" className="px-4 py-2.5 font-semibold">
                  Family
                </th>
                <th scope="col" className="px-4 py-2.5 font-semibold">
                  Region
                </th>
                <th scope="col" className="px-4 py-2.5 font-semibold">
                  Coverage
                </th>
                <th scope="col" className="px-4 py-2.5 font-semibold">
                  Endangerment
                </th>
                <th scope="col" className="px-4 py-2.5 font-semibold">
                  Tier
                </th>
                <th scope="col" className="px-4 py-2.5">
                  <span className="sr-only">Open profile</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr
                  key={r.slug}
                  className="group border-b border-border/60 last:border-0 transition-colors hover:bg-muted/30"
                >
                  {/* Language */}
                  <th scope="row" className="px-4 py-2.5 font-normal align-top">
                    <Link
                      href={`/atlas/${r.slug}`}
                      className="group/link inline-flex items-start gap-2 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                    >
                      <span
                        className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/10"
                        style={{ backgroundColor: r.color }}
                        aria-hidden="true"
                      />
                      <span className="min-w-0">
                        <span
                          className="block font-semibold text-foreground group-hover/link:text-primary group-hover/link:underline underline-offset-2"
                          lang="mis"
                        >
                          {r.name}
                        </span>
                        {(r.glottocode || r.iso639_3 || r.austlang[0]) && (
                          <span className="mt-0.5 block font-mono text-[11px] text-muted-foreground">
                            {[r.glottocode, r.iso639_3, r.austlang[0]]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        )}
                      </span>
                    </Link>
                  </th>

                  {/* Family */}
                  <td className="px-4 py-2.5 align-top text-foreground/90">
                    {familyLabel(r.family)}
                  </td>

                  {/* Region */}
                  <td className="px-4 py-2.5 align-top text-muted-foreground">
                    {r.macroarea}
                  </td>

                  {/* Coverage badges */}
                  <td className="px-4 py-2.5 align-top">
                    <span className="flex flex-wrap gap-1">
                      {r.located ? (
                        <CovBadge
                          tone="border-eucalyptus-500/40 bg-eucalyptus-500/10 text-eucalyptus-800 dark:text-eucalyptus-300"
                          icon={<MapPin size={11} aria-hidden="true" />}
                          title={
                            r.approx
                              ? 'Location approximate (AUSTLANG or derived)'
                              : 'Located (Glottolog point)'
                          }
                        >
                          {r.approx ? 'Approx.' : 'Located'}
                        </CovBadge>
                      ) : (
                        <CovBadge
                          tone="border-amber-600/40 bg-amber-500/10 text-amber-800 dark:text-amber-300"
                          icon={<MapPinOff size={11} aria-hidden="true" />}
                          title="No reliable coordinates — never plotted, never invented"
                        >
                          No location
                        </CovBadge>
                      )}
                      {r.has_grammar && (
                        <CovBadge
                          tone="border-nightsky-500/40 bg-nightsky-500/10 text-nightsky-800 dark:text-nightsky-300"
                          icon={<Grid3x3 size={11} aria-hidden="true" />}
                          title="Grammatically profiled (Grambank / WALS)"
                        >
                          Grammar
                        </CovBadge>
                      )}
                      <CovBadge
                        tone={
                          r.lexicon_state === 'live'
                            ? 'border-eucalyptus-500/40 bg-eucalyptus-500/10 text-eucalyptus-800 dark:text-eucalyptus-300'
                            : r.lexicon_state === 'open_resource'
                              ? 'border-ochre-600/40 bg-ochre-500/10 text-ochre-800 dark:text-ochre-300'
                              : 'border-border bg-muted/40 text-muted-foreground'
                        }
                        icon={<BookOpen size={11} aria-hidden="true" />}
                        title={LEX_LABEL[r.lexicon_state] ?? r.lexicon_state}
                      >
                        {LEX_SHORT[r.lexicon_state] ?? r.lexicon_state}
                      </CovBadge>
                      {r.dated && (
                        <CovBadge
                          tone="border-nightsky-500/40 bg-nightsky-500/10 text-nightsky-800 dark:text-nightsky-300"
                          icon={<Clock size={11} aria-hidden="true" />}
                          title="Has a dated deep-time tree position (Bouckaert 2018)"
                        >
                          Dated
                        </CovBadge>
                      )}
                    </span>
                  </td>

                  {/* Endangerment */}
                  <td className="px-4 py-2.5 align-top">
                    <span
                      className={`inline-block rounded-md border px-1.5 py-0.5 text-[11px] font-medium ${
                        ENDANGERMENT_TONE[r.endangerment] ??
                        'border-border bg-muted/50 text-muted-foreground'
                      }`}
                    >
                      {r.endangerment === 'unknown'
                        ? 'Unknown'
                        : r.endangerment[0].toUpperCase() + r.endangerment.slice(1)}
                    </span>
                  </td>

                  {/* Tier */}
                  <td className="px-4 py-2.5 align-top text-muted-foreground">
                    {TIER_LABEL[r.tier] ?? r.tier}
                  </td>

                  {/* Chevron */}
                  <td className="px-2 py-2.5 align-top">
                    <Link
                      href={`/atlas/${r.slug}`}
                      aria-label={`Open the ${r.name} profile`}
                      className="inline-flex rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-primary focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 group-hover:opacity-100"
                    >
                      <ChevronRight size={16} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ---- show more ---- */}
      {filtered.length > shown.length && (
        <div className="flex flex-col items-center gap-2 py-2">
          <p className="text-[12px] text-muted-foreground">
            Showing {shown.length.toLocaleString()} of{' '}
            {filtered.length.toLocaleString()} matching languages
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setVisible((v) => v + PAGE * 2)}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              Show {Math.min(PAGE * 2, filtered.length - shown.length)} more
            </button>
            <button
              type="button"
              onClick={() => setVisible(filtered.length)}
              className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              Show all {filtered.length.toLocaleString()}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
