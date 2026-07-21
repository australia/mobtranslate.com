'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Cpu,
  Database,
  Download,
  FileCheck2,
  FileText,
  FlaskConical,
  Languages,
  LibraryBig,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { Button, cn } from '@mobtranslate/ui';
import type {
  CountOption,
  DatasetData,
  DictionaryData,
  DictionaryEntry,
  LexemeData,
  LexemeRow,
  ModelData,
  OverviewData,
  Pagination,
  ResearchEnvelope,
  ResearchResource,
  SentenceData,
  SentenceRow,
} from '@/lib/kuku-yalanji-research-types';

type WorkbenchTab = ResearchResource;

const TABS: Array<{
  id: WorkbenchTab;
  label: string;
  shortLabel: string;
  icon: typeof BookOpen;
}> = [
  { id: 'overview', label: 'Corpus health', shortLabel: 'Health', icon: ShieldCheck },
  { id: 'dictionary', label: 'Dictionary', shortLabel: 'Dictionary', icon: BookOpen },
  { id: 'dataset', label: 'Downloads', shortLabel: 'Downloads', icon: Download },
  { id: 'sentences', label: 'Sentences', shortLabel: 'Sentences', icon: Languages },
  { id: 'lexemes', label: 'Lexeme ledger', shortLabel: 'Lexemes', icon: LibraryBig },
  { id: 'model', label: 'Model v2', shortLabel: 'Model v2', icon: Cpu },
];

const fetcher = async <T,>(url: string): Promise<ResearchEnvelope<T>> => {
  const response = await fetch(url);
  const body = await response.json() as ResearchEnvelope<T> | { success: false; error?: string };
  if (!response.ok || !body.success) {
    throw new Error('error' in body && body.error ? body.error : 'Research data could not be loaded.');
  }
  return body;
};

const nf = new Intl.NumberFormat('en-AU');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatNumber(value: number): string {
  return nf.format(value);
}

function formatBytes(value: number): string {
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(2)} GB`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  return `${formatNumber(value)} B`;
}

function formatDate(value: string | null): string {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not recorded';
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}, ${hours}:${minutes} UTC`;
}

function labelize(value: string): string {
  return value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function buildResearchUrl(resource: ResearchResource, params?: Record<string, string | number | undefined>): string {
  const query = new URLSearchParams({ resource });
  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== '') query.set(key, String(value));
  });
  return `/api/research/kuku-yalanji?${query.toString()}`;
}

function StatusPill({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
}) {
  const styles = {
    neutral: 'bg-muted text-foreground/80',
    success: 'bg-emerald-600/15 text-foreground',
    warning: 'bg-amber-500/20 text-foreground',
    danger: 'bg-red-600/15 text-foreground',
    info: 'bg-sky-600/15 text-foreground',
  };
  return (
    <span className={cn('inline-flex min-h-7 items-center rounded-full px-2.5 py-1 text-xs font-medium', styles[tone])}>
      {children}
    </span>
  );
}

function SearchField({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  onChange: (_value: string) => void;
  placeholder: string;
  label: string;
}) {
  return (
    <label className="block">
      <span className="sr-only">{label}</span>
      <span className="relative block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input
          type="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="h-11 w-full rounded-lg border border-input bg-background pl-10 pr-10 text-sm text-foreground placeholder:text-foreground/60 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-ring"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </span>
    </label>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  allLabel,
}: {
  label: string;
  value: string;
  onChange: (_value: string) => void;
  options: CountOption[];
  allLabel: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-foreground">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus:border-transparent focus:outline-none focus:ring-2 focus:ring-ring"
      >
        <option value="">{allLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label} ({formatNumber(option.count)})
          </option>
        ))}
      </select>
    </label>
  );
}

function LoadingRows({ count = 5 }: { count?: number }) {
  return (
    <div aria-label="Loading results" aria-busy="true" className="divide-y divide-border rounded-lg border border-border bg-card">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="p-5">
          <div className="h-5 w-2/5 animate-pulse rounded bg-muted" />
          <div className="mt-3 h-4 w-4/5 animate-pulse rounded bg-muted" />
          <div className="mt-2 h-4 w-3/5 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex min-h-48 items-center gap-4 rounded-lg border border-red-600/30 bg-red-600/5 p-6" role="alert">
      <AlertTriangle className="h-6 w-6 shrink-0 text-foreground/70" />
      <div>
        <h2 className="text-base font-semibold">Research archive unavailable</h2>
        <p className="mt-1 text-sm text-foreground/75">{message}</p>
      </div>
    </div>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="grid min-h-56 place-items-center rounded-lg border border-dashed border-border p-8 text-center">
      <div className="max-w-md">
        <CircleHelp className="mx-auto h-7 w-7 text-[var(--lang-accent)]" />
        <h2 className="mt-4 text-base font-semibold">{title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-foreground/70">{detail}</p>
      </div>
    </div>
  );
}

function PaginationControls({ data, onPage }: { data: Pagination; onPage: (_page: number) => void }) {
  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-foreground/70">
        Page <strong className="text-foreground">{formatNumber(data.page)}</strong> of {formatNumber(data.totalPages)}
        <span className="hidden sm:inline"> · {formatNumber(data.total)} results</span>
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          onClick={() => onPage(data.page - 1)}
          disabled={!data.hasPrev}
          className="h-10 gap-2"
        >
          <ChevronLeft className="h-4 w-4" /> Previous
        </Button>
        <Button
          variant="secondary"
          onClick={() => onPage(data.page + 1)}
          disabled={!data.hasNext}
          className="h-10 gap-2"
        >
          Next <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function FilterPanel({ children, active }: { children: React.ReactNode; active: boolean }) {
  return (
    <aside className="self-start rounded-lg border border-border bg-card p-4 lg:sticky lg:top-24" aria-label="Filters">
      <div className="mb-4 flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 text-sm font-semibold">
          <SlidersHorizontal className="h-4 w-4 text-[var(--lang-accent)]" /> Filters
        </span>
        {active && <StatusPill tone="info">Active</StatusPill>}
      </div>
      <div className="space-y-4">{children}</div>
    </aside>
  );
}

function Distribution({ title, rows, total }: { title: string; rows: Array<{ label: string; count: number }>; total: number }) {
  const maximum = Math.max(1, ...rows.map((row) => row.count));
  return (
    <section className="border-t border-border pt-5">
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="text-xs text-foreground/60">{formatNumber(total)} total</span>
      </div>
      <div className="space-y-2.5">
        {rows.map((row) => (
          <div key={row.label} className="grid grid-cols-[minmax(7rem,0.7fr)_minmax(6rem,1fr)_4rem] items-center gap-3 text-xs">
            <span className="truncate text-foreground/75" title={labelize(row.label)}>{labelize(row.label)}</span>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-[var(--lang-accent)]"
                style={{ width: `${Math.max(2, (row.count / maximum) * 100)}%` }}
              />
            </div>
            <span className="text-right tabular-nums text-foreground/65">{formatNumber(row.count)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function OverviewView({ initial }: { initial: OverviewData }) {
  const url = buildResearchUrl('overview');
  const { data, error } = useSWR<ResearchEnvelope<OverviewData>>(url, fetcher<OverviewData>, {
    fallbackData: { success: true, resource: 'overview', generatedAt: initial.generatedAt, data: initial },
    revalidateOnFocus: false,
  });
  if (error) return <ErrorState message={error.message} />;
  const overview = data?.data ?? initial;
  const { counts } = overview;

  return (
    <div className="space-y-8">
      <section aria-labelledby="milestone-heading">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="milestone-heading" className="text-xl font-semibold">Milestone evidence</h2>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-foreground/70">
              Every count comes from the mounted corpus database or canonical dictionary source. Synthetic rows remain pending elder verification.
            </p>
          </div>
          <span className="text-xs text-foreground/60">Latest corpus write {formatDate(overview.latestSentenceAt)}</span>
        </div>

        <dl className="mt-5 grid overflow-hidden rounded-lg border border-border bg-card sm:grid-cols-2 xl:grid-cols-4">
          {[
            ['Sentences', counts.sentences],
            ['Kuku words', counts.kukuWords],
            ['Five-lens reviews', counts.reviews],
            ['Batches', counts.batches],
            ['Reference entries', counts.dictionaryEntries],
            ['Unique headwords', counts.uniqueHeadwords],
            ['Verified lexemes', counts.lexemes],
            ['Process events', counts.processEvents],
          ].map(([label, value], index) => (
            <div key={String(label)} className={cn('px-4 py-3', index > 0 && 'border-t border-border sm:border-l', index >= 2 && 'sm:border-t', index >= 4 && 'xl:border-t')}>
              <dt className="text-xs text-foreground/60">{label}</dt>
              <dd className="mt-1 text-base font-semibold tabular-nums">{formatNumber(Number(value))}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="checks-heading">
        <h2 id="checks-heading" className="text-xl font-semibold">Closure checks</h2>
        <div className="mt-4 divide-y divide-border rounded-lg border border-border bg-card">
          {overview.checks.map((check) => (
            <div key={check.label} className="flex gap-3 px-4 py-3.5">
              {check.status === 'pass' ? (
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--lang-accent)]" />
              ) : (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-foreground/70" />
              )}
              <div className="min-w-0 sm:flex sm:flex-1 sm:items-baseline sm:justify-between sm:gap-5">
                <h3 className="text-sm font-medium">{check.label}</h3>
                <p className="mt-1 text-sm leading-relaxed text-foreground/65 sm:mt-0 sm:text-right">{check.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-x-10 gap-y-8 lg:grid-cols-2">
        <Distribution title="Sentence disposition" rows={overview.distributions.sentenceStatus} total={counts.sentences} />
        <Distribution title="Difficulty tiers" rows={overview.distributions.tiers} total={counts.sentences} />
        <Distribution title="Most-used frames" rows={overview.distributions.frames} total={counts.sentences} />
        <Distribution title="Lexeme status" rows={overview.distributions.lexemeStatus} total={counts.lexemes} />
        <Distribution title="Lexeme parts of speech" rows={overview.distributions.partsOfSpeech} total={counts.lexemes} />
      </div>
    </div>
  );
}

function DictionaryRow({ entry }: { entry: DictionaryEntry }) {
  return (
    <article className="px-4 py-5 sm:px-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h3 lang="gvn" className="headword text-2xl font-semibold text-[var(--lang-accent)]">{entry.word}</h3>
            {entry.phonemic && <span className="font-mono text-sm text-foreground/60">{entry.phonemic}</span>}
          </div>
          <p className="mt-1 text-base text-foreground/85">
            {entry.gloss ?? entry.definitions[0] ?? entry.translations[0] ?? 'No gloss recorded'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          {entry.type && <StatusPill>{labelize(entry.type)}</StatusPill>}
          {entry.source === 'grammar' && <StatusPill tone="info">Grammar source</StatusPill>}
          {entry.needsReview && <StatusPill tone="warning">Needs review</StatusPill>}
        </div>
      </div>

      {(entry.definitions.length > 1 || entry.translations.length > 1 || entry.examples.length > 0 || entry.commentary.length > 0) && (
        <details className="group mt-4">
          <summary className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg px-2 text-sm font-medium text-[var(--lang-accent)] hover:bg-[var(--lang-accent-soft)]">
            <FileText className="h-4 w-4" /> Full entry
          </summary>
          <div className="mt-3 space-y-4 border-t border-border pt-4 text-sm">
            {entry.definitions.length > 0 && (
              <div>
                <h4 className="font-medium">Definitions</h4>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-foreground/75">
                  {entry.definitions.map((definition) => <li key={definition}>{definition}</li>)}
                </ul>
              </div>
            )}
            {entry.examples.length > 0 && (
              <div>
                <h4 className="font-medium">Examples</h4>
                <div className="mt-2 space-y-3">
                  {entry.examples.map((example, index) => (
                    <blockquote key={`${example.kukuYalanji}-${index}`} className="border-t border-border pt-2 first:border-0 first:pt-0">
                      <p lang="gvn" className="font-medium text-foreground">{example.kukuYalanji}</p>
                      <p className="mt-0.5 text-foreground/65">{example.english}</p>
                    </blockquote>
                  ))}
                </div>
              </div>
            )}
            {entry.commentary.length > 0 && (
              <div>
                <h4 className="font-medium">Editorial notes</h4>
                <ul className="mt-1 space-y-1 text-foreground/70">
                  {entry.commentary.map((note) => <li key={note}>{note}</li>)}
                </ul>
              </div>
            )}
            <dl className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-foreground/60">
              <div><dt className="inline font-medium">Source: </dt><dd className="inline">{entry.source}</dd></div>
              {entry.semanticDomain && <div><dt className="inline font-medium">Domain: </dt><dd className="inline">{labelize(entry.semanticDomain)}</dd></div>}
              {entry.verbClass && <div><dt className="inline font-medium">Verb class: </dt><dd className="inline">{entry.verbClass}</dd></div>}
            </dl>
          </div>
        </details>
      )}
    </article>
  );
}

function DictionaryView() {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [type, setType] = useState('');
  const [source, setSource] = useState('');
  const [domain, setDomain] = useState('');
  const [review, setReview] = useState(false);
  const [page, setPage] = useState(1);
  const url = buildResearchUrl('dictionary', { q: deferredQuery, type, source, domain, review: review ? 'yes' : '', page, limit: 24 });
  const { data, error, isLoading } = useSWR<ResearchEnvelope<DictionaryData>>(url, fetcher<DictionaryData>, { keepPreviousData: true });
  const dictionary = data?.data;
  const active = Boolean(query || type || source || domain || review);
  const resetPage = <T,>(setter: (_value: T) => void) => (value: T) => { setter(value); setPage(1); };

  return (
    <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <FilterPanel active={active}>
        <SearchField value={query} onChange={resetPage(setQuery)} placeholder="Headword or English gloss" label="Search dictionary" />
        <FilterSelect label="Entry type" value={type} onChange={resetPage(setType)} options={dictionary?.filters.types ?? []} allLabel="All types" />
        <FilterSelect label="Source" value={source} onChange={resetPage(setSource)} options={dictionary?.filters.sources ?? []} allLabel="All sources" />
        <FilterSelect label="Semantic domain" value={domain} onChange={resetPage(setDomain)} options={dictionary?.filters.domains ?? []} allLabel="All domains" />
        <label className="flex min-h-11 items-center gap-3 rounded-lg border border-border px-3 text-sm">
          <input type="checkbox" checked={review} onChange={(event) => { setReview(event.target.checked); setPage(1); }} className="h-4 w-4 accent-[var(--lang-accent)]" />
          Needs editorial review
        </label>
        {active && (
          <Button variant="ghost" onClick={() => { setQuery(''); setType(''); setSource(''); setDomain(''); setReview(false); setPage(1); }} className="w-full gap-2">
            <X className="h-4 w-4" /> Clear filters
          </Button>
        )}
      </FilterPanel>

      <section aria-labelledby="dictionary-results-heading">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h2 id="dictionary-results-heading" className="text-xl font-semibold">Reference dictionary</h2>
            <p className="mt-1 text-sm text-foreground/65">Canonical YAML entries, including homophones, grammar additions, examples, and editorial flags.</p>
          </div>
          {dictionary && <span className="shrink-0 text-sm tabular-nums text-foreground/65">{formatNumber(dictionary.pagination.total)} entries</span>}
        </div>
        {error ? <ErrorState message={error.message} /> : isLoading && !dictionary ? <LoadingRows /> : dictionary?.entries.length ? (
          <>
            <div className="divide-y divide-border rounded-lg border border-border bg-card">
              {dictionary.entries.map((entry) => <DictionaryRow key={entry.id} entry={entry} />)}
            </div>
            <div className="mt-5"><PaginationControls data={dictionary.pagination} onPage={setPage} /></div>
          </>
        ) : <EmptyState title="No dictionary entries match" detail="Clear one or more filters, or search a broader Kuku Yalanji or English form." />}
      </section>
    </div>
  );
}

function SentenceResult({ row }: { row: SentenceRow }) {
  return (
    <article className="px-4 py-5 sm:px-5">
      <div className="flex flex-wrap items-center gap-2 text-xs text-foreground/60">
        <span className="font-mono">#{row.id}</span>
        <span>{row.batch} · row {row.sequence}</span>
        <StatusPill tone={row.status === 'accepted' ? 'success' : row.status === 'revised' ? 'info' : 'warning'}>{labelize(row.status)}</StatusPill>
        {row.tier !== null && <StatusPill>Tier {row.tier}</StatusPill>}
      </div>
      <p lang="gvn" className="mt-3 text-xl font-semibold leading-snug text-[var(--lang-accent)]">{row.kuku}</p>
      <p className="mt-1.5 text-base leading-relaxed text-foreground/85">{row.english}</p>
      <p className="mt-3 overflow-x-auto rounded-lg bg-muted px-3 py-2 font-mono text-xs leading-relaxed text-foreground/75">{row.analysis}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {row.wordsUsed.map((word) => <span key={word} lang="gvn" className="rounded-full bg-[var(--lang-accent-soft)] px-2 py-1 text-xs text-[var(--lang-accent)]">{word}</span>)}
      </div>
      <details className="mt-3">
        <summary className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg px-2 text-sm font-medium text-foreground/70 hover:bg-muted">
          <FileCheck2 className="h-4 w-4" /> Evidence and provenance
        </summary>
        <div className="mt-2 border-t border-border pt-3 text-sm leading-relaxed text-foreground/70">
          <p>{row.evidence ?? 'No evidence note recorded.'}</p>
          <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-xs">
            <div><dt className="inline font-medium">Frame: </dt><dd className="inline font-mono">{row.frame}</dd></div>
            <div><dt className="inline font-medium">Confidence: </dt><dd className="inline">{row.confidence ?? 'not set'}</dd></div>
            <div><dt className="inline font-medium">Rights: </dt><dd className="inline">{labelize(row.rightsStatus)}</dd></div>
          </dl>
        </div>
      </details>
    </article>
  );
}

function SentenceView() {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [status, setStatus] = useState('');
  const [tier, setTier] = useState('');
  const [frame, setFrame] = useState('');
  const [order, setOrder] = useState('desc');
  const [page, setPage] = useState(1);
  const url = buildResearchUrl('sentences', { q: deferredQuery, status, tier, frame, order, page, limit: 25 });
  const { data, error, isLoading } = useSWR<ResearchEnvelope<SentenceData>>(url, fetcher<SentenceData>, { keepPreviousData: true });
  const sentences = data?.data;
  const active = Boolean(query || status || tier || frame || order !== 'desc');
  const resetPage = <T,>(setter: (_value: T) => void) => (value: T) => { setter(value); setPage(1); };

  return (
    <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <FilterPanel active={active}>
        <SearchField value={query} onChange={resetPage(setQuery)} placeholder="English, Kuku, analysis, evidence" label="Search sentences" />
        <FilterSelect label="Disposition" value={status} onChange={resetPage(setStatus)} options={sentences?.filters.statuses ?? []} allLabel="All dispositions" />
        <FilterSelect label="Difficulty" value={tier} onChange={resetPage(setTier)} options={sentences?.filters.tiers ?? []} allLabel="All tiers" />
        <FilterSelect label="Frame" value={frame} onChange={resetPage(setFrame)} options={sentences?.filters.frames ?? []} allLabel="All frames" />
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium">Order</span>
          <select value={order} onChange={(event) => { setOrder(event.target.value); setPage(1); }} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm">
            <option value="desc">Newest first</option>
            <option value="asc">Oldest first</option>
          </select>
        </label>
        {active && (
          <Button variant="ghost" onClick={() => { setQuery(''); setStatus(''); setTier(''); setFrame(''); setOrder('desc'); setPage(1); }} className="w-full gap-2">
            <X className="h-4 w-4" /> Clear filters
          </Button>
        )}
      </FilterPanel>

      <section aria-labelledby="sentence-results-heading">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="sentence-results-heading" className="text-xl font-semibold">Parallel sentences</h2>
            <p className="mt-1 max-w-3xl text-sm text-foreground/65">Project-reviewed synthetic pairs. Open each row to inspect its source rationale and morphology.</p>
          </div>
          {sentences && <span className="shrink-0 text-sm tabular-nums text-foreground/65">{formatNumber(sentences.pagination.total)} pairs</span>}
        </div>
        <div className="mb-4 flex gap-3 rounded-lg border border-amber-600/25 bg-amber-500/10 px-4 py-3 text-sm leading-relaxed text-foreground/80">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>These rows are training and editorial evidence, not speaker-certified translations.</p>
        </div>
        {error ? <ErrorState message={error.message} /> : isLoading && !sentences ? <LoadingRows /> : sentences?.rows.length ? (
          <>
            <div className="divide-y divide-border rounded-lg border border-border bg-card">
              {sentences.rows.map((row) => <SentenceResult key={row.id} row={row} />)}
            </div>
            <div className="mt-5"><PaginationControls data={sentences.pagination} onPage={setPage} /></div>
          </>
        ) : <EmptyState title="No sentence pairs match" detail="Try an English gloss, a Kuku Yalanji form, or remove a frame or tier filter." />}
      </section>
    </div>
  );
}

function recordText(record: Record<string, unknown>): string {
  return ['sense', 'definition', 'source', 'ref', 'quote']
    .map((key) => typeof record[key] === 'string' ? record[key] : '')
    .filter(Boolean)
    .join(' · ');
}

function LexemeResult({ row }: { row: LexemeRow }) {
  const hasDetail = row.senses.length || row.attestation.length || row.allomorphy || row.morphology || row.collocations || row.usageNotes || row.notes;
  return (
    <article className="px-4 py-4 sm:px-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h3 lang="gvn" className="headword text-xl font-semibold text-[var(--lang-accent)]">{row.headword}</h3>
            {row.phonemic && <span className="font-mono text-xs text-foreground/60">{row.phonemic}</span>}
          </div>
          <p className="mt-1 text-sm text-foreground/80">{row.gloss}</p>
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          <StatusPill>{labelize(row.pos)}</StatusPill>
          <StatusPill tone={row.status === 'verified' || row.status === 'attested' ? 'success' : 'warning'}>{labelize(row.status)}</StatusPill>
          <StatusPill tone="info">{formatNumber(row.corpusFrequency)} uses</StatusPill>
        </div>
      </div>
      {Boolean(hasDetail) && (
        <details className="mt-2">
          <summary className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg px-2 text-sm font-medium text-foreground/70 hover:bg-muted">
            <Database className="h-4 w-4" /> Ledger evidence
          </summary>
          <div className="mt-2 grid gap-4 border-t border-border pt-3 text-sm md:grid-cols-2">
            {row.senses.length > 0 && <div><h4 className="font-medium">Senses</h4><ul className="mt-1 space-y-1 text-foreground/70">{row.senses.map((item, index) => <li key={index}>{recordText(item)}</li>)}</ul></div>}
            {row.attestation.length > 0 && <div><h4 className="font-medium">Attestation</h4><ul className="mt-1 space-y-1 text-foreground/70">{row.attestation.map((item, index) => <li key={index}>{recordText(item)}</li>)}</ul></div>}
            {row.morphology && <div><h4 className="font-medium">Morphology</h4><p className="mt-1 text-foreground/70">{row.morphology}</p></div>}
            {row.allomorphy && <div><h4 className="font-medium">Allomorphy</h4><p className="mt-1 text-foreground/70">{row.allomorphy}</p></div>}
            {row.collocations && <div><h4 className="font-medium">Collocations</h4><p className="mt-1 text-foreground/70">{row.collocations}</p></div>}
            {row.usageNotes && <div><h4 className="font-medium">Usage notes</h4><p className="mt-1 text-foreground/70">{row.usageNotes}</p></div>}
          </div>
        </details>
      )}
    </article>
  );
}

function LexemeView() {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [status, setStatus] = useState('');
  const [pos, setPos] = useState('');
  const [page, setPage] = useState(1);
  const url = buildResearchUrl('lexemes', { q: deferredQuery, status, pos, page, limit: 30 });
  const { data, error, isLoading } = useSWR<ResearchEnvelope<LexemeData>>(url, fetcher<LexemeData>, { keepPreviousData: true });
  const lexemes = data?.data;
  const active = Boolean(query || status || pos);
  const resetPage = <T,>(setter: (_value: T) => void) => (value: T) => { setter(value); setPage(1); };

  return (
    <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <FilterPanel active={active}>
        <SearchField value={query} onChange={resetPage(setQuery)} placeholder="Headword, gloss, morphology" label="Search lexeme ledger" />
        <FilterSelect label="Status" value={status} onChange={resetPage(setStatus)} options={lexemes?.filters.statuses ?? []} allLabel="All statuses" />
        <FilterSelect label="Part of speech" value={pos} onChange={resetPage(setPos)} options={lexemes?.filters.partsOfSpeech ?? []} allLabel="All parts of speech" />
        {active && <Button variant="ghost" onClick={() => { setQuery(''); setStatus(''); setPos(''); setPage(1); }} className="w-full gap-2"><X className="h-4 w-4" /> Clear filters</Button>}
      </FilterPanel>
      <section aria-labelledby="lexeme-results-heading">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h2 id="lexeme-results-heading" className="text-xl font-semibold">Verified lexeme ledger</h2>
            <p className="mt-1 text-sm text-foreground/65">Forms vouched for during sentence review, with attestation and corpus frequency.</p>
          </div>
          {lexemes && <span className="shrink-0 text-sm tabular-nums text-foreground/65">{formatNumber(lexemes.pagination.total)} lexemes</span>}
        </div>
        {error ? <ErrorState message={error.message} /> : isLoading && !lexemes ? <LoadingRows /> : lexemes?.rows.length ? (
          <>
            <div className="divide-y divide-border rounded-lg border border-border bg-card">
              {lexemes.rows.map((row) => <LexemeResult key={row.id} row={row} />)}
            </div>
            <div className="mt-5"><PaginationControls data={lexemes.pagination} onPage={setPage} /></div>
          </>
        ) : <EmptyState title="No lexemes match" detail="Search a broader form or clear the status and part-of-speech filters." />}
      </section>
    </div>
  );
}

function DatasetView() {
  const url = buildResearchUrl('dataset');
  const { data, error, isLoading } = useSWR<ResearchEnvelope<DatasetData>>(
    url,
    fetcher<DatasetData>,
    { revalidateOnFocus: false },
  );
  if (error) return <ErrorState message={error.message} />;
  if (isLoading || !data) return <LoadingRows count={6} />;

  const dataset = data.data;
  const recommended = dataset.archives.find((archive) => archive.recommended) ?? dataset.archives[0];

  return (
    <div className="space-y-9">
      <section className="border-b border-border pb-7" aria-labelledby="dataset-download-heading">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill tone="success">Complete research release</StatusPill>
              <StatusPill tone="warning">Speaker review pending</StatusPill>
            </div>
            <h2 id="dataset-download-heading" className="mt-4 text-2xl font-semibold">Download the full dataset</h2>
            <p className="mt-2 text-sm leading-relaxed text-foreground/70">
              Every sentence, dictionary entry, lexeme analysis, review, revision, lesson, process event,
              governed training split, audit, and generation record in one checksummed release.
            </p>
          </div>
          {recommended && (
            <a
              href={recommended.href}
              download
              className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              <Download className="h-5 w-5" aria-hidden="true" />
              Download ZIP · {formatBytes(recommended.bytes)}
            </a>
          )}
        </div>
        <dl className="mt-6 grid overflow-hidden rounded-lg border border-border bg-card sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['Sentence pairs', dataset.counts.sentences],
            ['Dictionary entries', dataset.counts.dictionary_entries],
            ['Lexeme records', dataset.counts.lexemes],
            ['Review decisions', dataset.counts.reviews],
          ].map(([label, value], index) => (
            <div key={String(label)} className={cn('px-4 py-3', index > 0 && 'border-t border-border sm:border-l sm:border-t-0', index >= 2 && 'sm:border-t lg:border-t-0')}>
              <dt className="text-xs text-foreground/60">{label}</dt>
              <dd className="mt-1 text-lg font-semibold tabular-nums">{formatNumber(Number(value))}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="rounded-lg border border-amber-600/30 bg-amber-500/10 p-5" aria-labelledby="dataset-status-heading">
        <div className="flex gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-foreground/75" />
          <div>
            <h2 id="dataset-status-heading" className="text-base font-semibold">Synthetic research data, not speaker-certified language</h2>
            <p className="mt-1 max-w-5xl text-sm leading-relaxed text-foreground/75">
              Project review does not equal fluent-speaker or elder approval. The download does not grant a blanket
              reuse license over community language knowledge or third-party sources. Read the data-use statement
              before redistribution, commercial use, or model deployment.
            </p>
          </div>
        </div>
      </section>

      <section aria-labelledby="complete-archives-heading">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="complete-archives-heading" className="text-xl font-semibold">Complete archives</h2>
            <p className="mt-1 text-sm text-foreground/65">ZIP for general use; tar.gz for reproducible data workflows.</p>
          </div>
          <p className="font-mono text-xs text-foreground/55">{dataset.version} · {formatDate(dataset.released_at)}</p>
        </div>
        <div className="mt-4 divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
          {dataset.archives.map((archive) => (
            <div key={archive.id} className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Archive className="h-5 w-5 text-[var(--lang-accent)]" aria-hidden="true" />
                  <h3 className="font-semibold">{archive.label}</h3>
                  <StatusPill tone={archive.recommended ? 'success' : 'neutral'}>{archive.format}</StatusPill>
                  {archive.recommended && <span className="text-xs text-foreground/60">Recommended</span>}
                </div>
                <p className="mt-2 break-all font-mono text-xs text-foreground/55">SHA-256 {archive.sha256}</p>
              </div>
              <a
                href={archive.href}
                download
                className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted"
              >
                <Download className="h-4 w-4" aria-hidden="true" /> {formatBytes(archive.bytes)}
              </a>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="direct-files-heading">
        <h2 id="direct-files-heading" className="text-xl font-semibold">Individual data files</h2>
        <p className="mt-1 text-sm text-foreground/65">Download only the format you need without unpacking the complete archive.</p>
        <div className="mt-4 divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
          {dataset.direct_files.map((file) => (
            <div key={file.id} className="flex items-center justify-between gap-4 p-4">
              <div className="flex min-w-0 items-start gap-3">
                {file.format === 'SQLite'
                  ? <Database className="mt-0.5 h-5 w-5 shrink-0 text-[var(--lang-accent)]" aria-hidden="true" />
                  : <FileText className="mt-0.5 h-5 w-5 shrink-0 text-[var(--lang-accent)]" aria-hidden="true" />}
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold">{file.label}</h3>
                  <p className="mt-1 truncate font-mono text-xs text-foreground/55">{file.sha256}</p>
                </div>
              </div>
              <a
                href={file.href}
                download
                title={`Download ${file.label}`}
                aria-label={`Download ${file.label}, ${formatBytes(file.bytes)}`}
                className="inline-flex h-11 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-medium text-[var(--lang-accent)] hover:bg-muted"
              >
                <span className="hidden sm:inline">{formatBytes(file.bytes)}</span>
                <Download className="h-4 w-4" aria-hidden="true" />
              </a>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-8 lg:grid-cols-2" aria-label="Dataset contents and integrity">
        <div className="border-t border-border pt-5">
          <h2 className="text-xl font-semibold">Process retained</h2>
          <dl className="mt-4 grid grid-cols-2 gap-x-5 gap-y-4 text-sm">
            <div><dt className="text-foreground/60">Revisions</dt><dd className="mt-1 font-medium tabular-nums">{formatNumber(dataset.counts.revisions)}</dd></div>
            <div><dt className="text-foreground/60">Lessons</dt><dd className="mt-1 font-medium tabular-nums">{formatNumber(dataset.counts.lessons)}</dd></div>
            <div><dt className="text-foreground/60">Process events</dt><dd className="mt-1 font-medium tabular-nums">{formatNumber(dataset.counts.process_events)}</dd></div>
            <div><dt className="text-foreground/60">Language identifier</dt><dd className="mt-1 font-medium">{dataset.language.iso_639_3} · {dataset.language.bcp_47}</dd></div>
          </dl>
        </div>
        <div className="border-t border-border pt-5">
          <h2 className="text-xl font-semibold">Release records</h2>
          <div className="mt-4 flex flex-wrap gap-3">
            {[
              ['Manifest', dataset.manifest_href],
              ['SHA-256 checksums', dataset.checksums_href],
              ['Dataset README', dataset.readme_href],
              ['Data use', dataset.data_use_href],
            ].map(([label, href]) => (
              <a key={href} href={href} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted">
                {label} <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </a>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function ModelView() {
  const url = buildResearchUrl('model');
  const { data, error, isLoading } = useSWR<ResearchEnvelope<ModelData>>(url, fetcher<ModelData>, { revalidateOnFocus: false });
  if (error) return <ErrorState message={error.message} />;
  if (isLoading || !data) return <LoadingRows count={6} />;
  const model = data.data;
  const maxChrf = Math.max(...model.curve.map((point) => point.chrf), 1);

  return (
    <div className="space-y-9">
      <section className="rounded-lg border border-amber-600/30 bg-amber-500/10 p-5" aria-labelledby="model-verdict-heading">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-foreground/75" />
            <div>
              <h2 id="model-verdict-heading" className="text-lg font-semibold">Research-only v2 candidate</h2>
              <p className="mt-2 max-w-4xl text-sm leading-relaxed text-foreground/80">{model.verdict}</p>
            </div>
          </div>
          <StatusPill tone="warning">Not promotion eligible</StatusPill>
        </div>
      </section>

      <section aria-labelledby="model-contract-heading">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="model-contract-heading" className="text-xl font-semibold">Frozen run contract</h2>
            <p className="mt-1 break-all font-mono text-xs text-foreground/60">{model.experimentId}</p>
          </div>
          <StatusPill tone="success">Archive {model.archive.status}</StatusPill>
        </div>
        <dl className="mt-4 grid overflow-hidden rounded-lg border border-border bg-card sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['Base', model.treatment.baseModel],
            ['Treatment', `${formatNumber(model.treatment.train)} synthetic rows`],
            ['Heldout', `${formatNumber(model.treatment.validation)} dev · ${formatNumber(model.treatment.test)} test`],
            ['Quarantine', `${formatNumber(model.treatment.quarantine)} retained rows`],
            ['Schedule', `${model.treatment.epochs} epochs · LR ${model.treatment.learningRate}`],
            ['Effective batch', model.treatment.effectiveBatch],
            ['Token caps', `${model.treatment.sourceTokenCap} source · ${model.treatment.targetTokenCap} target`],
            ['Seed', model.treatment.seed],
          ].map(([label, value], index) => (
            <div key={String(label)} className={cn('min-w-0 px-4 py-3', index > 0 && 'border-t border-border sm:border-l', index >= 2 && 'sm:border-t', index >= 4 && 'lg:border-t')}>
              <dt className="text-xs text-foreground/60">{label}</dt>
              <dd className="mt-1 break-words text-sm font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="grid gap-8 lg:grid-cols-2" aria-label="Gate and training curve">
        <div>
          <h2 className="text-xl font-semibold">Mandatory gate</h2>
          <div className="mt-4 divide-y divide-border rounded-lg border border-border bg-card">
            {model.gates.map((gate) => (
              <div key={gate.id} className="flex items-start gap-3 p-4">
                {gate.status === 'pass' ? <Check className="mt-0.5 h-5 w-5 text-[var(--lang-accent)]" /> : <X className="mt-0.5 h-5 w-5 text-foreground/75" />}
                <div className="flex-1">
                  <div className="flex items-center justify-between gap-4">
                    <h3 className="text-sm font-semibold">{gate.label}</h3>
                    <StatusPill tone={gate.status === 'pass' ? 'success' : 'danger'}>{gate.status}</StatusPill>
                  </div>
                  <p className="mt-2 text-sm text-foreground/65">{gate.exact}/{gate.rows} exact · chrF {gate.chrf.toFixed(2)} · {gate.empty} empty</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h2 className="text-xl font-semibold">Validation curve</h2>
          <div className="mt-4 space-y-4 rounded-lg border border-border bg-card p-4">
            {model.curve.map((point) => (
              <div key={point.step}>
                <div className="mb-1.5 flex items-center justify-between gap-4 text-xs">
                  <span>Epoch {Math.round(point.epoch)} · step {formatNumber(point.step)}</span>
                  <span className="font-medium tabular-nums">chrF {point.chrf.toFixed(2)}</span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-[var(--lang-accent)]" style={{ width: `${(point.chrf / maxChrf) * 100}%` }} />
                </div>
                <p className="mt-1 text-xs text-foreground/55">BLEU {point.bleu.toFixed(2)} · loss {point.loss.toFixed(3)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section aria-labelledby="evaluation-heading">
        <h2 id="evaluation-heading" className="text-xl font-semibold">Frozen evaluation battery</h2>
        <p className="mt-1 text-sm text-foreground/65">Synthetic heldout scores measure the corpus process. External rows expose the transfer failure.</p>
        <div className="mt-4 overflow-x-auto rounded-lg border border-border">
          <table className="min-w-[48rem] w-full border-collapse text-sm">
            <thead className="bg-muted text-left text-xs text-foreground/65">
              <tr>
                <th className="px-4 py-3 font-medium">Set</th>
                <th className="px-3 py-3 text-right font-medium">Rows</th>
                <th className="px-3 py-3 text-right font-medium">BLEU</th>
                <th className="px-3 py-3 text-right font-medium">chrF</th>
                <th className="px-3 py-3 text-right font-medium">Exact</th>
                <th className="px-3 py-3 text-right font-medium">Length</th>
                <th className="px-4 py-3 font-medium">Scope</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {model.evaluations.map((evaluation) => (
                <tr key={evaluation.id} className={evaluation.category === 'external' ? 'bg-amber-500/5' : undefined}>
                  <td className="px-4 py-3 font-medium">{evaluation.label}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{formatNumber(evaluation.rows)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{evaluation.bleu.toFixed(2)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{evaluation.chrf.toFixed(2)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{formatNumber(evaluation.exact)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{evaluation.meanLengthRatio?.toFixed(3) ?? '—'}</td>
                  <td className="px-4 py-3"><StatusPill tone={evaluation.category === 'external' ? 'warning' : 'info'}>{evaluation.category}</StatusPill></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-8 lg:grid-cols-2" aria-label="Resources and archive">
        <div className="border-t border-border pt-5">
          <h2 className="text-xl font-semibold">RunPod resources</h2>
          <dl className="mt-4 grid grid-cols-2 gap-x-5 gap-y-4 text-sm">
            <div><dt className="text-foreground/60">GPU</dt><dd className="mt-1 font-medium">{model.resources.gpu}</dd></div>
            <div><dt className="text-foreground/60">Training runtime</dt><dd className="mt-1 font-medium">{(model.resources.runtimeSeconds / 60).toFixed(1)} min</dd></div>
            <div><dt className="text-foreground/60">Peak utilization</dt><dd className="mt-1 font-medium">{model.resources.maxGpuUtilization}%</dd></div>
            <div><dt className="text-foreground/60">Peak VRAM</dt><dd className="mt-1 font-medium">{formatNumber(model.resources.maxGpuMemoryMiB)} MiB</dd></div>
            <div><dt className="text-foreground/60">Peak Python RSS</dt><dd className="mt-1 font-medium">{formatNumber(Math.round(model.resources.maxPythonRssMiB))} MiB</dd></div>
            <div><dt className="text-foreground/60">Gross account delta</dt><dd className="mt-1 font-medium">${model.resources.grossAccountDeltaUsd.toFixed(2)}</dd></div>
          </dl>
        </div>
        <div className="border-t border-border pt-5">
          <h2 className="text-xl font-semibold">Archive proof</h2>
          <dl className="mt-4 grid grid-cols-2 gap-x-5 gap-y-4 text-sm">
            <div><dt className="text-foreground/60">Files verified</dt><dd className="mt-1 font-medium">{model.archive.files}/{model.archive.files}</dd></div>
            <div><dt className="text-foreground/60">Model bytes</dt><dd className="mt-1 font-medium">{formatBytes(model.archive.bytes)}</dd></div>
            <div><dt className="text-foreground/60">Load equivalence</dt><dd className="mt-1 font-medium">{model.archive.localRemoteSmokeEquivalent ? 'Local = RunPod' : 'Not proven'}</dd></div>
            <div><dt className="text-foreground/60">Active pods</dt><dd className="mt-1 font-medium">{model.archive.activePodsAfterDelete}</dd></div>
          </dl>
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-medium text-[var(--lang-accent)]">Artifact SHA-256</summary>
            <dl className="mt-2 space-y-2 break-all font-mono text-xs text-foreground/65">
              <div><dt className="font-sans font-medium text-foreground">Merged model</dt><dd>{model.archive.mergedModelSha256}</dd></div>
              <div><dt className="font-sans font-medium text-foreground">Adapter</dt><dd>{model.archive.adapterSha256}</dd></div>
            </dl>
          </details>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card p-5" aria-labelledby="next-experiment-heading">
        <div className="flex gap-3">
          <FlaskConical className="mt-0.5 h-5 w-5 shrink-0 text-[var(--lang-accent)]" />
          <div>
            <h2 id="next-experiment-heading" className="text-base font-semibold">Next: {model.nextExperiment.id}</h2>
            <p className="mt-1 text-sm leading-relaxed text-foreground/70">Owner: {model.nextExperiment.owner}. {model.nextExperiment.purpose}</p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          {model.links.map((link) => (
            <Link key={link.href} href={link.href} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted">
              {link.label} <ArrowRight className="h-4 w-4" />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

export default function KukuYalanjiResearchClient({ initialOverview }: { initialOverview: OverviewData }) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const requestedTab = searchParams.get('view') as WorkbenchTab | null;
  const activeTab = TABS.some((tab) => tab.id === requestedTab) ? requestedTab! : 'overview';

  const setTab = (tab: WorkbenchTab) => {
    const params = new URLSearchParams(searchParams);
    if (tab === 'overview') params.delete('view');
    else params.set('view', tab);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const compactFacts = useMemo(() => [
    ['Corpus pairs', initialOverview.counts.sentences],
    ['Dictionary entries', initialOverview.counts.dictionaryEntries],
    ['Lexeme ledger', initialOverview.counts.lexemes],
    ['Open reviews', initialOverview.counts.open],
  ], [initialOverview]);

  return (
    <div data-language="gvn" className="-mx-4 -mt-6 sm:-mx-6 sm:-mt-8 lg:-mx-8 lg:-mt-12 xl:-mx-12 2xl:-mx-16">
      <header className="border-b border-border bg-[var(--lang-accent-soft)] px-4 py-6 sm:px-6 sm:py-8 lg:px-8 xl:px-12 2xl:px-16">
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-sm text-foreground/65">
          <Link href="/dictionaries" className="hover:text-[var(--lang-accent)]">Dictionaries</Link>
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
          <Link href="/dictionaries/kuku_yalanji" className="hover:text-[var(--lang-accent)]">Kuku Yalanji</Link>
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
          <span aria-current="page" className="font-medium text-foreground">Research workbench</span>
        </nav>
        <div className="mt-5 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill tone="success">20k milestone complete</StatusPill>
              <StatusPill tone="warning">Elder review pending</StatusPill>
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-normal sm:text-4xl">Kuku Yalanji corpus workbench</h1>
            <p className="mt-3 max-w-3xl text-base leading-relaxed text-foreground/75">
              Inspect the reference dictionary, every synthetic sentence pair, the verified lexeme ledger, completion audits, and the v2 model run from one read-only surface.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 self-start lg:self-auto">
            <Link href="?view=dataset" className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
              <Download className="h-4 w-4" /> Download data
            </Link>
            <Link href="/dictionaries/kuku_yalanji" className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg border border-[var(--lang-accent)] px-3 text-sm font-medium text-[var(--lang-accent)] hover:bg-background/50">
              <ArrowLeft className="h-4 w-4" /> Dictionary
            </Link>
          </div>
        </div>
        <dl className="mt-6 flex flex-wrap gap-x-0 gap-y-3 border-y border-[var(--lang-accent)]/20 py-3">
          {compactFacts.map(([label, value], index) => (
            <div key={String(label)} className={cn('min-w-[9.5rem] flex-1 px-3 first:pl-0', index > 0 && 'border-l border-[var(--lang-accent)]/20')}>
              <dt className="text-xs text-foreground/60">{label}</dt>
              <dd className="mt-0.5 text-sm font-semibold tabular-nums">{formatNumber(Number(value))}</dd>
            </div>
          ))}
        </dl>
      </header>

      <nav className="sticky top-16 z-30 overflow-x-auto border-b border-border bg-background/95 px-4 backdrop-blur sm:px-6 lg:px-8 xl:px-12 2xl:px-16" aria-label="Research views">
        <div className="flex min-w-max" role="tablist">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const selected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setTab(tab.id)}
                className={cn(
                  'relative flex min-h-12 items-center gap-2 px-3 text-sm font-medium transition-colors sm:px-4',
                  selected ? 'text-[var(--lang-accent)]' : 'text-foreground/60 hover:text-foreground',
                  selected && 'after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:bg-[var(--lang-accent)]',
                )}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                <span className="sm:hidden">{tab.shortLabel}</span>
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      <div className="px-4 py-7 sm:px-6 sm:py-9 lg:px-8 xl:px-12 2xl:px-16" role="tabpanel">
        {activeTab === 'overview' && <OverviewView initial={initialOverview} />}
        {activeTab === 'dictionary' && <DictionaryView />}
        {activeTab === 'sentences' && <SentenceView />}
        {activeTab === 'lexemes' && <LexemeView />}
        {activeTab === 'dataset' && <DatasetView />}
        {activeTab === 'model' && <ModelView />}
      </div>
    </div>
  );
}
