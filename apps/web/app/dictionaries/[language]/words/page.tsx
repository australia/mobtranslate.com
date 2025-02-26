import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import SharedLayout from '../../../components/SharedLayout';
import { type DictionaryWord } from '@dictionaries';

async function getDictionaryWords(language: string, letter: string = '', page: number = 1, limit: number = 100) {
  const searchParams = new URLSearchParams();
  if (letter) searchParams.set('letter', letter);
  searchParams.set('page', page.toString());
  searchParams.set('limit', limit.toString());
  
  const queryString = searchParams.toString();
  
  // For server components, we need to ensure we have a valid absolute URL
  // Using URL constructor to guarantee a valid URL
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || 
    (typeof window === 'undefined' ? 'http://localhost:3000' : window.location.origin);
  
  const url = new URL(`/api/dictionaries/${language}/words${queryString ? `?${queryString}` : ''}`, baseUrl);
  
  const response = await fetch(
    url.toString(),
    { cache: 'no-store' }
  );
  
  if (!response.ok) {
    if (response.status === 404) {
      return null;
    }
    throw new Error('Failed to fetch dictionary words');
  }
  
  return response.json();
}

export default async function WordsPage({
  params,
  searchParams,
}: {
  params: { language: string };
  searchParams: { letter?: string; page?: string; limit?: string; search?: string };
}) {
  const { language } = params;
  const { 
    letter = '', 
    page = '1',
    limit = '100',
    search = ''
  } = searchParams;
  
  const pageNumber = parseInt(page, 10);
  const limitNumber = parseInt(limit, 10);
  
  const response = await getDictionaryWords(language, letter, pageNumber, limitNumber);
  
  if (!response) {
    notFound();
  }
  
  const { 
    meta, 
    data: words, 
    availableLetters, 
    pagination 
  } = response;
  
  return (
    <SharedLayout>
      <div className="container mx-auto px-4 py-8">
        <div className="space-y-6">
          {/* Header section */}
          <div>
            <div className="flex items-center justify-between">
              <div>
                <Link 
                  href={`/dictionaries/${language}`}
                  className="text-sm text-muted-foreground hover:text-foreground mb-2 inline-flex items-center"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="mr-1 h-4 w-4"
                  >
                    <path d="m15 18-6-6 6-6" />
                  </svg>
                  Back to {meta.name} Dictionary
                </Link>
                <h1 className="text-3xl font-bold tracking-tight">All Words</h1>
                <p className="text-muted-foreground mt-1">
                  Browse all {meta.wordCount} words in the {meta.name} dictionary
                </p>
              </div>
            </div>
          </div>
          
          {/* Alphabet Filter */}
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-sm text-muted-foreground mr-2">Filter by:</span>
            <Link 
              href={`/dictionaries/${language}/words`}
              className={`px-2.5 py-1.5 text-sm font-medium rounded-md ${
                !letter ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
              }`}
            >
              All
            </Link>
            {availableLetters.map((currentLetter: string) => (
              <Link
                key={currentLetter}
                href={`/dictionaries/${language}/words?letter=${currentLetter}`}
                className={`px-2.5 py-1.5 text-sm font-medium rounded-md ${
                  letter === currentLetter ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                }`}
              >
                {currentLetter}
              </Link>
            ))}
          </div>
          
          {/* Dictionary content */}
          {words.length === 0 ? (
            <div className="text-center py-12">
              <h3 className="text-lg font-semibold">No words found</h3>
              <p className="text-muted-foreground mt-1">Try a different letter</p>
            </div>
          ) : (
            <>
              {/* Word count */}
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Showing {words.length} of {pagination.total} words
                  {letter && <span> starting with "{letter}"</span>}
                </p>
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

              {/* Pagination */}
              {pagination.totalPages > 1 && (
                <div className="flex items-center justify-center space-x-2 py-4">
                  <Link
                    href={`/dictionaries/${language}/words?letter=${letter || ''}&page=${Math.max(1, pagination.page - 1)}`}
                    className={`px-3 py-2 rounded-md border ${
                      pagination.page <= 1 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-muted'
                    }`}
                    aria-disabled={pagination.page <= 1}
                    tabIndex={pagination.page <= 1 ? -1 : undefined}
                  >
                    Previous
                  </Link>
                  <span className="text-sm text-muted-foreground">
                    Page {pagination.page} of {pagination.totalPages}
                  </span>
                  <Link
                    href={`/dictionaries/${language}/words?letter=${letter || ''}&page=${Math.min(pagination.totalPages, pagination.page + 1)}`}
                    className={`px-3 py-2 rounded-md border ${
                      pagination.page >= pagination.totalPages ? 'opacity-50 cursor-not-allowed' : 'hover:bg-muted'
                    }`}
                    aria-disabled={pagination.page >= pagination.totalPages}
                    tabIndex={pagination.page >= pagination.totalPages ? -1 : undefined}
                  >
                    Next
                  </Link>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </SharedLayout>
  );
}
