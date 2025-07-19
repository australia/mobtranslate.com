import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import SharedLayout from '../../components/SharedLayout';
import { type Dictionary } from '@dictionaries';
import DictionarySearch from './components/DictionarySearch';
import { PageHeader, Section, Breadcrumbs, Badge } from '@ui/components';

interface DictionaryResponse {
  success: boolean;
  meta: {
    name: string;
    description: string;
    region: string;
  };
  data: Array<{
    word: string;
    definition?: string;
    definitions?: string[];
    type?: string;
  }>;
}

async function getDictionaryData(language: string): Promise<DictionaryResponse | null> {
  try {
    const headersList = headers();
    const host = headersList.get('host') || 'localhost:3000';
    const protocol = process.env.NODE_ENV === 'development' ? 'http' : 'https';
    
    const response = await fetch(
      `${protocol}://${host}/api/dictionaries/${language}`,
      { 
        cache: 'no-store',
        headers: {
          'Accept': 'application/json'
        }
      }
    );
    
    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error('Failed to fetch dictionary data');
    }
    
    const data = await response.json();
    console.log('Dictionary data:', data);
    return data.success ? data : null;
  } catch (error) {
    console.error('Error fetching dictionary data:', error);
    return null;
  }
}

export default async function DictionaryPage({
  params,
  searchParams,
}: {
  params: { language: string };
  searchParams: { search?: string };
}) {
  const { language } = params;
  const { search = '' } = searchParams;
  
  const dictionaryData = await getDictionaryData(language);
  
  if (!dictionaryData) {
    notFound();
  }

  const { meta, data: words } = dictionaryData;
  const dictionary = {
    meta: {
      ...meta,
      code: language
    },
    words
  };
  
  const breadcrumbItems = [
    { href: '/', label: 'Home' },
    { href: '/dictionaries', label: 'Dictionaries' },
    { href: `/dictionaries/${language}`, label: meta.name }
  ];

  return (
    <SharedLayout>
      <PageHeader 
        title={`${meta.name} Dictionary`}
        description={meta.description}
      >
        <div className="flex items-center justify-center gap-2 mt-4">
          <Badge variant="secondary">{meta.region}</Badge>
          <Badge variant="outline">{words.length} words</Badge>
        </div>
      </PageHeader>

      <Section contained={false}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Breadcrumbs items={breadcrumbItems} className="mb-6" />
          
          <DictionarySearch dictionary={dictionary} initialSearch={search} />
        </div>
      </Section>
    </SharedLayout>
  );
}
