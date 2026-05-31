import React from 'react';
import Link from 'next/link';
import SharedLayout from '../components/SharedLayout';
import { Badge } from '@mobtranslate/ui';
import { getActiveLanguages, getLanguageStats } from '@/lib/supabase/queries';
import { ArrowRight } from 'lucide-react';

export const revalidate = 3600;

export default async function DictionariesPage() {
  const [languages, stats] = await Promise.all([
    getActiveLanguages(),
    getLanguageStats(),
  ]);

  const maxWords = Math.max(...Object.values(stats.wordsByLanguage), 1);

  return (
    <SharedLayout>
      {/* Header */}
      <div className="marketing py-10 md:py-14 max-w-3xl">
        <h1 className="text-3xl md:text-4xl lg:text-5xl font-display font-bold tracking-[-0.02em] mb-4">
          Dictionaries
        </h1>
        <p className="text-muted-foreground text-base md:text-lg leading-relaxed">
          A growing collection of Indigenous language dictionaries, each built with community
          input and carrying the accent of its own country. {stats.totalLanguages} languages,{' '}
          {stats.totalWords.toLocaleString()} entries and counting.
        </p>
      </div>

      {/* Dictionary cards — per-language accent, no side-stripes */}
      <div className="grid gap-5 sm:grid-cols-2 pb-16">
        {languages.map((lang) => {
          const wordCount = stats.wordsByLanguage[lang.code] || 0;
          const fillPercent = maxWords > 0 ? (wordCount / maxWords) * 100 : 0;

          return (
            <Link
              key={lang.code}
              href={`/dictionaries/${lang.code}`}
              data-language={lang.code}
              className="group block no-underline rounded-xl border border-border bg-card p-6 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-[var(--lang-accent)]"
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h2 className="text-2xl font-display font-semibold transition-colors group-hover:text-[var(--lang-accent)]">
                    {lang.name}
                  </h2>
                  {lang.region && (
                    <p className="text-sm text-muted-foreground mt-1">{lang.region}</p>
                  )}
                </div>
                <ArrowRight className="w-5 h-5 text-[var(--lang-accent)] opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200 mt-1.5" />
              </div>

              <p className="text-sm text-muted-foreground mb-5 line-clamp-2 leading-relaxed">
                {lang.description || `The language of the ${lang.name} people.`}
              </p>

              <div className="mb-4">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-semibold">{wordCount.toLocaleString()} words</span>
                  <span className="text-xs text-muted-foreground tabular-nums">{Math.round(fillPercent)}%</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[var(--lang-accent)] transition-all duration-700 ease-out"
                    style={{ width: `${Math.max(fillPercent, 3)}%` }}
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {lang.family && <Badge variant="outline">{lang.family}</Badge>}
                {lang.status && <Badge variant="secondary">{lang.status}</Badge>}
              </div>
            </Link>
          );
        })}
      </div>

      {/* About — editorial, two columns, no icon-card chrome */}
      <section className="marketing border-t border-border py-12 md:py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-16 max-w-4xl">
          <div>
            <h3 className="text-xl font-display font-semibold mb-3">Built with community</h3>
            <p className="text-muted-foreground leading-relaxed">
              Each dictionary is built with community input, making it easy to explore and learn
              Indigenous languages online, with the language treated as the subject, not the artifact.
            </p>
          </div>
          <div>
            <h3 className="text-xl font-display font-semibold mb-3">Owned by the community</h3>
            <p className="text-muted-foreground leading-relaxed">
              Dictionaries are created in collaboration with Indigenous communities and linguists.
              We welcome contributors who want to help these resources grow.
            </p>
          </div>
        </div>
      </section>
    </SharedLayout>
  );
}

export async function generateMetadata() {
  return {
    title: 'Indigenous Language Dictionaries - MobTranslate',
    description: 'Browse our collection of Indigenous language dictionaries from around the world. Explore and learn traditional languages online.',
    openGraph: {
      title: 'Indigenous Language Dictionaries',
      description: 'Explore dictionaries for Indigenous languages including Kuku Yalanji, Mi\'gmaq, and Anindilyakwa.',
      type: 'website',
    },
  };
}
