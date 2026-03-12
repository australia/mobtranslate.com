import React from 'react';
import Link from 'next/link';
import SharedLayout from '../components/SharedLayout';
import { Card, CardContent, Badge } from '@mobtranslate/ui';
import { getActiveLanguages, getLanguageStats } from '@/lib/supabase/queries';
import { BookOpen, MapPin, ArrowRight, Languages, Globe, Heart, Users } from 'lucide-react';

export const revalidate = 3600;

export default async function DictionariesPage() {
  const [languages, stats] = await Promise.all([
    getActiveLanguages(),
    getLanguageStats(),
  ]);

  const maxWords = Math.max(...Object.values(stats.wordsByLanguage));

  return (
    <SharedLayout>
      {/* Header */}
      <div className="py-10 md:py-16">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-100 to-orange-100 dark:from-amber-900/40 dark:to-orange-900/40 flex items-center justify-center shadow-sm">
            <Languages className="w-7 h-7 text-amber-700 dark:text-amber-400" />
          </div>
          <div>
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-display font-bold tracking-tight">
              Dictionaries
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Preserving language, preserving culture</p>
          </div>
        </div>
        <p className="text-muted-foreground max-w-2xl mb-8 text-base md:text-lg leading-relaxed">
          Browse our collection of Indigenous language dictionaries from around the world.
          Each dictionary is built with community input, preserving traditional knowledge for future generations.
        </p>
        <div className="flex items-center gap-4 sm:gap-8">
          <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-card border shadow-sm">
            <Globe className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <div>
              <span className="text-lg font-bold font-display">{stats.totalLanguages}</span>
              <span className="text-sm text-muted-foreground ml-1.5">languages</span>
            </div>
          </div>
          <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-card border shadow-sm">
            <BookOpen className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <div>
              <span className="text-lg font-bold font-display">{stats.totalWords.toLocaleString()}</span>
              <span className="text-sm text-muted-foreground ml-1.5">words</span>
            </div>
          </div>
        </div>
      </div>

      {/* Dictionary Cards */}
      <div className="grid gap-6 sm:grid-cols-2 pb-16">
        {languages.map((lang) => {
          const wordCount = stats.wordsByLanguage[lang.code] || 0;
          const fillPercent = maxWords > 0 ? (wordCount / maxWords) * 100 : 0;

          return (
            <Link
              key={lang.code}
              href={`/dictionaries/${lang.code}`}
              className="group block no-underline"
            >
              <Card className="h-full transition-all duration-300 hover:shadow-xl hover:-translate-y-1 border-l-4 border-l-amber-500/70 dark:border-l-amber-600/70">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h2 className="text-2xl font-display font-bold group-hover:text-amber-700 dark:group-hover:text-amber-400 transition-colors">
                        {lang.name}
                      </h2>
                      {lang.region && (
                        <div className="flex items-center gap-1.5 text-sm text-muted-foreground mt-1.5">
                          <MapPin className="w-3.5 h-3.5 text-amber-600/70 dark:text-amber-500/70" />
                          {lang.region}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-sm font-medium text-amber-700 dark:text-amber-400 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-1 group-hover:translate-x-0 mt-1">
                      Explore <ArrowRight className="w-4 h-4" />
                    </div>
                  </div>

                  <p className="text-sm text-muted-foreground mb-5 line-clamp-2 leading-relaxed">
                    {lang.description || `Explore the language of the ${lang.name} people`}
                  </p>

                  {/* Word count bar */}
                  <div className="mb-5">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <BookOpen className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                        <span className="text-sm font-semibold">{wordCount.toLocaleString()} words</span>
                      </div>
                      <span className="text-xs text-muted-foreground">{Math.round(fillPercent)}%</span>
                    </div>
                    <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-amber-500 to-orange-400 dark:from-amber-600 dark:to-orange-500 rounded-full transition-all duration-700 ease-out"
                        style={{ width: `${Math.max(fillPercent, 3)}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 text-xs">
                    {lang.family && (
                      <Badge variant="outline" className="border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400">
                        {lang.family}
                      </Badge>
                    )}
                    {lang.status && (
                      <Badge
                        variant={
                          lang.status === 'severely endangered' ? 'destructive' :
                          lang.status === 'endangered' ? 'destructive' :
                          'secondary'
                        }
                        className={
                          lang.status === 'severely endangered' || lang.status === 'endangered'
                            ? 'bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300 border-red-200 dark:border-red-800'
                            : lang.status === 'active' || lang.status === 'vitalized'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                            : ''
                        }
                      >
                        {lang.status}
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      {/* Divider */}
      <div className="flex items-center gap-4 py-2">
        <div className="flex-1 h-px bg-gradient-to-r from-transparent via-amber-300/50 to-transparent dark:via-amber-700/50" />
        <Heart className="w-4 h-4 text-amber-500/60 dark:text-amber-600/60" />
        <div className="flex-1 h-px bg-gradient-to-r from-transparent via-amber-300/50 to-transparent dark:via-amber-700/50" />
      </div>

      {/* About section */}
      <section className="py-12 md:py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center">
                <BookOpen className="w-5 h-5 text-amber-700 dark:text-amber-400" />
              </div>
              <h3 className="text-xl font-display font-bold">Language Preservation</h3>
            </div>
            <p className="text-muted-foreground leading-relaxed">
              Each dictionary represents years of community work to document and preserve traditional knowledge.
              These digital resources ensure that future generations can access and learn from their linguistic heritage.
            </p>
          </div>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center">
                <Users className="w-5 h-5 text-amber-700 dark:text-amber-400" />
              </div>
              <h3 className="text-xl font-display font-bold">Community Collaboration</h3>
            </div>
            <p className="text-muted-foreground leading-relaxed">
              Our dictionaries are created in collaboration with Indigenous communities, linguists, and cultural keepers.
              We acknowledge the Traditional Owners of these languages and thank them for sharing their knowledge.
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
    description: 'Browse our collection of Indigenous language dictionaries from around the world, preserving and sharing traditional languages through digital preservation.',
    openGraph: {
      title: 'Indigenous Language Dictionaries',
      description: 'Explore dictionaries for Indigenous languages including Kuku Yalanji, Mi\'gmaq, and Anindilyakwa.',
      type: 'website',
    },
  };
}
