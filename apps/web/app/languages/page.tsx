import React from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import SharedLayout from '../components/SharedLayout';
import { Badge } from '@mobtranslate/ui';
import { getTypologyIndex } from '@/lib/typology';
import { BookOpen, MapPin } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Languages — grammatical knowledge — MobTranslate',
  description:
    'A grammatical-knowledge layer over Australian Aboriginal & Torres Strait Islander languages: ' +
    'Grambank baseline features, an Australianist extension catalog, construction records and ' +
    'grambank_recorded_agreement between languages. Built on open (CC-BY-4.0) sources.',
};

export const dynamic = 'force-static';

export default function LanguagesIndexPage() {
  const langs = getTypologyIndex();
  const withGrambank = langs.filter((l) => l.grambank_coded > 0).length;
  const withConstructions = langs.filter((l) => l.n_constructions > 0);

  // group by family (Pama-Nyungan dominates; others grouped)
  const byFamily = new Map<string, typeof langs>();
  for (const l of langs) {
    const fam = l.family || 'Unclassified / isolate';
    if (!byFamily.has(fam)) byFamily.set(fam, []);
    byFamily.get(fam)!.push(l);
  }
  const families = [...byFamily.entries()].sort((a, b) => b[1].length - a[1].length);

  return (
    <SharedLayout>
      <div className="max-w-4xl mx-auto py-8 md:py-12">
        <header className="mb-8">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary mb-2">
            Grammatical knowledge
          </p>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Languages</h1>
          <p className="text-muted-foreground mt-3 leading-relaxed max-w-2xl">
            A layered grammatical-knowledge model over Australian languages. The baseline is
            Grambank&mdash;a <strong>standardized cross-linguistic set of 195 features</strong>, not an
            exhaustive grammar&mdash;supplemented by WALS, an Australianist extension catalog, and
            construction records transcribed from reference grammars. Everything is built on
            open <span className="whitespace-nowrap">(CC-BY-4.0)</span> data and each feature carries a
            plain-English gloss.
          </p>
          <div className="flex flex-wrap gap-2 mt-4 text-sm">
            <Badge variant="secondary">{langs.length} languoids</Badge>
            <Badge variant="secondary">{withGrambank} with Grambank data</Badge>
            <Badge variant="secondary">{withConstructions.length} with construction records</Badge>
          </div>
        </header>

        {withConstructions.length > 0 && (
          <section className="mb-8 rounded-xl border border-border bg-card p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <BookOpen className="h-4 w-4 text-primary" /> Construction records
            </h2>
            <div className="flex flex-wrap gap-2">
              {withConstructions.map((l) => (
                <Link
                  key={l.glottocode}
                  href={`/languages/${l.glottocode}`}
                  className="no-underline text-sm rounded-lg border border-border px-3 py-1.5 hover:border-primary transition-colors"
                >
                  {l.name} <span className="text-muted-foreground">· {l.n_constructions}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        <div className="space-y-8">
          {families.map(([family, items]) => (
            <section key={family}>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground mb-1">
                {family}
              </h2>
              <p className="text-xs text-muted-foreground mb-3">{items.length} languoids</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {items
                  .slice()
                  .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                  .map((l) => (
                    <Link
                      key={l.glottocode}
                      href={`/languages/${l.glottocode}`}
                      className="group no-underline rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:border-primary"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-medium group-hover:text-primary transition-colors">
                          {l.name || l.glottocode}
                        </span>
                        <span className="text-xs text-muted-foreground font-mono">{l.glottocode}</span>
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs text-muted-foreground">
                        {l.subgroup && <span>{l.subgroup}</span>}
                        {l.grambank_coded > 0 && <span>{l.grambank_coded} Grambank features</span>}
                        {l.has_dictionary && (
                          <span className="text-primary inline-flex items-center gap-0.5">
                            <BookOpen className="h-3 w-3" /> dictionary
                          </span>
                        )}
                      </div>
                    </Link>
                  ))}
              </div>
            </section>
          ))}
        </div>

        <footer className="mt-12 pt-6 border-t border-border text-xs text-muted-foreground leading-relaxed">
          <p>
            Sources (all CC-BY-4.0): Grambank v1.0.3, WALS Online v2020.4, Glottolog 5.3, AIATSIS
            AUSTLANG. Similarity between languages is reported as{' '}
            <em>grambank_recorded_agreement</em> over jointly-coded Grambank features only
            (n_joint&nbsp;&ge;&nbsp;30) &mdash; agreement over recorded codings, not a claim of overall
            grammatical similarity.
          </p>
        </footer>
      </div>
    </SharedLayout>
  );
}
