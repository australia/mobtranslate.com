import Link from 'next/link';
import SharedLayout from './components/SharedLayout';
import TranslateHero from './components/TranslateHero';
import { Badge } from '@mobtranslate/ui';
import { getActiveLanguages, getLanguageStats } from '@/lib/db/queries';
import { ArrowRight, ArrowUpRight } from 'lucide-react';

export const revalidate = 3600;

const HOW_IT_WORKS = [
  {
    title: 'Source-attributed dictionaries',
    body: 'Entries are assembled from named dictionaries, grammars, archives, recordings, and contributions. Source and review state are shown where the record supports them.',
  },
  {
    title: 'Translation, flagged honestly',
    body: 'Dictionary evidence can guide contextual translation, but generated text remains an unverified research draft. Machine output is never presented as an authoritative source.',
  },
  {
    title: 'Open code, visible terms',
    body: 'The application code is MIT-licensed and can be self-hosted. Language data and model weights retain their own source-specific and upstream terms.',
  },
];

export default async function Page() {
  const [languages, stats] = await Promise.all([
    getActiveLanguages(),
    getLanguageStats(),
  ]);

  const maxWords = Math.max(...Object.values(stats.wordsByLanguage), 1);

  const siteJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Mob Translate',
    url: 'https://mobtranslate.com',
    description:
      'Open-source dictionaries, translation and pronunciation for Australian First Nations languages.',
    publisher: {
      '@type': 'Organization',
      name: 'Mob Translate',
      url: 'https://mobtranslate.com',
      logo: 'https://mobtranslate.com/icons/icon-512.png',
    },
  };

  return (
    <SharedLayout>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(siteJsonLd) }}
      />
      {/* Hero — deep ochre-earth ground, language foregrounded */}
      <section className="marketing relative overflow-hidden -mx-4 sm:-mx-6 lg:-mx-8 xl:-mx-12 2xl:-mx-16 -mt-6 sm:-mt-8 lg:-mt-12 bg-[#33180c] text-[#faf8f5]">
        <div className="relative px-4 sm:px-6 lg:px-8 xl:px-12 2xl:px-16 pt-20 sm:pt-28 lg:pt-32 pb-16 sm:pb-20 lg:pb-24">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12 sm:mb-14">
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-[#ecb485] mb-7">
                Open code · attributed sources
              </p>
              <h1 className="font-display font-bold text-[#faf8f5] mb-6 tracking-[-0.025em] leading-[0.95] text-5xl sm:text-6xl lg:text-7xl">
                Translate into
                <br />
                <span className="text-[#ecb485]">Indigenous languages</span>
              </h1>
              <p className="text-lg sm:text-xl text-[#faf8f5]/70 max-w-2xl mx-auto leading-relaxed">
                An independent dictionary, translator, and learning project built from attributed
                language resources and contributions. Machine translations are unverified drafts.
              </p>
            </div>

            {/* Translator — Google-Translate two-pane with a Chat toggle */}
            <TranslateHero languages={languages} />

            {/* Quick links */}
            <div className="flex items-center justify-center gap-6 sm:gap-8 mt-8">
              <Link
                href="/education"
                className="inline-flex items-center gap-1.5 text-sm text-[#faf8f5]/60 hover:text-[#faf8f5] transition-colors"
              >
                Start learning <ArrowRight className="w-3.5 h-3.5" />
              </Link>
              <span className="w-px h-4 bg-[#faf8f5]/15" />
              <Link
                href="/dictionaries"
                className="inline-flex items-center gap-1.5 text-sm text-[#faf8f5]/60 hover:text-[#faf8f5] transition-colors"
              >
                Browse dictionaries <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {/* Scope, stated as a sentence — not a SaaS metric counter */}
            <p className="mt-16 sm:mt-20 pt-8 border-t border-[#faf8f5]/10 text-center text-sm sm:text-base text-[#faf8f5]/55 leading-relaxed max-w-2xl mx-auto">
              {stats.totalLanguages} languages, {stats.totalWords.toLocaleString()} entries, and
              source and review information shown wherever the underlying record provides it.
            </p>
          </div>
        </div>
      </section>

      {/* Dictionary index — a legitimate browse affordance (DESIGN §4.3) */}
      <section className="marketing py-20 sm:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mb-12">
            <h2 className="text-3xl sm:text-4xl font-display font-bold tracking-tight mb-3">
              Explore the dictionaries
            </h2>
            <p className="text-muted-foreground text-lg">
              A growing collection, each one carrying the accent of its own country.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {languages.map((language) => {
              const wordCount = stats.wordsByLanguage[language.code] || 0;
              const progressPercent = Math.min((wordCount / maxWords) * 100, 100);

              return (
                <Link
                  key={language.id}
                  href={`/dictionaries/${language.code}`}
                  data-language={language.code}
                  className="group block no-underline rounded-xl border border-border bg-card p-6 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-[var(--lang-accent)]"
                >
                  <h3 className="text-xl font-display font-semibold mb-1 transition-colors group-hover:text-[var(--lang-accent)]">
                    {language.name}
                  </h3>
                  {language.region && (
                    <p className="text-xs text-muted-foreground mb-3">{language.region}</p>
                  )}
                  <p className="text-sm text-muted-foreground mb-5 line-clamp-2 leading-relaxed">
                    {language.description || `The language of the ${language.name} people.`}
                  </p>

                  <div className="mb-4">
                    <div className="flex items-baseline justify-between mb-1.5">
                      <span className="text-sm font-semibold text-foreground">
                        {wordCount.toLocaleString()} words
                      </span>
                    </div>
                    <div className="h-1 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[var(--lang-accent)] transition-all duration-500"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {language.family && <Badge variant="outline">{language.family}</Badge>}
                    {language.status && <Badge variant="secondary">{language.status}</Badge>}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* How it works — editorial, numbered. No icon-card template (migration #2) */}
      <section className="marketing py-16 sm:py-20 bg-muted/30 dark:bg-muted/40 -mx-4 sm:-mx-6 lg:-mx-8 xl:-mx-12 2xl:-mx-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mb-12">
            <h2 className="text-3xl sm:text-4xl font-display font-bold tracking-tight mb-3">
              How it works
            </h2>
            <p className="text-muted-foreground text-lg">
              Built from attributed language resources, with terms and uncertainty kept visible.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-10 gap-y-12">
            {HOW_IT_WORKS.map((step, i) => (
              <div key={step.title}>
                <div className="font-display text-5xl font-bold text-primary/80 mb-4 tabular-nums">
                  {String(i + 1).padStart(2, '0')}
                </div>
                <h3 className="text-lg font-semibold mb-2">{step.title}</h3>
                <p className="text-[15px] text-muted-foreground leading-relaxed max-w-[34ch]">
                  {step.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Contribute */}
      <section className="marketing py-16 sm:py-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl sm:text-3xl font-display font-bold tracking-tight mb-3">
            Share your language knowledge
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto mb-6">
            Are you a speaker or knowledge holder of an Indigenous language? Help keep it living
            for the generations coming up.
          </p>
          <Link
            href="/about"
            className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary-hover transition-colors"
          >
            Learn how to contribute <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* CTA — same warm ground as the hero, bookending the page */}
      <section className="marketing relative -mx-4 sm:-mx-6 lg:-mx-8 xl:-mx-12 2xl:-mx-16 bg-[#33180c] text-[#faf8f5]">
        <div className="px-4 sm:px-6 lg:px-8 xl:px-12 2xl:px-16 py-20 sm:py-24">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl sm:text-4xl font-display font-bold text-[#faf8f5] mb-4 leading-snug">
              Start learning today
            </h2>
            <p className="text-[#faf8f5]/70 mb-10 max-w-xl mx-auto">
              Pick a language and start building your vocabulary, a few words at a time.
            </p>
            <div className="flex flex-wrap gap-4 justify-center">
              <Link
                href="/education"
                className="inline-flex items-center gap-2 px-6 py-3 bg-[#ecb485] text-[#33180c] font-semibold rounded-lg hover:bg-[#f4d2b5] transition-colors"
              >
                Start learning <ArrowUpRight className="w-4 h-4" />
              </Link>
              <Link
                href="/dictionaries"
                className="inline-flex items-center gap-2 px-6 py-3 border border-[#faf8f5]/20 text-[#faf8f5] font-semibold rounded-lg hover:bg-[#faf8f5]/10 transition-colors"
              >
                Browse dictionaries
              </Link>
            </div>
          </div>
        </div>
      </section>
    </SharedLayout>
  );
}

export async function generateMetadata() {
  return {
    title: 'Mob Translate - Indigenous Language Translation',
    description: 'A community-driven project to create translation tools for Indigenous languages worldwide, making language learning and exploration accessible to all.',
    openGraph: {
      title: 'Mob Translate - Indigenous Language Translation',
      description: 'A community-driven project to create translation tools for Indigenous languages worldwide.',
      type: 'website',
    },
  };
}
