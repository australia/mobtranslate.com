import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import SharedLayout from '../../components/SharedLayout';
import { type Dictionary, type DictionaryWord } from '@dictionaries';

async function getDictionaryData(language: string, searchTerm: string = '') {
  const searchParams = new URLSearchParams();
  if (searchTerm) searchParams.set('search', searchTerm);
  
  const queryString = searchParams.toString();
  
  // For server components, we need to ensure we have a valid absolute URL
  // Using URL constructor to guarantee a valid URL
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || 
    (typeof window === 'undefined' ? 'http://localhost:3000' : window.location.origin);
  
  const url = new URL(`/api/dictionaries/${language}${queryString ? `?${queryString}` : ''}`, baseUrl);
  
  const response = await fetch(
    url.toString(),
    { cache: 'no-store' }
  );
  
  if (!response.ok) {
    if (response.status === 404) {
      return null;
    }
    throw new Error('Failed to fetch dictionary data');
  }
  
  return response.json();
}

export default async function LanguageDictionaryPage({
  params,
  searchParams,
}: {
  params: { language: string };
  searchParams: { search?: string };
}) {
  const { language } = params;
  const { search = '' } = searchParams;
  
  const dictionaryResponse = await getDictionaryData(language, search);
  
  if (!dictionaryResponse) {
    notFound();
  }
  
  const { meta, data: words, pagination } = dictionaryResponse;
  
  return (
    <SharedLayout>
      <div className="container mx-auto px-4 py-8">
        <div className="space-y-6">
          {/* Header section */}
          <div>
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold tracking-tight">{meta.name} Dictionary</h1>
                <p className="text-muted-foreground mt-1">{meta.description}</p>
              </div>
              <Link 
                href={`/dictionaries/${language}/words`}
                className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
              >
                View All Words
              </Link>
            </div>
            <div className="mt-4 flex items-center text-sm text-muted-foreground">
              <span className="mr-2">Region:</span>
              <span className="font-medium">{meta.region}</span>
              {meta.source && (
                <>
                  <span className="mx-2">•</span>
                  <span className="mr-2">Source:</span>
                  <span className="font-medium">{meta.source}</span>
                </>
              )}
              {meta.lastUpdated && (
                <>
                  <span className="mx-2">•</span>
                  <span className="mr-2">Updated:</span>
                  <span className="font-medium">{meta.lastUpdated}</span>
                </>
              )}
            </div>
          </div>
          
          {/* Search form */}
          <div className="rounded-lg border bg-card p-4">
            <form action="" className="flex items-center gap-2">
              <input
                type="text"
                name="search"
                placeholder="Search for words, definitions..."
                defaultValue={search}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 flex-1"
              />
              <button
                type="submit"
                className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
              >
                Search
              </button>
            </form>
          </div>
          
          {/* Dictionary content */}
          {words.length === 0 ? (
            <div className="text-center py-12">
              <h3 className="text-lg font-semibold">No words found</h3>
              <p className="text-muted-foreground mt-1">Try a different search term</p>
            </div>
          ) : (
            <>
              {/* Word count and pagination info */}
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Showing {words.length} of {pagination.total} words
                  {search && <span> matching "{search}"</span>}
                </p>
                {pagination.total > words.length && (
                  <Link 
                    href={`/dictionaries/${language}/words?search=${search}`}
                    className="text-sm text-primary hover:underline"
                  >
                    View all results
                  </Link>
                )}
              </div>
              
              {/* Words table */}
              <div className="rounded-md border">
                <div className="relative w-full overflow-auto">
                  <table className="w-full caption-bottom text-sm">
                    <thead className="[&_tr]:border-b">
                      <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                        <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Word</th>
                        <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Type</th>
                        <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Definition</th>
                      </tr>
                    </thead>
                    <tbody className="[&_tr:last-child]:border-0">
                      {words.map((word: DictionaryWord, index: number) => (
                        <tr 
                          key={`${word.word}-${index}`} 
                          className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted"
                        >
                          <td className="p-4 align-middle">
                            <Link
                              href={`/dictionaries/${language}/words/${encodeURIComponent(word.word)}`}
                              className="font-medium text-primary hover:underline"
                            >
                              {word.word}
                            </Link>
                          </td>
                          <td className="p-4 align-middle text-muted-foreground">
                            {word.type || '-'}
                          </td>
                          <td className="p-4 align-middle">
                            {word.definition && (
                              <p>{word.definition}</p>
                            )}
                            {word.definitions && (
                              <ul className="list-disc pl-5 space-y-1">
                                {word.definitions.map((def, idx) => (
                                  <li key={idx}>{def}</li>
                                ))}
                              </ul>
                            )}
                            {word.example && (
                              <p className="mt-2 text-sm italic text-muted-foreground">
                                "{word.example}"
                              </p>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </SharedLayout>
  );
}
