import React from 'react';
import { notFound } from 'next/navigation';
import SharedLayout from '../../components/SharedLayout';
import DictionarySearch from './components/DictionarySearch';
import { Badge } from '@mobtranslate/ui';

import Link from 'next/link';
import { ChevronRight, MapPin, BookOpen, ArrowLeft, Type } from 'lucide-react';

const Breadcrumbs = ({ items, className }: { items: { href: string; label: string }[]; className?: string }) => (
  <nav className={`flex items-center gap-2 text-sm ${className || ''}`}>
    {items.map((item, index) => (
      <React.Fragment key={item.href}>
        {index > 0 && <ChevronRight className="h-4 w-4 text-muted-foreground/50" />}
        {index === items.length - 1 ? (
          <span className="text-foreground font-medium">{item.label}</span>
        ) : (
          <Link href={item.href} className="text-muted-foreground hover:text-amber-700 dark:hover:text-amber-400 transition-colors">
            {item.label}
          </Link>
        )}
      </React.Fragment>
    ))}
  </nav>
);
import { getWordsForLanguage } from '@/lib/supabase/queries';
import type { DictionaryQueryParams } from '@/lib/supabase/types';
import { transformWordsForUI } from '@/lib/utils/dictionary-transform';

export const revalidate = 60; // Revalidate every 60 seconds

export default async function DictionaryPage({
  params,
  searchParams,
}: {
  params: { language: string };
  searchParams: { 
    search?: string;
    page?: string;
    limit?: string;
    sortBy?: string;
    sortOrder?: string;
    wordClass?: string;
    letter?: string;
  };
}) {
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
        {/* Header */}
        <div className="py-8 md:py-12">
          <Breadcrumbs items={breadcrumbItems} className="mb-6" />

          <div className="flex items-center gap-3 mb-4">
            <Link
              href="/dictionaries"
              className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center hover:bg-amber-200 dark:hover:bg-amber-800/50 transition-colors shadow-sm"
            >
              <ArrowLeft className="w-4 h-4 text-amber-700 dark:text-amber-400" />
            </Link>
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-display font-bold tracking-tight">
              {languageData.name}
            </h1>
            {languageData.status && (
              <Badge
                variant="secondary"
                className="ml-1"
              >
                {languageData.status}
              </Badge>
            )}
          </div>

          <p className="text-muted-foreground max-w-3xl mb-6 text-base md:text-lg leading-relaxed">
            {languageData.description || `Explore the ${languageData.name} language dictionary`}
          </p>

          {/* Stats row */}
          <div className="flex flex-wrap items-center gap-3 mb-6">
            {languageData.region && (
              <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-card border shadow-sm">
                <MapPin className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <span className="text-sm font-medium">{languageData.region}</span>
              </div>
            )}
            <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-card border shadow-sm">
              <BookOpen className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <span className="text-sm font-medium">{pagination.total.toLocaleString()} words</span>
            </div>
            {wordClasses.length > 0 && (
              <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-card border shadow-sm">
                <Type className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <span className="text-sm font-medium">{wordClasses.length} word classes</span>
              </div>
            )}
          </div>

          {/* Map link */}
          <Link
            href={`/dictionaries/${language}/map`}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 text-sm font-medium hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors border border-amber-200 dark:border-amber-800/50 shadow-sm"
          >
            <MapPin className="w-4 h-4" />
            View place names on map
          </Link>
        </div>

        {/* Dictionary content */}
        <div className="pb-16">
          <DictionarySearch
            dictionary={dictionary}
            initialSearch={searchParams.search || ''}
            pagination={pagination}
            currentPage={queryParams.page}
          />
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

export async function generateMetadata({
  params,
}: {
  params: { language: string };
}) {
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