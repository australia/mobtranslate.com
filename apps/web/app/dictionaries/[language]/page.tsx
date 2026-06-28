import React from 'react';
import { notFound } from 'next/navigation';
import SharedLayout from '../../components/SharedLayout';
import DictionarySearch from './components/DictionarySearch';
import { Badge } from '@mobtranslate/ui';

import Link from 'next/link';
import { ChevronRight, MapPin, BookOpen, ArrowLeft, Type } from 'lucide-react';

const Breadcrumbs = ({ items, className }: { items: { href: string; label: string }[]; className?: string }) => (
  <nav aria-label="Breadcrumb" className={`flex items-center gap-2 text-sm ${className || ''}`}>
    {items.map((item, index) => (
      <React.Fragment key={item.href}>
        {index > 0 && <ChevronRight className="h-4 w-4 text-muted-foreground/50" aria-hidden="true" />}
        {index === items.length - 1 ? (
          <span className="text-foreground font-medium" aria-current="page">{item.label}</span>
        ) : (
          <Link href={item.href} className="text-muted-foreground hover:text-[var(--lang-accent)] transition-colors">
            {item.label}
          </Link>
        )}
      </React.Fragment>
    ))}
  </nav>
);
import { getWordsForLanguage } from '@/lib/db/queries';
import type { DictionaryQueryParams } from '@/lib/supabase/types';
import { transformWordsForUI } from '@/lib/utils/dictionary-transform';
import { creditsForLanguage } from '@/lib/credits';

export const revalidate = 60; // Revalidate every 60 seconds

export default async function DictionaryPage(
  props: {
    params: Promise<{ language: string }>;
    searchParams: Promise<{ 
      search?: string;
      page?: string;
      limit?: string;
      sortBy?: string;
      sortOrder?: string;
      wordClass?: string;
      letter?: string;
    }>;
  }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const { language } = params;

  const queryParams: DictionaryQueryParams = {
    language,
    search: searchParams.search || undefined,
    page: parseInt(searchParams.page || '1', 10),
    limit: parseInt(searchParams.limit || '50', 10),
    sortBy: (searchParams.sortBy as DictionaryQueryParams['sortBy']) || 'word',
    sortOrder: (searchParams.sortOrder as DictionaryQueryParams['sortOrder']) || 'asc',
    wordClass: searchParams.wordClass || undefined,
    letter: searchParams.letter || undefined,
  };

  try {
    const { words, language: languageData, pagination } = await getWordsForLanguage(queryParams);
    
    const breadcrumbItems = [
      { href: '/', label: 'Home' },
      { href: '/dictionaries', label: 'Dictionaries' },
      { href: `/dictionaries/${language}`, label: languageData.name }
    ];

    // Transform data for DictionarySearch component compatibility
    const dictionary = {
      meta: {
        name: languageData.name,
        description: languageData.description || '',
        region: languageData.region || '',
        code: languageData.code
      },
      words: transformWordsForUI(words)
    };

    // Gather unique word classes for stats
    const wordClassSet = new Set<string>();
    words.forEach(w => { if (w.word_class?.name) wordClassSet.add(w.word_class.name); });
    const wordClasses = Array.from(wordClassSet);

    return (
      <SharedLayout>
        <div data-language={languageData.code}>
          {/* Identity band — soft per-language accent tint behind the headword */}
          <div className="-mx-4 sm:-mx-6 lg:-mx-8 xl:-mx-12 2xl:-mx-16 -mt-6 sm:-mt-8 lg:-mt-12 bg-[var(--lang-accent-soft)] border-b border-border">
            <div className="px-4 sm:px-6 lg:px-8 xl:px-12 2xl:px-16 pt-6 sm:pt-8 pb-8 md:pb-10">
              <div className="flex items-center justify-between gap-4 mb-6">
                <Breadcrumbs items={breadcrumbItems} />
                <Link
                  href="/dictionaries"
                  className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-[var(--lang-accent)] transition-colors shrink-0"
                >
                  <ArrowLeft className="w-4 h-4" /> All dictionaries
                </Link>
              </div>

              {languageData.region && (
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--lang-accent)] mb-2">
                  {languageData.region}
                </p>
              )}

              <div className="flex flex-wrap items-end gap-x-4 gap-y-2 mb-4">
                <h1 className="headword text-4xl md:text-5xl lg:text-6xl font-semibold tracking-[-0.015em] leading-none">
                  {languageData.name}
                </h1>
                {languageData.status && <Badge variant="secondary">{languageData.status}</Badge>}
              </div>

              <p className="text-muted-foreground max-w-2xl text-base md:text-lg leading-relaxed mb-6">
                {languageData.description || `Explore the ${languageData.name} language dictionary.`}
              </p>

              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                <span className="inline-flex items-center gap-1.5 text-foreground/80">
                  <BookOpen className="w-4 h-4 text-[var(--lang-accent)]" aria-hidden="true" />
                  <strong className="font-semibold">{pagination.total.toLocaleString()}</strong> words
                </span>
                {wordClasses.length > 0 && (
                  <span className="inline-flex items-center gap-1.5 text-foreground/80">
                    <Type className="w-4 h-4 text-[var(--lang-accent)]" aria-hidden="true" />
                    <strong className="font-semibold">{wordClasses.length}</strong> word classes
                  </span>
                )}
                <Link
                  href={`/dictionaries/${language}/map`}
                  className="inline-flex items-center gap-1.5 font-medium text-[var(--lang-accent)] hover:underline underline-offset-4"
                >
                  <MapPin className="w-4 h-4" /> View place names on map
                </Link>
              </div>

              {/* Subtle attribution: the people & work behind this dictionary. */}
              {(() => {
                const langCredits = creditsForLanguage(languageData.code);
                if (langCredits.length === 0) return null;
                const makers = langCredits.filter((c) => c.category === 'dictionary');
                const voice = langCredits.filter((c) => c.category === 'voice');
                return (
                  <p className="mt-5 text-xs text-muted-foreground/80">
                    {makers.length > 0 && (
                      <span>
                        Dictionary by{' '}
                        {makers.map((m, i) => (
                          <span key={m.slug}>
                            {i > 0 && ', '}
                            <Link href={`/credits/${m.slug}`} className="hover:text-foreground underline-offset-2 hover:underline">{m.name}</Link>
                          </span>
                        ))}
                        {' · '}
                      </span>
                    )}
                    {voice.length > 0 && (
                      <span>
                        voice by{' '}
                        <Link href={`/credits/${voice[0].slug}`} className="hover:text-foreground underline-offset-2 hover:underline">{voice[0].name}</Link>
                        {' · '}
                      </span>
                    )}
                    <Link href="/credits" className="text-[var(--lang-accent)] hover:underline underline-offset-2">all credits</Link>
                  </p>
                );
              })()}
            </div>
          </div>

          {/* Dictionary content */}
          <div className="pt-8 pb-16">
            <DictionarySearch
              dictionary={dictionary}
              initialSearch={searchParams.search || ''}
              pagination={pagination}
              currentPage={queryParams.page}
            />
          </div>
        </div>
      </SharedLayout>
    );
  } catch (error) {
    console.error('Error loading dictionary:', error);
    
    if (error instanceof Error && error.message.includes('not found')) {
      notFound();
    }
    
    throw error; // Let Next.js error boundary handle other errors
  }
}

export async function generateMetadata(
  props: {
    params: Promise<{ language: string }>;
  }
) {
  const params = await props.params;
  try {
    const { language: languageData } = await getWordsForLanguage({ 
      language: params.language,
      limit: 1 
    });
    
    return {
      title: `${languageData.name} Dictionary - MobTranslate`,
      description: languageData.description || `Explore the ${languageData.name} language dictionary with translations and cultural context.`,
      openGraph: {
        title: `${languageData.name} Dictionary`,
        description: languageData.description,
        type: 'website',
      },
    };
  } catch {
    return {
      title: 'Dictionary - MobTranslate',
      description: 'Explore indigenous language dictionaries with translations and cultural context.',
    };
  }
}