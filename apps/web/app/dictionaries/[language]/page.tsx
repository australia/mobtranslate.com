import React from 'react';
import { notFound } from 'next/navigation';
import SharedLayout from '../../components/SharedLayout';
import DictionarySearch from './components/DictionarySearch';
import { PageHeader } from '@/app/components/ui/page-header';
import { Section } from '@/app/components/ui/section';
import { Badge } from '@/app/components/ui/badge';
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
        <PageHeader 
          title={`${languageData.name} Dictionary`}
          description={languageData.description || `Explore the ${languageData.name} language dictionary`}
        >
          <div className="flex items-center justify-center gap-2 mt-4">
            {languageData.region && (
              <Badge variant="secondary">{languageData.region}</Badge>
            )}
            <Badge variant="outline">{pagination.total} words</Badge>
            {languageData.status && (
              <Badge variant={languageData.status === 'endangered' ? 'destructive' : 'default'}>
                {languageData.status === 'severely endangered' ? 'very-low volume' : 
                 languageData.status === 'endangered' ? 'low volume' :
                 languageData.status === 'vulnerable' ? 'low volume' : 
                 languageData.status}
              </Badge>
            )}
          </div>
        </PageHeader>

        <Section contained={false}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <DictionarySearch 
              dictionary={dictionary} 
              initialSearch={searchParams.search || ''} 
              pagination={pagination}
              currentPage={queryParams.page}
            />
          </div>
        </Section>
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