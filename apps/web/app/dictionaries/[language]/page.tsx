import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import SharedLayout from '../../components/SharedLayout';
import { type Dictionary } from '@dictionaries';
import DictionarySearch from './components/DictionarySearch';

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
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 
      (typeof window === 'undefined' ? 'http://localhost:3000' : window.location.origin);
    
    const response = await fetch(
      `${baseUrl}/api/dictionaries/${language}`,
      { cache: 'no-store' }
    );
    
    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error('Failed to fetch dictionary data');
    }
    
    const data = await response.json();
    console.log('Dictionary data:', data); // Debug log
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
  
  return (
    <SharedLayout>
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-5xl mx-auto space-y-8">
          {/* Header */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold tracking-tight">{meta.name} Dictionary</h1>
                <p className="text-muted-foreground mt-1">{meta.description}</p>
              </div>
            </div>
            <div className="mt-4 flex items-center text-sm text-muted-foreground">
              <span className="mr-2">Region:</span>
              <span className="font-medium">{meta.region}</span>
            </div>
            <div className="flex items-center space-x-2 text-sm">
              <Link href="/dictionaries" className="text-muted-foreground hover:text-foreground">
                Dictionaries
              </Link>
              <span className="text-muted-foreground">/</span>
              <span className="text-foreground font-medium">{meta.name}</span>
            </div>
          </div>
          
          {/* Dictionary search and content */}
          <DictionarySearch dictionary={dictionary} initialSearch={search} />
        </div>
      </div>
    </SharedLayout>
  );
}
