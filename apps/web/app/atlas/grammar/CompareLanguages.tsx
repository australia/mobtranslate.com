'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ArrowLeftRight, Info, X } from 'lucide-react';
import LanguagePicker, { type PickableLang } from './LanguagePicker';
import {
  humanizeDomain,
  familyLabel,
  PRESENT_COLOR,
  ABSENT_COLOR,
  GREY_UNKNOWN,
  type StateChar,
} from './grammarColors';
import { recordedAgreement, type GrammarCatalog, type GrammarNeighbour } from './grammarTypes';

interface CompareLanguagesProps {
  catalog: GrammarCatalog;
  values: Record<string, Record<string, [string, StateChar]>> | null;
  loading: boolean;
}

type RowKind = 'agree' | 'disagree' | 'one_sided';

interface CompareRow {
  key: string;
  gloss: string;
  source: string;
  domain: string | null;
  a: [string, StateChar] | null; // null = no coded value (missing / unknown / na)
  b: [string, StateChar] | null;
  aRaw?: [string, StateChar];
  bRaw?: [string, StateChar];
  kind: RowKind;
}

const codedVal = (d: [string, StateChar] | undefined): [string, StateChar] | null =>
  d && d[1] !== 'u' && d[1] !== 'x' ? d : null;

const displayDatum = (d: [string, StateChar] | undefined): string => {
  if (!d) return 'not coded';
  if (d[1] === 'u') return "‘?’ unknown";
  if (d[1] === 'x') return 'N/A';
  return d[0];
};

export default function CompareLanguages({ catalog, values, loading }: CompareLanguagesProps) {
  const pickables: PickableLang[] = useMemo(
    () =>
      Object.entries(catalog.langs)
        .map(([slug, l]) => ({ slug, name: l.name, family: l.family, n: l.n }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [catalog.langs],
  );
  const featByKey = useMemo(() => {
    const m = new Map<string, (typeof catalog.features)[number]>();
    for (const f of catalog.features) m.set(f.key, f);
    return m;
  }, [catalog.features]);

  const [a, setA] = useState<string | null>(null);
  const [b, setB] = useState<string | null>(null);
  const [domainFilter, setDomainFilter] = useState<string>('all');
  const [kindFilter, setKindFilter] = useState<'all' | RowKind>('all');

  const nameOf = (slug: string | null) => (slug ? catalog.langs[slug]?.name ?? slug : '');

  // headline recorded-agreement (Grambank only, matching the DB metric)
  const headline = useMemo(() => {
    if (!a || !b || !values) return null;
    return recordedAgreement(values, a, b);
  }, [a, b, values]);

  // per-domain Grambank sub-scores
  const domainScores = useMemo(() => {
    if (!a || !b || !values) return [];
    const acc = new Map<string, { agree: number; n: number }>();
    for (const f of catalog.features) {
      if (f.layer !== 'grambank') continue;
      const av = codedVal(values[f.key]?.[a]);
      const bv = codedVal(values[f.key]?.[b]);
      if (!av || !bv) continue;
      const dom = f.domain ?? 'other';
      const e = acc.get(dom) ?? { agree: 0, n: 0 };
      e.n++;
      if (av[0] === bv[0]) e.agree++;
      acc.set(dom, e);
    }
    return Array.from(acc.entries())
      .map(([dom, e]) => ({ domain: dom, agree: e.agree, n: e.n, pct: e.agree / e.n }))
      .sort((x, y) => y.n - x.n || x.domain.localeCompare(y.domain));
  }, [a, b, values, catalog.features]);

  // full feature-by-feature rows (all sources)
  const rows = useMemo<CompareRow[]>(() => {
    if (!a || !b || !values) return [];
    const out: CompareRow[] = [];
    for (const f of catalog.features) {
      const av = values[f.key]?.[a];
      const bv = values[f.key]?.[b];
      const ac = codedVal(av);
      const bc = codedVal(bv);
      let kind: RowKind;
      if (ac && bc) kind = ac[0] === bc[0] ? 'agree' : 'disagree';
      else if (ac || bc) kind = 'one_sided';
      else continue; // neither coded a real value — omit from the table
      out.push({ key: f.key, gloss: f.gloss, source: f.source, domain: f.domain, a: ac, b: bc, aRaw: av, bRaw: bv, kind });
    }
    return out;
  }, [a, b, values, catalog.features]);

  const domainsInRows = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) set.add(r.domain ?? 'other');
    return Array.from(set).sort((x, y) => humanizeDomain(x).localeCompare(humanizeDomain(y)));
  }, [rows]);

  const counts = useMemo(() => {
    const c = { agree: 0, disagree: 0, one_sided: 0 };
    for (const r of rows) c[r.kind]++;
    return c;
  }, [rows]);

  const filteredRows = useMemo(
    () =>
      rows.filter(
        (r) =>
          (domainFilter === 'all' || (r.domain ?? 'other') === domainFilter) &&
          (kindFilter === 'all' || r.kind === kindFilter),
      ),
    [rows, domainFilter, kindFilter],
  );

  const swap = () => {
    setA(b);
    setB(a);
  };

  // neighbour suggestions for the first picked language (a shortcut to a good pair)
  const suggestions: GrammarNeighbour[] = a ? catalog.neighbours[a] ?? [] : [];

  return (
    <div className="flex flex-col gap-4">
      {/* pickers */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_1fr]">
        <PickerCell label="First language" slug={a} name={nameOf(a)} onClear={() => setA(null)}>
          <LanguagePicker
            langs={pickables}
            exclude={b ? [b] : []}
            label="Choose the first language"
            placeholder="Search a language…"
            onPick={setA}
          />
        </PickerCell>
        <div className="flex items-center justify-center sm:pt-1">
          <button
            type="button"
            onClick={swap}
            disabled={!a && !b}
            className="rounded-full border border-border bg-card p-2 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-40"
            aria-label="Swap the two languages"
            title="Swap"
          >
            <ArrowLeftRight size={16} />
          </button>
        </div>
        <PickerCell label="Second language" slug={b} name={nameOf(b)} onClear={() => setB(null)}>
          <LanguagePicker
            langs={pickables}
            exclude={a ? [a] : []}
            label="Choose the second language"
            placeholder="Search a language…"
            onPick={setB}
          />
        </PickerCell>
      </div>

      {/* neighbour shortcut */}
      {a && !b && suggestions.length > 0 && (
        <div className="rounded-xl border border-border bg-muted/30 p-3">
          <p className="text-[12px] text-muted-foreground">
            Closest to <span className="font-medium text-foreground" lang="mis">{nameOf(a)}</span> by
            recorded Grambank agreement — pick one to compare:
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {suggestions.slice(0, 6).map((s) => (
              <button
                key={s.slug}
                type="button"
                onClick={() => setB(s.slug)}
                className="rounded-full border border-border bg-card px-2.5 py-1 text-[12px] text-foreground transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              >
                <span lang="mis">{s.name}</span>{' '}
                <span className="text-muted-foreground">
                  {Math.round(s.score * 100)}% · n={s.n_joint}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {loading && !values && (
        <p className="rounded-xl border border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
          Loading grammar data…
        </p>
      )}

      {!a || !b ? (
        !loading && (
          <p className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
            Choose two grammatically-profiled languages to compare them feature by feature.
          </p>
        )
      ) : (
        <>
          {/* headline */}
          {headline && (
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              {headline.n_joint > 0 ? (
                <>
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="font-display text-3xl font-bold text-foreground">
                      {Math.round((headline.score ?? 0) * 100)}%
                    </span>
                    <span className="text-[15px] text-foreground">
                      agree on{' '}
                      <span className="font-semibold">{headline.agree}</span> of{' '}
                      <span className="font-semibold">{headline.n_joint}</span> jointly-coded Grambank
                      features
                    </span>
                  </div>
                  <p className="mt-1.5 text-[12.5px] leading-snug text-muted-foreground">
                    This is the <span className="font-medium text-foreground">{catalog.metric.label}</span>{' '}
                    (<code className="font-mono text-[11px]">grammar_recorded_agreement</code>) — agreement
                    over the {headline.n_joint} Grambank features <em>both</em> languages code. It is{' '}
                    <span className="font-medium text-foreground">not</span> a measure of overall
                    grammatical similarity, and not genetic relatedness. Read n = {headline.n_joint}: an
                    agreement over few shared features is weaker than the same figure over many.
                  </p>
                </>
              ) : (
                <p className="text-[13px] text-muted-foreground">
                  <span className="font-medium text-foreground">{nameOf(a)}</span> and{' '}
                  <span className="font-medium text-foreground">{nameOf(b)}</span> share{' '}
                  <span className="font-semibold text-foreground">no jointly-coded Grambank features</span>,
                  so no recorded-agreement score can be computed. Any WALS / extension features they both
                  code are shown in the table below.
                </p>
              )}

              {/* per-domain sub-scores */}
              {domainScores.length > 0 && (
                <div className="mt-4">
                  <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    By grammatical domain (Grambank)
                  </h4>
                  <ul className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
                    {domainScores.map((d) => (
                      <li key={d.domain} className="flex items-center gap-2 text-[12.5px]">
                        <span className="min-w-0 flex-1 truncate text-foreground">
                          {humanizeDomain(d.domain)}
                        </span>
                        <span className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-muted">
                          <span
                            className="block h-full rounded-full bg-primary"
                            style={{ width: `${Math.round(d.pct * 100)}%` }}
                          />
                        </span>
                        <span className="w-24 shrink-0 text-right tabular-nums text-muted-foreground">
                          {d.agree}/{d.n} · {Math.round(d.pct * 100)}%
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* table controls */}
          <div className="flex flex-wrap items-center gap-2">
            <KindChip active={kindFilter === 'all'} onClick={() => setKindFilter('all')}>
              All shared ({rows.length})
            </KindChip>
            <KindChip active={kindFilter === 'agree'} onClick={() => setKindFilter('agree')}>
              Agree ({counts.agree})
            </KindChip>
            <KindChip active={kindFilter === 'disagree'} onClick={() => setKindFilter('disagree')}>
              Differ ({counts.disagree})
            </KindChip>
            <KindChip active={kindFilter === 'one_sided'} onClick={() => setKindFilter('one_sided')}>
              One-sided ({counts.one_sided})
            </KindChip>
            <select
              value={domainFilter}
              onChange={(e) => setDomainFilter(e.target.value)}
              aria-label="Filter by grammatical domain"
              className="ml-auto rounded-lg border border-border bg-background px-2.5 py-1.5 text-[13px] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              <option value="all">All domains</option>
              {domainsInRows.map((d) => (
                <option key={d} value={d}>
                  {humanizeDomain(d)}
                </option>
              ))}
            </select>
          </div>

          {/* feature-by-feature table */}
          <div className="overflow-hidden rounded-2xl border border-border">
            <div className="grid grid-cols-[1fr_7rem_7rem] items-center gap-2 border-b border-border bg-muted/50 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <span>Feature</span>
              <span className="truncate" lang="mis" title={nameOf(a)}>
                {nameOf(a)}
              </span>
              <span className="truncate" lang="mis" title={nameOf(b)}>
                {nameOf(b)}
              </span>
            </div>
            <ul className="max-h-[60vh] divide-y divide-border/60 overflow-auto">
              {filteredRows.length === 0 && (
                <li className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No shared features in this filter.
                </li>
              )}
              {filteredRows.map((r) => (
                <li
                  key={r.key}
                  className="grid grid-cols-[1fr_7rem_7rem] items-start gap-2 px-4 py-2.5 text-[13px]"
                >
                  <div className="min-w-0">
                    <p className="leading-snug text-foreground">{r.gloss}</p>
                    <p className="mt-0.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                      <span>
                        {r.source} {featByKey.get(r.key)?.id}
                      </span>
                      <KindBadge kind={r.kind} />
                    </p>
                  </div>
                  <DatumCell d={r.aRaw} />
                  <DatumCell d={r.bRaw} />
                </li>
              ))}
            </ul>
          </div>

          <p className="flex items-start gap-1.5 text-[11.5px] leading-snug text-muted-foreground">
            <Info size={13} className="mt-px shrink-0" />
            <span>
              The headline % is the recorded-agreement over <strong>Grambank</strong> features only (the
              standardized cross-linguistic baseline). WALS and extension rows are shown for context but
              do not feed that number. &lsquo;?&rsquo; and N/A are honest non-values, never counted as
              agreement or disagreement.{' '}
              {a && b && catalog.langs[a] && catalog.langs[b] && (
                <>
                  <Link href={`/atlas/${a}`} className="font-medium text-primary hover:underline">
                    {nameOf(a)}
                  </Link>{' '}
                  ·{' '}
                  <Link href={`/atlas/${b}`} className="font-medium text-primary hover:underline">
                    {nameOf(b)}
                  </Link>
                </>
              )}
            </span>
          </p>
        </>
      )}
    </div>
  );
}

function PickerCell({
  label,
  slug,
  name,
  onClear,
  children,
}: {
  label: string;
  slug: string | null;
  name: string;
  onClear: () => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      {slug ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/8 px-3 py-2">
          <span className="min-w-0 truncate text-sm font-semibold text-foreground" lang="mis">
            {name}
          </span>
          <button
            type="button"
            onClick={onClear}
            className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
            aria-label={`Clear ${label}`}
          >
            <X size={15} />
          </button>
        </div>
      ) : (
        children
      )}
    </div>
  );
}

function DatumCell({ d }: { d: [string, StateChar] | undefined }) {
  const grey = !d || d[1] === 'u' || d[1] === 'x';
  const color =
    d && d[1] !== 'u' && d[1] !== 'x'
      ? /^(present|yes)$/i.test(d[0])
        ? PRESENT_COLOR
        : /^(absent|none|no)$/i.test(d[0])
          ? ABSENT_COLOR
          : undefined
      : GREY_UNKNOWN;
  return (
    <span className="flex items-start gap-1.5">
      <span
        className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/10"
        style={{ backgroundColor: color ?? '#3f6bb0', opacity: grey ? 0.6 : 1 }}
        aria-hidden="true"
      />
      <span className={grey ? 'text-muted-foreground' : 'text-foreground'}>{displayDatum(d)}</span>
    </span>
  );
}

function KindBadge({ kind }: { kind: RowKind }) {
  const map: Record<RowKind, { label: string; cls: string }> = {
    agree: { label: 'agree', cls: 'bg-eucalyptus-500/15 text-eucalyptus-800 dark:text-eucalyptus-300' },
    disagree: { label: 'differ', cls: 'bg-amber-500/15 text-amber-800 dark:text-amber-300' },
    one_sided: { label: 'one-sided', cls: 'bg-muted text-muted-foreground' },
  };
  const m = map[kind];
  return <span className={`rounded-full px-1.5 py-px text-[9.5px] font-semibold normal-case ${m.cls}`}>{m.label}</span>;
}

function KindChip({
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
      className={`rounded-full border px-3 py-1 text-[12.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
        active ? 'border-primary/40 bg-primary/12 text-primary' : 'border-border bg-card text-foreground hover:border-primary/30'
      }`}
    >
      {children}
    </button>
  );
}
