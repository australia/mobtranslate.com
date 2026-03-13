import Link from 'next/link';
import SharedLayout from './components/SharedLayout';
import TranslatorWrapper from './components/TranslatorWrapper';
import { Card, CardContent, Badge } from '@mobtranslate/ui';
import { getActiveLanguages, getLanguageStats } from '@/lib/supabase/queries';
import { BookOpen, Globe, Users, ArrowRight, Sparkles, MapPin } from 'lucide-react';

export const revalidate = 3600;

export default async function Page() {
  const [languages, stats] = await Promise.all([
    getActiveLanguages(),
    getLanguageStats(),
  ]);

  const maxWords = Math.max(...Object.values(stats.wordsByLanguage), 1);

  return (
    <SharedLayout>
      {/* Hero Section — flat dark background, no gradients */}
      <section className="relative overflow-hidden -mx-4 sm:-mx-6 lg:-mx-8 xl:-mx-12 2xl:-mx-16 -mt-6 sm:-mt-8 lg:-mt-12">
        <div className="absolute inset-0 bg-[#111110]" />

        <div className="relative px-4 sm:px-6 lg:px-8 xl:px-12 2xl:px-16 pt-20 sm:pt-28 lg:pt-32 pb-16 sm:pb-20 lg:pb-24">
          <div className="max-w-7xl mx-auto">
            {/* Heading */}
            <div className="text-center mb-14 sm:mb-16">
              <p className="text-xs font-medium text-[rgba(255,255,255,0.7)] uppercase tracking-[0.2em] mb-8">
                Open Source Language Learning
              </p>
              <h1 className="text-5xl sm:text-6xl lg:text-8xl font-display font-black text-white mb-6 tracking-tight leading-[0.9]">
                Translate into<br />
                Indigenous Languages
              </h1>
              <p className="text-lg sm:text-xl text-[rgba(255,255,255,0.7)] max-w-2xl mx-auto leading-relaxed">
                The community-driven &lsquo;Google Translate&rsquo; for First Nations languages.
                <br className="hidden sm:block" />
                Powered by AI. Built with respect.
              </p>
            </div>

            {/* Translator Widget */}
            <div className="max-w-3xl mx-auto">
              <TranslatorWrapper languages={languages} />
            </div>

            {/* Quick Action Links */}
            <div className="flex items-center justify-center gap-6 sm:gap-8 mt-8">
              <Link
                href="/education"
                className="inline-flex items-center gap-1.5 text-sm text-[rgba(255,255,255,0.5)] hover:text-white transition-colors"
              >
                Start Learning <ArrowRight className="w-3.5 h-3.5" />
              </Link>
              <span className="w-px h-4 bg-[rgba(255,255,255,0.1)]" />
              <Link
                href="/dictionaries"
                className="inline-flex items-center gap-1.5 text-sm text-[rgba(255,255,255,0.5)] hover:text-white transition-colors"
              >
                Browse Dictionaries <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {/* Stats Bar */}
            <div className="flex flex-wrap items-center justify-center gap-8 sm:gap-16 lg:gap-24 mt-16 sm:mt-20 pt-10 border-t border-[rgba(255,255,255,0.06)]">
              <div className="text-center">
                <div className="text-4xl sm:text-5xl font-display font-black text-white tracking-tight">
                  {stats.totalLanguages}
                </div>
                <div className="text-xs uppercase tracking-[0.15em] text-[rgba(255,255,255,0.7)] mt-2 font-medium">Languages</div>
              </div>
              <div className="hidden sm:block w-px h-12 bg-[rgba(255,255,255,0.06)]" />
              <div className="text-center">
                <div className="text-4xl sm:text-5xl font-display font-black text-white tracking-tight">
                  {stats.totalWords.toLocaleString()}+
                </div>
                <div className="text-xs uppercase tracking-[0.15em] text-[rgba(255,255,255,0.7)] mt-2 font-medium">Words</div>
              </div>
              <div className="hidden sm:block w-px h-12 bg-[rgba(255,255,255,0.06)]" />
              <div className="text-center">
                <div className="text-4xl sm:text-5xl font-display font-black text-white tracking-tight">100%</div>
                <div className="text-xs uppercase tracking-[0.15em] text-[rgba(255,255,255,0.7)] mt-2 font-medium">Open Source</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Dictionary Cards */}
      <section className="py-20 sm:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-display font-bold tracking-tight mb-3">
              Explore Dictionaries
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Browse our growing collection of Indigenous language dictionaries, each built with community input and linguistic expertise.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {languages.map((language) => {
              const wordCount = stats.wordsByLanguage[language.code] || 0;
              const progressPercent = Math.min((wordCount / maxWords) * 100, 100);

              return (
                <Link
                  key={language.id}
                  href={`/dictionaries/${language.code}`}
                  className="group block no-underline"
                >
                  <Card className="h-full transition-all duration-300 hover:shadow-lg hover:-translate-y-1 border-t-4 border-t-primary/40 hover:border-t-primary">
                    <CardContent className="p-6">
                      <h3 className="text-xl font-display font-bold mb-1 group-hover:text-primary transition-colors">
                        {language.name}
                      </h3>
                      {language.region && (
                        <div className="flex items-center gap-1.5 mb-3">
                          <MapPin className="w-3 h-3 text-muted-foreground" aria-hidden="true" />
                          <p className="text-xs text-muted-foreground">{language.region}</p>
                        </div>
                      )}
                      <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                        {language.description || `Explore the language of the ${language.name} people`}
                      </p>

                      <div className="mb-4">
                        <div className="flex items-center gap-2 mb-1.5">
                          <BookOpen className="w-4 h-4 text-primary" aria-hidden="true" />
                          <span className="text-sm font-semibold">{wordCount.toLocaleString()} words</span>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary/70 rounded-full transition-all duration-500"
                            style={{ width: `${progressPercent}%` }}
                          />
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 text-xs">
                        {language.family && (
                          <Badge variant="outline">{language.family}</Badge>
                        )}
                        {language.status && (
                          <Badge
                            variant="secondary"
                          >
                            {language.status}
                          </Badge>
                        )}
                      </div>

                      <div className="mt-4 flex items-center gap-1 text-sm text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                        Explore <ArrowRight className="w-3 h-3" />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-16 sm:py-20 bg-muted/30 dark:bg-muted/50 -mx-4 sm:-mx-6 lg:-mx-8 xl:-mx-12 2xl:-mx-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-display font-bold tracking-tight mb-3">
              How It Works
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Built on open data and AI, with deep respect for language custodians.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Globe className="w-7 h-7 text-primary" aria-hidden="true" />
              </div>
              <h3 className="text-lg font-bold mb-2">Community Dictionaries</h3>
              <p className="text-sm text-muted-foreground">
                Word lists curated with Indigenous language speakers and linguists, capturing authentic pronunciation and meaning.
              </p>
            </div>
            <div className="text-center">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Sparkles className="w-7 h-7 text-primary" aria-hidden="true" />
              </div>
              <h3 className="text-lg font-bold mb-2">AI Translation</h3>
              <p className="text-sm text-muted-foreground">
                Powered by large language models trained on our dictionaries, providing contextual translations with cultural notes.
              </p>
            </div>
            <div className="text-center">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Users className="w-7 h-7 text-primary" aria-hidden="true" />
              </div>
              <h3 className="text-lg font-bold mb-2">Open Source</h3>
              <p className="text-sm text-muted-foreground">
                Every line of code, every dictionary entry is open. Built by the community, for the community. Forever free.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Share Your Language Knowledge */}
      <section className="py-16 sm:py-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl sm:text-3xl font-display font-bold tracking-tight mb-3">
            Share Your Language Knowledge
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto mb-6">
            Are you a speaker or knowledge holder of an Indigenous language? Help preserve your language for future generations.
          </p>
          <Link
            href="/about"
            className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
          >
            Learn How to Contribute <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* CTA — flat dark background, no gradients */}
      <section className="relative overflow-hidden -mx-4 sm:-mx-6 lg:-mx-8 xl:-mx-12 2xl:-mx-16">
        <div className="absolute inset-0 bg-[#111110]" />
        <div className="relative px-4 sm:px-6 lg:px-8 xl:px-12 2xl:px-16 py-20 sm:py-24">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl sm:text-4xl font-display font-bold text-white mb-4 leading-snug">
              Start Learning Today
            </h2>
            <p className="text-[rgba(255,255,255,0.7)] mb-10 max-w-xl mx-auto">
              Pick a language and start building your vocabulary.
            </p>
            <div className="flex flex-wrap gap-4 justify-center">
              <Link href="/dictionaries" className="inline-flex items-center gap-2 px-6 py-3 bg-white text-gray-900 font-semibold rounded-lg hover:bg-[rgba(255,255,255,0.9)] transition-colors">
                Browse Dictionaries
              </Link>
              <Link
                href="/education"
                className="inline-flex items-center gap-2 px-6 py-3 border border-[rgba(255,255,255,0.15)] text-white font-semibold rounded-lg hover:bg-[rgba(255,255,255,0.08)] transition-colors"
              >
                Start Learning
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
