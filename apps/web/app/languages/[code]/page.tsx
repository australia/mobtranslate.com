import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import SharedLayout from '../../components/SharedLayout';
import { Badge } from '@mobtranslate/ui';
import {
  getLanguageTypology,
  listLanguageCodes,
  groupFeaturesByDomain,
  groupConstructionsByDomain,
} from '@/lib/typology';
import { ArrowLeft, BookOpen, MapPin, Layers, GitCompare } from 'lucide-react';

export const dynamic = 'force-static';
export const dynamicParams = false;

export function generateStaticParams() {
  return listLanguageCodes().map((code) => ({ code }));
}

export async function generateMetadata(props: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await props.params;
  const lang = getLanguageTypology(code);
  if (!lang) return { title: 'Language — MobTranslate' };
  return {
    title: `${lang.name} — grammatical profile — MobTranslate`,
    description: `Grammatical profile of ${lang.name} (${lang.family || 'Australian'}): ${lang.coverage.grambank_coded} Grambank baseline features, construction records and related languages.`,
  };
}

const DOMAIN_LABELS: Record<string, string> = {
  nominal: 'Nominal categories',
  pronoun: 'Pronouns',
  demonstrative: 'Demonstratives',
  verb_and_valency: 'Verb & valency',
  clause_and_syntax: 'Clause & syntax',
  numerals: 'Numerals',
  other: 'Other',
};

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-xs font-medium text-foreground mt-0.5">{label}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

export default async function LanguageTypologyPage(props: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await props.params;
  const lang = getLanguageTypology(code);
  if (!lang) notFound();

  const featureGroups = groupFeaturesByDomain(lang.grambank_features);
  const constructionGroups = groupConstructionsByDomain(lang.constructions);

  return (
    <SharedLayout>
      <div className="max-w-4xl mx-auto py-8 md:py-12">
        <Link
          href="/languages"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary no-underline mb-6"
        >
          <ArrowLeft className="h-4 w-4" /> All languages
        </Link>

        {/* header */}
        <header className="mb-8">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">{lang.name}</h1>
            <span className="text-sm text-muted-foreground font-mono">{lang.glottocode}</span>
            {lang.iso639_3 && <span className="text-sm text-muted-foreground font-mono">ISO {lang.iso639_3}</span>}
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            {lang.family && <Badge variant="outline">{lang.family}</Badge>}
            {lang.subgroup && lang.subgroup !== lang.family && <Badge variant="secondary">{lang.subgroup}</Badge>}
            {lang.endangerment && <Badge variant="secondary">{lang.endangerment}</Badge>}
            {lang.dictionary && (
              <Link href={lang.dictionary.href} className="no-underline">
                <Badge variant="default" className="inline-flex items-center gap-1">
                  <BookOpen className="h-3 w-3" /> Dictionary
                </Badge>
              </Link>
            )}
          </div>
          {(lang.latitude != null || lang.austlang_codes.length > 0) && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-sm text-muted-foreground">
              {lang.latitude != null && lang.longitude != null && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" /> {lang.latitude.toFixed(3)}, {lang.longitude.toFixed(3)}
                </span>
              )}
              {lang.austlang_codes.length > 0 && (
                <span>AUSTLANG {lang.austlang_codes.join(', ')}</span>
              )}
            </div>
          )}
        </header>

        {/* coverage */}
        <section className="mb-10">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat
              label="Grambank features"
              value={lang.coverage.grambank_coded}
              sub={`of 195 (${lang.coverage.grambank_pct}%)`}
            />
            <Stat label="Unknown (?)" value={lang.coverage.grambank_unknown} sub="assessed, undetermined" />
            <Stat label="WALS features" value={lang.coverage.wals_coded} sub="supplement" />
            <Stat
              label="Extension features"
              value={lang.coverage.aus_extension_coded}
              sub={`of ${lang.coverage.aus_extension_total} Australianist`}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
            The Grambank baseline is a <strong>standardized cross-linguistic set of 195 features</strong>,
            not an exhaustive grammar. Unknown (<code>?</code>) means Grambank assessed the feature but
            could not determine a value &mdash; it is kept distinct from &ldquo;absent&rdquo; and from
            &ldquo;not recorded&rdquo;.
          </p>
        </section>

        {/* similar languages */}
        {lang.neighbours.length > 0 && (
          <section className="mb-10">
            <h2 className="text-lg font-semibold flex items-center gap-2 mb-1">
              <GitCompare className="h-5 w-5 text-primary" /> Related languages
            </h2>
            <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
              By <em>grambank_recorded_agreement</em> &mdash; the share of jointly-coded Grambank
              features on which the two languages agree. This is agreement over recorded codings
              (<code>n</code> = number of jointly-coded features), <strong>not</strong> a claim of overall
              grammatical similarity.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {lang.neighbours.map((n) => (
                <Link
                  key={n.glottocode}
                  href={`/languages/${n.glottocode}`}
                  className="group no-underline flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-2.5 hover:border-primary transition-colors"
                >
                  <span className="font-medium group-hover:text-primary transition-colors">
                    {n.name || n.glottocode}
                  </span>
                  <span className="text-sm text-muted-foreground tabular-nums whitespace-nowrap">
                    {(n.grambank_recorded_agreement * 100).toFixed(0)}%
                    <span className="text-xs"> · n={n.n_joint}</span>
                  </span>
                </Link>
              ))}
            </div>
            {lang.cluster_meta && (
              <p className="text-xs text-muted-foreground mt-3">
                Typological cluster {lang.cluster} ({lang.cluster_meta.size} languages).
              </p>
            )}
          </section>
        )}

        {/* construction records */}
        {lang.constructions.length > 0 && (
          <section className="mb-10">
            <h2 className="text-lg font-semibold flex items-center gap-2 mb-1">
              <Layers className="h-5 w-5 text-primary" /> Construction records
              <span className="text-sm font-normal text-muted-foreground">({lang.constructions.length})</span>
            </h2>
            <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
              The primary descriptive-data layer: individual grammatical constructions with cited
              examples. Community terminology and rights review are pending consultation.
            </p>
            <div className="space-y-6">
              {constructionGroups.map(([domain, records]) => (
                <div key={domain}>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    {domain.replace(/-/g, ' ')}
                  </h3>
                  <div className="space-y-3">
                    {records.map((r) => (
                      <div key={r.id} className="rounded-lg border border-border bg-card p-4">
                        <div className="flex items-baseline justify-between gap-2">
                          <h4 className="font-medium">{r.construction_name}</h4>
                          <span className="text-xs text-muted-foreground font-mono">{r.source.section}</span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{r.description}</p>
                        {r.example?.form && (
                          <div className="mt-3 rounded-md bg-muted/50 px-3 py-2 text-sm">
                            <div className="font-medium">{r.example.form}</div>
                            {r.example.gloss && (
                              <div className="text-xs text-muted-foreground font-mono mt-0.5">
                                {r.example.gloss}
                              </div>
                            )}
                            {r.example.translation && (
                              <div className="text-muted-foreground mt-0.5">
                                &lsquo;{r.example.translation}&rsquo;
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* grambank features by domain */}
        {featureGroups.length > 0 && (
          <section className="mb-10">
            <h2 className="text-lg font-semibold mb-1">Grambank baseline features</h2>
            <p className="text-xs text-muted-foreground mb-4">
              Coded features grouped by domain, each with a plain-English gloss and its recorded value.
            </p>
            <div className="space-y-6">
              {featureGroups.map(([domain, feats]) => (
                <div key={domain}>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    {DOMAIN_LABELS[domain] || domain} <span className="font-normal">({feats.length})</span>
                  </h3>
                  <ul className="space-y-1.5">
                    {feats.map((f) => (
                      <li key={f.id} className="flex gap-3 text-sm">
                        <span className="font-mono text-xs text-muted-foreground w-14 shrink-0 pt-0.5">
                          {f.id}
                        </span>
                        <span className="flex-1">
                          <span>{f.gloss}</span>{' '}
                          <span className="font-medium text-primary whitespace-nowrap">
                            &rarr; {f.value_meaning || f.value}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* extension features */}
        {lang.aus_extension.length > 0 && (
          <section className="mb-10">
            <h2 className="text-lg font-semibold mb-1">Australianist extension</h2>
            <p className="text-xs text-muted-foreground mb-4">
              Finer distinctions the Grambank baseline compresses (coded where derivable from open data).
            </p>
            <ul className="space-y-1.5">
              {lang.aus_extension.map((f) => (
                <li key={f.id} className="flex gap-3 text-sm">
                  <span className="font-mono text-xs text-muted-foreground w-16 shrink-0 pt-0.5">{f.id}</span>
                  <span className="flex-1">
                    <span className="font-medium">{f.name}:</span>{' '}
                    <span className="text-primary font-medium">{f.value}</span>
                    {f.derivation && (
                      <span className="text-xs text-muted-foreground"> · {f.derivation}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <footer className="mt-12 pt-6 border-t border-border text-xs text-muted-foreground leading-relaxed">
          <p>
            Data: raw per-language JSON at{' '}
            <code>/typology/lang/{lang.glottocode}.json</code>. Sources (CC-BY-4.0): Grambank v1.0.3,
            WALS v2020.4, Glottolog 5.3, AIATSIS AUSTLANG. Construction records transcribed from
            reference grammars (analytical facts + short cited examples).
          </p>
        </footer>
      </div>
    </SharedLayout>
  );
}
