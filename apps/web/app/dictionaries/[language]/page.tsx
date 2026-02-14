import React from 'react';
import { notFound } from 'next/navigation';
import SharedLayout from '../../components/SharedLayout';
import DictionarySearch from './components/DictionarySearch';
import { Badge } from '@mobtranslate/ui';

import Link from 'next/link';
import { ChevronRight, MapPin, BookOpen, ArrowLeft } from 'lucide-react';

const Breadcrumbs = ({ items, className }: { items: { href: string; label: string }[]; className?: string }) => (
  <nav className={`flex items-center gap-2 text-sm ${className || ''}`}>
    {items.map((item, index) => (
      <React.Fragment key={item.href}>
        {index > 0 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        {index === items.length - 1 ? (
          <span className="text-foreground font-medium">{item.label}</span>
        ) : (
          <Link href={item.href} className="text-muted-foreground hover:text-foreground transition-colors">
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

    return (
      <SharedLayout>
        {/* Header */}
        <div className="py-6 md:py-10">
          <Breadcrumbs items={breadcrumbItems} className="mb-6" />

          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <Link
                  href="/dictionaries"
                  className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                </Link>
                <h1 className="text-3xl md:text-4xl font-display font-bold tracking-tight">
                  {languageData.name}
                </h1>
              </div>
              <p className="text-muted-foreground max-w-2xl ml-11">
                {languageData.description || `Explore the ${languageData.name} language dictionary`}
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap ml-11 md:ml-0">
              {languageData.region && (
                <Badge variant="secondary" className="gap-1">
                  <MapPin className="w-3 h-3" />
                  {languageData.region}
                </Badge>
              )}
              <Badge variant="outline" className="gap-1">
                <BookOpen className="w-3 h-3" />
                {pagination.total.toLocaleString()} words
              </Badge>
              {languageData.status && (
                <Badge
                  variant={
                    languageData.status === 'severely endangered' ? 'destructive' :
                    languageData.status === 'endangered' ? 'destructive' :
                    'secondary'
                  }
                >
                  {languageData.status}
                </Badge>
              )}
            </div>
          </div>

          {/* Map link */}
          <div className="mt-4 ml-11">
            <Link
              href={`/dictionaries/${language}/map`}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 transition-colors"
            >
              <MapPin className="w-4 h-4" />
              View place names on map
            </Link>
          </div>
        </div>

        {/* Dictionary content */}
        <div className="pb-12">
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