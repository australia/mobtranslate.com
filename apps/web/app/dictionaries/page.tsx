import React from 'react';
import Link from 'next/link';
import SharedLayout from '../components/SharedLayout';
import { Card, CardContent, Badge } from '@mobtranslate/ui';
import { getActiveLanguages, getLanguageStats } from '@/lib/supabase/queries';
import { BookOpen, MapPin, ArrowRight, Languages } from 'lucide-react';

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
      <div className="py-8 md:py-12">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Languages className="w-5 h-5 text-primary" />
          </div>
          <h1 className="text-3xl md:text-4xl font-display font-bold tracking-tight">
            Dictionaries
          </h1>
        </div>
        <p className="text-muted-foreground max-w-2xl mb-6">
          Browse our collection of Indigenous language dictionaries from around the world.
          Each dictionary is built with community input, preserving traditional knowledge for future generations.
        </p>
        <div className="flex items-center gap-6 text-sm">
          <span className="font-semibold">{stats.totalLanguages} languages</span>
          <span className="text-muted-foreground">|</span>
          <span className="font-semibold">{stats.totalWords.toLocaleString()} total words</span>
        </div>
      </div>

      {/* Dictionary Cards */}
      <div className="grid gap-6 sm:grid-cols-2 pb-12">
        {languages.map((lang) => {
          const wordCount = stats.wordsByLanguage[lang.code] || 0;
          const fillPercent = maxWords > 0 ? (wordCount / maxWords) * 100 : 0;

          return (
            <Link
              key={lang.code}
              href={`/dictionaries/${lang.code}`}
              className="group block no-underline"
            >
              <Card className="h-full transition-all duration-300 hover:shadow-xl hover:-translate-y-1">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h2 className="text-2xl font-display font-bold group-hover:text-primary transition-colors">
                        {lang.name}
                      </h2>
                      {lang.region && (
                        <div className="flex items-center gap-1.5 text-sm text-muted-foreground mt-1">
                          <MapPin className="w-3.5 h-3.5" />
                          {lang.region}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-sm text-primary opacity-0 group-hover:opacity-100 transition-opacity mt-1">
                      View <ArrowRight className="w-3.5 h-3.5" />
                    </div>
                  </div>

                  <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                    {lang.description || `Explore the language of the ${lang.name} people`}
                  </p>

                  {/* Word count bar */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <BookOpen className="w-4 h-4 text-primary" />
                        <span className="text-sm font-semibold">{wordCount.toLocaleString()} words</span>
                      </div>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-primary to-primary/60 rounded-full transition-all duration-500"
                        style={{ width: `${fillPercent}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 text-xs">
                    {lang.family && (
                      <Badge variant="outline">{lang.family}</Badge>
                    )}
                    {lang.status && (
                      <Badge
                        variant={
                          lang.status === 'severely endangered' ? 'destructive' :
                          lang.status === 'endangered' ? 'destructive' :
                          'secondary'
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

      {/* About section */}
      <section className="py-12 border-t">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div>
            <h3 className="text-xl font-display font-bold mb-3">Language Preservation</h3>
            <p className="text-muted-foreground leading-relaxed">
              Each dictionary represents years of community work to document and preserve traditional knowledge.
              These digital resources ensure that future generations can access and learn from their linguistic heritage.
            </p>
          </div>
          <div>
            <h3 className="text-xl font-display font-bold mb-3">Community Collaboration</h3>
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
