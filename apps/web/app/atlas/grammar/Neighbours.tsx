'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Info } from 'lucide-react';
import LanguagePicker, { type PickableLang } from './LanguagePicker';
import { familyLabel } from './grammarColors';
import type { GrammarCatalog } from './grammarTypes';

interface NeighboursProps {
  catalog: GrammarCatalog;
}

// A small honest strength cue for the n_joint (how many features the % rests on).
function jointBadge(n: number): { label: string; cls: string } {
  if (n >= 60) return { label: 'many shared', cls: 'bg-eucalyptus-500/15 text-eucalyptus-800 dark:text-eucalyptus-300' };
  if (n >= 30) return { label: 'moderate', cls: 'bg-amber-500/12 text-amber-800 dark:text-amber-300' };
  return { label: 'few shared', cls: 'bg-muted text-muted-foreground' };
}

export default function Neighbours({ catalog }: NeighboursProps) {
  const pickables: PickableLang[] = useMemo(
    () =>
      Object.entries(catalog.langs)
        .map(([slug, l]) => ({ slug, name: l.name, family: l.family, n: l.n }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [catalog.langs],
  );
  const [slug, setSlug] = useState<string | null>(null);
  const neighbours = slug ? catalog.neighbours[slug] ?? [] : [];
  const name = slug ? catalog.langs[slug]?.name ?? slug : '';

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-3.5">
        <p className="flex items-start gap-2 text-[12.5px] leading-snug text-foreground/85">
          <Info size={15} className="mt-px shrink-0 text-amber-600 dark:text-amber-400" />
          <span>
            These are the pairs with the highest{' '}
            <span className="font-semibold">{catalog.metric.label.toLowerCase()}</span> — agreement over
            the Grambank features both languages code. High recorded agreement is{' '}
            <span className="font-semibold">not</span> the same as genetic relatedness or overall
            grammatical similarity: two unrelated languages can share many baseline typological values.
            The <span className="font-mono text-[11px]">n</span> is the number of jointly-coded features
            the percentage rests on — always read it.
          </span>
        </p>
      </div>

      {/* per-language neighbour lookup */}
      <section aria-labelledby="nbr-lookup">
        <h3 id="nbr-lookup" className="text-sm font-semibold text-foreground">
          Nearest neighbours of a language
        </h3>
        <p className="mt-0.5 text-[12.5px] text-muted-foreground">
          Pick a language to see its closest matches by recorded Grambank agreement.
        </p>
        <div className="mt-2.5 max-w-md">
          <LanguagePicker
            langs={pickables}
            label="Choose a language to see its neighbours"
            placeholder="Search a language…"
            onPick={setSlug}
          />
        </div>

        {slug && (
          <div className="mt-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-baseline justify-between gap-2">
              <h4 className="text-[15px] font-semibold text-foreground" lang="mis">
                {name}
              </h4>
              <Link href={`/atlas/${slug}`} className="text-[12.5px] font-medium text-primary hover:underline">
                Profile →
              </Link>
            </div>
            {neighbours.length === 0 ? (
              <p className="mt-2 text-[13px] text-muted-foreground">
                No recorded-agreement neighbours — this language has no jointly-coded Grambank features
                with any other profiled language (it may be WALS- or extension-only).
              </p>
            ) : (
              <ol className="mt-2.5 space-y-1.5">
                {neighbours.map((nb, i) => {
                  const jb = jointBadge(nb.n_joint);
                  return (
                    <li key={nb.slug} className="flex items-center gap-3 text-[13px]">
                      <span className="w-4 shrink-0 text-right tabular-nums text-[11px] text-muted-foreground">
                        {i + 1}
                      </span>
                      <Link
                        href={`/atlas/${nb.slug}`}
                        className="min-w-0 flex-1 truncate font-medium text-foreground hover:text-primary hover:underline"
                        lang="mis"
                      >
                        {nb.name}
                      </Link>
                      <span className="hidden shrink-0 truncate text-[11px] text-muted-foreground sm:block">
                        {familyLabel(nb.family)}
                      </span>
                      <span className={`shrink-0 rounded-full px-1.5 py-px text-[10px] font-medium ${jb.cls}`}>
                        n={nb.n_joint} · {jb.label}
                      </span>
                      <span className="w-12 shrink-0 text-right font-semibold tabular-nums text-foreground">
                        {Math.round(nb.score * 100)}%
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        )}
      </section>

      {/* global leaderboard */}
      <section aria-labelledby="nbr-top">
        <h3 id="nbr-top" className="text-sm font-semibold text-foreground">
          Highest recorded agreement across the atlas
        </h3>
        <p className="mt-0.5 text-[12.5px] text-muted-foreground">
          The {catalog.top_pairs.length} language pairs with the strongest recorded Grambank agreement
          (over ≥ 25 jointly-coded features, so the figure means something).
        </p>
        <div className="mt-3 overflow-hidden rounded-2xl border border-border">
          <div className="grid grid-cols-[2rem_1fr_1fr_5.5rem_4rem] items-center gap-2 border-b border-border bg-muted/50 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <span>#</span>
            <span>Language</span>
            <span>Language</span>
            <span className="text-right">jointly-coded</span>
            <span className="text-right">agree</span>
          </div>
          <ul className="divide-y divide-border/60">
            {catalog.top_pairs.map((p, i) => (
              <li
                key={`${p.a.slug}-${p.b.slug}`}
                className="grid grid-cols-[2rem_1fr_1fr_5.5rem_4rem] items-center gap-2 px-4 py-2 text-[13px]"
              >
                <span className="tabular-nums text-[11px] text-muted-foreground">{i + 1}</span>
                <Link href={`/atlas/${p.a.slug}`} className="truncate text-foreground hover:text-primary hover:underline" lang="mis">
                  {p.a.name}
                </Link>
                <Link href={`/atlas/${p.b.slug}`} className="truncate text-foreground hover:text-primary hover:underline" lang="mis">
                  {p.b.name}
                </Link>
                <span className="text-right tabular-nums text-muted-foreground">n = {p.n_joint}</span>
                <span className="text-right font-semibold tabular-nums text-foreground">
                  {Math.round(p.score * 100)}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
