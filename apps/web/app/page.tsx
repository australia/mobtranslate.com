import Link from 'next/link';
import SharedLayout from './components/SharedLayout';
import TranslatorWrapper from './components/TranslatorWrapper';
import { Card, CardContent, Badge } from '@mobtranslate/ui';
import { getActiveLanguages, getLanguageStats } from '@/lib/supabase/queries';
import { BookOpen, Globe, Users, ArrowRight, Heart, Sparkles, ChevronDown, MapPin, Languages } from 'lucide-react';

export const revalidate = 3600;

export default async function Page() {
  const [languages, stats] = await Promise.all([
    getActiveLanguages(),
    getLanguageStats(),
  ]);

  const maxWords = Math.max(...Object.values(stats.wordsByLanguage), 1);

  return (
    <SharedLayout>
      {/* Hero Section */}
      <section className="relative overflow-hidden -mx-4 sm:-mx-6 lg:-mx-8 xl:-mx-12 2xl:-mx-16 -mt-6 sm:-mt-8 lg:-mt-12">
        {/* Rich gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-stone-950 to-amber-950/90" />

        {/* Animated dot pattern overlay */}
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.8) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
        />

        {/* Warm radial glow behind translator */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/3 w-[800px] h-[600px] bg-amber-900/20 rounded-full blur-3xl" />

        <div className="relative px-4 sm:px-6 lg:px-8 xl:px-12 2xl:px-16 pt-20 sm:pt-28 lg:pt-32 pb-16 sm:pb-20 lg:pb-24">
          <div className="max-w-7xl mx-auto">
            {/* Heading */}
            <div className="text-center mb-14 sm:mb-16">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-amber-700/30 bg-amber-900/20 text-amber-300/80 text-xs font-semibold uppercase tracking-[0.2em] mb-8">
                <Languages className="w-3.5 h-3.5" />
                Open Source Language Preservation
              </div>
              <h1 className="text-5xl sm:text-6xl lg:text-8xl font-display font-black text-white mb-6 tracking-tight leading-[0.9]">
                Translate into<br />
                <span className="bg-gradient-to-r from-amber-200 via-orange-200 to-amber-300 bg-clip-text text-transparent">
                  Indigenous Languages
                </span>
              </h1>
              <p className="text-lg sm:text-xl text-[rgba(255,255,255,0.6)] max-w-2xl mx-auto leading-relaxed">
                The community-driven &lsquo;Google Translate&rsquo; for First Nations languages.
                <br className="hidden sm:block" />
                Powered by AI. Built with respect.
              </p>
            </div>

            {/* Translator Widget with glow */}
            <div className="max-w-3xl mx-auto relative">
              {/* Glow ring behind widget */}
              <div className="absolute -inset-4 bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-amber-500/10 rounded-3xl blur-xl" />
              <div className="relative">
                <TranslatorWrapper languages={languages} />
              </div>
            </div>

            {/* Stats Bar */}
            <div className="flex flex-wrap items-center justify-center gap-8 sm:gap-16 lg:gap-24 mt-16 sm:mt-20 pt-10 border-t border-[rgba(255,255,255,0.08)]">
              <div className="text-center group">
                <div className="text-4xl sm:text-5xl font-display font-black text-white tracking-tight">
                  {stats.totalLanguages}
                </div>
                <div className="text-xs uppercase tracking-[0.15em] text-amber-400/60 mt-2 font-medium">Languages</div>
              </div>
              <div className="hidden sm:block w-px h-12 bg-[rgba(255,255,255,0.08)]" />
              <div className="text-center group">
                <div className="text-4xl sm:text-5xl font-display font-black text-white tracking-tight">
                  {stats.totalWords.toLocaleString()}+
                </div>
                <div className="text-xs uppercase tracking-[0.15em] text-amber-400/60 mt-2 font-medium">Words Preserved</div>
              </div>
              <div className="hidden sm:block w-px h-12 bg-[rgba(255,255,255,0.08)]" />
              <div className="text-center group">
                <div className="text-4xl sm:text-5xl font-display font-black text-white tracking-tight">100%</div>
                <div className="text-xs uppercase tracking-[0.15em] text-amber-400/60 mt-2 font-medium">Open Source</div>
              </div>
            </div>

            {/* Scroll Indicator */}
            <div className="flex justify-center mt-12 sm:mt-16 animate-bounce">
              <ChevronDown className="w-6 h-6 text-[rgba(255,255,255,0.25)]" />
            </div>
          </div>
        </div>
      </section>

      {/* Dictionary Cards Section */}
      <section className="py-20 sm:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Section heading with decorative line */}
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-display font-bold tracking-tight mb-4">
              Explore Dictionaries
            </h2>
            <div className="flex items-center justify-center gap-3 mb-5">
              <div className="h-px w-12 bg-gradient-to-r from-transparent to-amber-500/50" />
              <div className="w-2 h-2 rounded-full bg-amber-500/60" />
              <div className="h-px w-12 bg-gradient-to-l from-transparent to-amber-500/50" />
            </div>
            <p className="text-muted-foreground max-w-2xl mx-auto text-base sm:text-lg">
              Browse our growing collection of Indigenous language dictionaries, each built with community input and linguistic expertise.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-7">
            {languages.map((language) => {
              const wordCount = stats.wordsByLanguage[language.code] || 0;
              const progressPercent = Math.min((wordCount / maxWords) * 100, 100);

              return (
                <Link
                  key={language.id}
                  href={`/dictionaries/${language.code}`}
                  className="group block no-underline"
                >
                  <Card className="h-full transition-all duration-500 hover:shadow-2xl hover:shadow-amber-900/10 hover:-translate-y-2 border-l-4 border-l-transparent hover:border-l-amber-500 relative overflow-hidden">
                    {/* Hover gradient overlay */}
                    <div className="absolute inset-0 bg-gradient-to-br from-amber-50/0 to-orange-50/0 group-hover:from-amber-50/50 group-hover:to-orange-50/30 dark:group-hover:from-amber-950/20 dark:group-hover:to-orange-950/10 transition-all duration-500" />
                    <CardContent className="p-6 relative">
                      <div className="flex items-start justify-between mb-2">
                        <h3 className="text-xl font-display font-bold group-hover:text-amber-700 dark:group-hover:text-amber-400 transition-colors duration-300">
                          {language.name}
                        </h3>
                        <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all duration-300 mt-1.5" />
                      </div>

                      {language.region && (
                        <div className="flex items-center gap-1.5 mb-3">
                          <MapPin className="w-3 h-3 text-muted-foreground" />
                          <p className="text-xs text-muted-foreground">{language.region}</p>
                        </div>
                      )}

                      {/* Word count with progress bar */}
                      <div className="mb-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-1.5">
                            <BookOpen className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                            <span className="text-sm font-bold">{wordCount.toLocaleString()}</span>
                            <span className="text-xs text-muted-foreground">words</span>
                          </div>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-amber-500 to-orange-400 rounded-full transition-all duration-700"
                            style={{ width: `${progressPercent}%` }}
                          />
                        </div>
                      </div>

                      {/* Badges */}
                      <div className="flex flex-wrap gap-1.5">
                        {language.family && (
                          <Badge variant="outline" className="text-[10px] px-2 py-0.5 border-amber-300/40 text-amber-700 dark:text-amber-400 dark:border-amber-700/40">
                            {language.family}
                          </Badge>
                        )}
                        {language.status && (
                          <Badge
                            variant={
                              language.status === 'severely endangered' ? 'destructive' :
                              language.status === 'endangered' ? 'destructive' :
                              'secondary'
                            }
                            className="text-[10px] px-2 py-0.5"
                          >
                            {language.status}
                          </Badge>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-20 sm:py-28 bg-muted/30 dark:bg-muted/50 -mx-4 sm:-mx-6 lg:-mx-8 xl:-mx-12 2xl:-mx-16 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16 sm:mb-20">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-display font-bold tracking-tight mb-4">
              How It Works
            </h2>
            <div className="flex items-center justify-center gap-3 mb-5">
              <div className="h-px w-12 bg-gradient-to-r from-transparent to-amber-500/50" />
              <div className="w-2 h-2 rounded-full bg-amber-500/60" />
              <div className="h-px w-12 bg-gradient-to-l from-transparent to-amber-500/50" />
            </div>
            <p className="text-muted-foreground max-w-2xl mx-auto text-base sm:text-lg">
              Built on open data and AI, with deep respect for language custodians.
            </p>
          </div>

          <div className="relative grid grid-cols-1 md:grid-cols-3 gap-12 md:gap-8 lg:gap-12">
            {/* Connecting line on desktop */}
            <div className="hidden md:block absolute top-16 left-[20%] right-[20%] h-px border-t-2 border-dashed border-amber-300/30 dark:border-amber-700/30" />

            {/* Step 1 */}
            <div className="text-center relative">
              <div className="relative inline-flex mb-6">
                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-gradient-to-br from-amber-100 to-orange-100 dark:from-amber-900/40 dark:to-orange-900/30 flex items-center justify-center shadow-lg shadow-amber-500/10">
                  <Globe className="w-9 h-9 sm:w-10 sm:h-10 text-amber-700 dark:text-amber-400" />
                </div>
                <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-amber-600 text-white text-xs font-bold flex items-center justify-center shadow-md">
                  01
                </div>
              </div>
              <h3 className="text-xl font-display font-bold mb-3">Community Dictionaries</h3>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">
                Word lists curated with Indigenous language speakers and linguists, preserving authentic pronunciation and meaning.
              </p>
            </div>

            {/* Step 2 */}
            <div className="text-center relative">
              <div className="relative inline-flex mb-6">
                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-gradient-to-br from-rose-100 to-pink-100 dark:from-rose-900/40 dark:to-pink-900/30 flex items-center justify-center shadow-lg shadow-rose-500/10">
                  <Sparkles className="w-9 h-9 sm:w-10 sm:h-10 text-rose-700 dark:text-rose-400" />
                </div>
                <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-rose-600 text-white text-xs font-bold flex items-center justify-center shadow-md">
                  02
                </div>
              </div>
              <h3 className="text-xl font-display font-bold mb-3">AI Translation</h3>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">
                Powered by large language models trained on our dictionaries, providing contextual translations with cultural notes.
              </p>
            </div>

            {/* Step 3 */}
            <div className="text-center relative">
              <div className="relative inline-flex mb-6">
                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-gradient-to-br from-emerald-100 to-teal-100 dark:from-emerald-900/40 dark:to-teal-900/30 flex items-center justify-center shadow-lg shadow-emerald-500/10">
                  <Users className="w-9 h-9 sm:w-10 sm:h-10 text-emerald-700 dark:text-emerald-400" />
                </div>
                <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-emerald-600 text-white text-xs font-bold flex items-center justify-center shadow-md">
                  03
                </div>
              </div>
              <h3 className="text-xl font-display font-bold mb-3">Open Source</h3>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">
                Every line of code, every dictionary entry is open. Built by the community, for the community. Forever free.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA / Quote Section */}
      <section className="relative overflow-hidden -mx-4 sm:-mx-6 lg:-mx-8 xl:-mx-12 2xl:-mx-16">
        {/* Earth-tone gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-stone-950 via-amber-950/90 to-stone-950" />

        {/* Subtle pattern */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.8) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        />

        <div className="relative px-4 sm:px-6 lg:px-8 xl:px-12 2xl:px-16 py-24 sm:py-32">
          <div className="max-w-4xl mx-auto text-center">
            {/* Large decorative quotation mark */}
            <div className="relative mb-8">
              <span className="text-[120px] sm:text-[160px] leading-none font-display font-black text-amber-500/10 absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 select-none pointer-events-none">
                &ldquo;
              </span>
              <Heart className="w-10 h-10 text-rose-400/80 mx-auto relative" />
            </div>

            <blockquote className="text-2xl sm:text-3xl lg:text-4xl font-display font-bold text-white mb-8 leading-snug tracking-tight">
              &ldquo;When a language dies, a way of understanding the world is lost forever.&rdquo;
            </blockquote>

            <p className="text-[rgba(255,255,255,0.5)] mb-12 max-w-xl mx-auto text-base sm:text-lg leading-relaxed">
              Every word we preserve keeps a culture alive. Join us in building
              the tools that give Indigenous languages a digital future.
            </p>

            <div className="flex flex-wrap gap-4 justify-center">
              <Link
                href="/about"
                className="inline-flex items-center gap-2.5 px-8 py-3.5 bg-white text-gray-900 font-semibold rounded-xl hover:bg-[rgba(255,255,255,0.9)] transition-all duration-300 hover:shadow-lg hover:shadow-white/10 hover:-translate-y-0.5"
              >
                Learn More
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="https://github.com/australia/mobtranslate.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2.5 px-8 py-3.5 border border-[rgba(255,255,255,0.2)] text-white font-semibold rounded-xl hover:bg-[rgba(255,255,255,0.08)] hover:border-[rgba(255,255,255,0.3)] transition-all duration-300 hover:-translate-y-0.5"
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
