'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, BookOpen, Search, ShieldAlert } from 'lucide-react';

type Variety = 'all' | 'alungul-y199' | 'olgol-y73' | 'gugu-yawa-y74';

type CandidateMatch = {
  record_id: string;
  query_source: string;
  target_form_source: string;
  variety: string;
  orthography: string;
  review_status: string;
  source_ids: string[];
  score: number;
};

type LookupResponse = {
  success: boolean;
  route: string;
  matches: CandidateMatch[];
  abstention_reason: string | null;
  model_id: string;
  model_version: string;
  model_sha256: string;
  dictionary_edition: string;
  grammar_edition: string;
  capability: string;
};

const VARIETIES: Array<{ value: Variety; label: string; note: string }> = [
  { value: 'all', label: 'All indexed varieties', note: 'Search without merging labels' },
  { value: 'alungul-y199', label: 'Alungul Y199', note: '5 candidate senses' },
  { value: 'olgol-y73', label: 'Olgol Y73', note: '1,876 candidate records' },
  { value: 'gugu-yawa-y74', label: 'Gugu Yawa Y74', note: 'No rows; must abstain' },
];

const ABSTENTION_LABELS: Record<string, string> = {
  no_candidate_rows_for_variety: 'No candidate rows are available for this variety.',
  below_similarity_threshold: 'No indexed candidate was similar enough. The model failed closed.',
  no_known_features: 'The query does not overlap the indexed evidence.',
  empty_query: 'Enter an English concept or dictionary gloss.',
};

export default function KukuPossumLexicalClient() {
  const [query, setQuery] = useState('');
  const [variety, setVariety] = useState<Variety>('all');
  const [result, setResult] = useState<LookupResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch('/api/kuku-possum/lookup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: trimmed, variety, top_k: 8 }),
      });
      const body = (await response.json()) as LookupResponse & { error?: string };
      if (!response.ok) throw new Error(body.error ?? 'Lookup failed.');
      setResult(body);
    } catch (lookupError) {
      setError(lookupError instanceof Error ? lookupError.message : 'Lookup failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main id="main-content" className="marketing min-h-[calc(100vh-4rem)] bg-[#1e120b] text-[#fff8eb]">
      <section className="relative overflow-hidden border-b border-[#fff8eb]/10">
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-[#d86f3c]/20 blur-3xl" />
        <div className="container-custom relative py-16 sm:py-24">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#efb56f]">
            MobTranslate research model · v0.1.0
          </p>
          <h1 className="mt-5 max-w-4xl text-5xl font-bold leading-[0.94] tracking-tight sm:text-7xl">
            Kuku Possum<br /><span className="text-[#efb56f]">candidate lexicon</span>
          </h1>
          <p className="mt-7 max-w-2xl text-lg leading-relaxed text-[#fff8eb]/68">
            Search English concepts against a source-backed multi-variety candidate index.
            Alungul, Olgol and Gugu Yawa stay explicitly labelled and are never collapsed.
          </p>
        </div>
      </section>

      <section className="container-custom py-10 sm:py-14">
        <div className="mb-8 flex gap-4 rounded-xl border border-[#e86b45]/45 bg-[#e86b45]/10 p-5 text-[#fff1e7]">
          <ShieldAlert className="mt-0.5 h-6 w-6 shrink-0 text-[#ef8b66]" aria-hidden="true" />
          <div>
            <h2 className="font-semibold">Experimental candidate evidence—not sentence translation</h2>
            <p className="mt-1 text-sm leading-relaxed text-[#fff8eb]/70">
              Every returned form is unreviewed and requires qualified fluent-language review.
              Similarity scores are retrieval measurements, not linguistic confidence.
            </p>
          </div>
        </div>

        <form onSubmit={submit} className="rounded-2xl border border-[#fff8eb]/14 bg-[#2b1c13] p-5 shadow-2xl sm:p-7">
          <div className="grid gap-5 lg:grid-cols-[1fr_19rem_auto] lg:items-end">
            <label className="block">
              <span className="mb-2 block text-sm font-semibold">English concept or gloss</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                maxLength={400}
                placeholder="Try person, water, spear…"
                className="h-12 w-full rounded-lg border border-[#fff8eb]/20 bg-[#160d08] px-4 text-[#fff8eb] placeholder:text-[#fff8eb]/35 focus:border-[#efb56f]"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold">Variety</span>
              <select
                value={variety}
                onChange={(event) => setVariety(event.target.value as Variety)}
                className="h-12 w-full rounded-lg border border-[#fff8eb]/20 bg-[#160d08] px-4 text-[#fff8eb] focus:border-[#efb56f]"
              >
                {VARIETIES.map((item) => (
                  <option key={item.value} value={item.value}>{item.label} — {item.note}</option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[#efb56f] px-6 font-bold text-[#241308] transition hover:bg-[#ffd092] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Search className="h-4 w-4" /> {loading ? 'Searching…' : 'Search'}
            </button>
          </div>
          <p className="mt-3 text-xs text-[#fff8eb]/48">
            No generic multilingual fallback. Unsupported and low-similarity input returns no result.
          </p>
        </form>

        <div className="mt-7" aria-live="polite">
          {error && (
            <div className="rounded-xl border border-red-400/35 bg-red-400/10 p-5 text-red-100">{error}</div>
          )}
          {result && !result.success && (
            <div className="rounded-xl border border-[#fff8eb]/14 bg-[#2b1c13] p-6">
              <h2 className="text-lg font-semibold">No candidate returned</h2>
              <p className="mt-2 text-[#fff8eb]/65">
                {ABSTENTION_LABELS[result.abstention_reason ?? ''] ?? 'The route abstained.'}
              </p>
            </div>
          )}
          {result?.success && (
            <div className="grid gap-4">
              {result.matches.map((match) => (
                <article key={match.record_id} className="rounded-xl border border-[#fff8eb]/14 bg-[#2b1c13] p-5 sm:p-6">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-3xl font-bold text-[#efb56f]">{match.target_form_source}</p>
                      <p className="mt-2 text-[#fff8eb]/75">Indexed gloss: {match.query_source}</p>
                    </div>
                    <span className="rounded-full border border-[#efb56f]/35 px-3 py-1 text-xs text-[#efb56f]">
                      similarity {match.score.toFixed(3)}
                    </span>
                  </div>
                  <dl className="mt-5 grid gap-3 border-t border-[#fff8eb]/10 pt-4 text-sm sm:grid-cols-3">
                    <div><dt className="text-[#fff8eb]/45">Variety</dt><dd>{match.variety}</dd></div>
                    <div><dt className="text-[#fff8eb]/45">Orthography</dt><dd>{match.orthography}</dd></div>
                    <div><dt className="text-[#fff8eb]/45">Evidence state</dt><dd>{match.review_status}</dd></div>
                  </dl>
                  <p className="mt-4 text-xs text-[#fff8eb]/45">
                    Source IDs: {match.source_ids.join(', ') || 'preserved source anchor'}
                  </p>
                </article>
              ))}
            </div>
          )}
        </div>

        <div className="mt-10 grid gap-5 border-t border-[#fff8eb]/10 pt-8 md:grid-cols-2">
          <div className="flex gap-3">
            <BookOpen className="mt-0.5 h-5 w-5 shrink-0 text-[#efb56f]" />
            <p className="text-sm leading-relaxed text-[#fff8eb]/58">
              1,881 candidate sense records from frozen dictionary and grammar editions. The
              closed-census retrieval score does not measure unseen-language generalisation.
            </p>
          </div>
          <Link
            href="https://huggingface.co/ajaxdavis/mobtranslate-kuku-possum-candidate-lexical-v1"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-start gap-2 text-sm font-semibold text-[#efb56f] hover:text-[#ffd092] md:justify-self-end"
          >
            Model card, hashes and evaluation <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </main>
  );
}

