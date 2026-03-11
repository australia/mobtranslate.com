import Link from 'next/link';
import SharedLayout from './components/SharedLayout';
import TranslatorWrapper from './components/TranslatorWrapper';
import { Card, CardContent, Badge } from '@mobtranslate/ui';
import { getActiveLanguages, getLanguageStats } from '@/lib/supabase/queries';
import { BookOpen, Globe, Users, ArrowRight, Heart, Sparkles } from 'lucide-react';

export const revalidate = 3600;

export default async function Page() {
  const [languages, stats] = await Promise.all([
    getActiveLanguages(),
    getLanguageStats(),
  ]);

  return (
    <SharedLayout>
      {/* Hero Section */}
      <section className="relative overflow-hidden -mx-4 sm:-mx-6 lg:-mx-8 xl:-mx-12 2xl:-mx-16 -mt-6 sm:-mt-8 lg:-mt-12">
        <div className="absolute inset-0 bg-gray-950" />

        <div className="relative px-4 sm:px-6 lg:px-8 xl:px-12 2xl:px-16 py-16 sm:py-20 lg:py-24">
          <div className="max-w-7xl mx-auto">
            {/* Heading */}
            <div className="text-center mb-12">
              <p className="text-sm font-medium text-white/60 uppercase tracking-widest mb-6">
                Open Source Language Preservation
              </p>
              <h1 className="text-4xl sm:text-5xl lg:text-7xl font-display font-black text-white mb-5 tracking-tight">
                Translate into<br />
                Indigenous Languages
              </h1>
              <p className="text-lg sm:text-xl text-white/70 max-w-2xl mx-auto leading-relaxed">
                The community-driven &lsquo;Google Translate&rsquo; for First Nations languages.
                Powered by AI. Built with respect.
              </p>
            </div>

            {/* Translator Widget */}
            <div className="max-w-3xl mx-auto">
              <TranslatorWrapper languages={languages} />
            </div>

            {/* Stats Bar */}
            <div className="flex flex-wrap items-center justify-center gap-10 sm:gap-16 mt-14 pt-8 border-t border-white/10">
              <div className="text-center">
                <div className="text-3xl sm:text-4xl font-display font-black text-white">{stats.totalLanguages}</div>
                <div className="text-sm text-white/60 mt-1">Languages</div>
              </div>
              <div className="text-center">
                <div className="text-3xl sm:text-4xl font-display font-black text-white">{stats.totalWords.toLocaleString()}+</div>
                <div className="text-sm text-white/60 mt-1">Words</div>
              </div>
              <div className="text-center">
                <div className="text-3xl sm:text-4xl font-display font-black text-white">100%</div>
                <div className="text-sm text-white/60 mt-1">Open Source</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Dictionary Cards */}
      <section className="py-16 sm:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
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

              return (
                <Link
                  key={language.id}
                  href={`/dictionaries/${language.code}`}
                  className="group block no-underline"
                >
                  <Card className="h-full transition-all duration-300 hover:shadow-xl hover:-translate-y-1 border-t-4 border-t-primary/60">
                    <CardContent className="p-6">
                      <h3 className="text-xl font-display font-bold mb-1 group-hover:text-primary transition-colors">
                        {language.name}
                      </h3>
                      {language.region && (
                        <p className="text-xs text-muted-foreground mb-3">{language.region}</p>
                      )}
                      <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                        {language.description || `Explore the language of the ${language.name} people`}
                      </p>

                      {/* Word count - prominent */}
                      <div className="flex items-center gap-2 mb-3">
                        <BookOpen className="w-4 h-4 text-primary" />
                        <span className="text-sm font-semibold">{wordCount.toLocaleString()} words</span>
                      </div>

                      <div className="flex flex-wrap gap-2 text-xs">
                        {language.family && (
                          <Badge variant="outline">{language.family}</Badge>
                        )}
                        {language.status && (
                          <Badge
                            variant={
                              language.status === 'severely endangered' ? 'destructive' :
                              language.status === 'endangered' ? 'destructive' :
                              'secondary'
                            }
                          >
                            {language.status}
                          </Badge>
                        )}
                      </div>

                      {/* Explore arrow */}
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
                <Globe className="w-7 h-7 text-primary" />
              </div>
              <h3 className="text-lg font-bold mb-2">Community Dictionaries</h3>
              <p className="text-sm text-muted-foreground">
                Word lists curated with Indigenous language speakers and linguists, preserving authentic pronunciation and meaning.
              </p>
            </div>
            <div className="text-center">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Sparkles className="w-7 h-7 text-primary" />
              </div>
              <h3 className="text-lg font-bold mb-2">AI Translation</h3>
              <p className="text-sm text-muted-foreground">
                Powered by large language models trained on our dictionaries, providing contextual translations with cultural notes.
              </p>
            </div>
            <div className="text-center">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Users className="w-7 h-7 text-primary" />
              </div>
              <h3 className="text-lg font-bold mb-2">Open Source</h3>
              <p className="text-sm text-muted-foreground">
                Every line of code, every dictionary entry is open. Built by the community, for the community. Forever free.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative overflow-hidden -mx-4 sm:-mx-6 lg:-mx-8 xl:-mx-12 2xl:-mx-16">
        <div className="absolute inset-0 bg-gray-950" />
        <div className="relative px-4 sm:px-6 lg:px-8 xl:px-12 2xl:px-16 py-20 sm:py-24">
          <div className="max-w-3xl mx-auto text-center">
            <Heart className="w-10 h-10 text-rose-400 mx-auto mb-6" />
            <blockquote className="text-2xl sm:text-3xl font-display font-bold text-white mb-6 leading-snug">
              &ldquo;When a language dies, a way of understanding the world is lost forever.&rdquo;
            </blockquote>
            <p className="text-white/60 mb-10 max-w-xl mx-auto">
              Every word we preserve keeps a culture alive. Join us in building
              the tools that give Indigenous languages a digital future.
            </p>
            <div className="flex flex-wrap gap-4 justify-center">
              <Link href="/about" className="inline-flex items-center gap-2 px-6 py-3 bg-white text-gray-900 font-semibold rounded-lg hover:bg-white/90 transition-colors">
                Learn More
              </Link>
              <Link
                href="https://github.com/australia/mobtranslate.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3 border border-white/20 text-white font-semibold rounded-lg hover:bg-white/10 transition-colors"
              >
                Contribute on GitHub
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
    description: 'A community-driven project to create translation tools for Indigenous languages worldwide, making language preservation and learning accessible to all.',
    openGraph: {
      title: 'Mob Translate - Indigenous Language Translation',
      description: 'A community-driven project to create translation tools for Indigenous languages worldwide.',
      type: 'website',
    },
  };
}
