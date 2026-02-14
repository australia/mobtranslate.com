'use client';

import React, { useState, useCallback, useTransition, useMemo } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardContent } from '@mobtranslate/ui';
import { Badge, Button } from '@mobtranslate/ui';
import { SearchInput } from '@ui/components/SearchInput';
import { EmptyState } from '@ui/components/EmptyState';
import { LoadingState } from '@/components/layout/LoadingState';
import { DictionaryTableWithLikes } from '@/components/DictionaryTableWithLikes';
import { useDictionary } from '@/lib/hooks/useDictionary';
import type { DictionaryQueryParams } from '@/lib/supabase/types';
import { transformWordsForUI } from '@/lib/utils/dictionary-transform';

interface DictionaryWord {
  id: string;
  word: string;
  definition?: string;
  definitions?: string[];
  type?: string;
  translations?: string[];
  example?: string;
  phonetic?: string;
  notes?: string;
  culturalContext?: string;
}

interface DictionaryMeta {
  name: string;
  description: string;
  region: string;
  code: string;
}

interface DictionarySearchProps {
  dictionary: {
    meta: DictionaryMeta;
    words: DictionaryWord[];
  };
  initialSearch?: string;
  pagination?: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
  currentPage?: number;
}

export default function DictionarySearch({ 
  dictionary, 
  initialSearch = '', 
  pagination,
  currentPage: _currentPage = 1
}: DictionarySearchProps) {
  const [search, setSearch] = useState(initialSearch);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  
  const { meta, words: initialWords } = dictionary;

  // Use SWR for client-side updates when filters change
  const queryParams: DictionaryQueryParams = {
    language: meta.code,
    search: searchParams.get('search') || undefined,
    page: parseInt(searchParams.get('page') || '1', 10),
    limit: parseInt(searchParams.get('limit') || '50', 10),
    sortBy: (searchParams.get('sortBy') as DictionaryQueryParams['sortBy']) || 'word',
    sortOrder: (searchParams.get('sortOrder') as DictionaryQueryParams['sortOrder']) || 'asc',
    wordClass: searchParams.get('wordClass') || undefined,
    letter: searchParams.get('letter') || undefined,
  };

  const { words: swrWords, pagination: swrPagination, isLoading } = useDictionary(queryParams);

  // Transform SWR words if available
  const transformedSwrWords = useMemo(() => {
    return swrWords ? transformWordsForUI(swrWords) : null;
  }, [swrWords]);

  // Use SWR data if available, otherwise use SSR data
  const words = transformedSwrWords || initialWords;
  const currentPagination = swrPagination || pagination;

  const handleSearch = useCallback((value: string) => {
    setSearch(value);
    const params = new URLSearchParams(searchParams);
    
    if (value) {
      params.set('search', value);
      params.set('page', '1'); // Reset to first page on new search
    } else {
      params.delete('search');
    }
    
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }, [pathname, router, searchParams]);

  const handlePageChange = useCallback((page: number) => {
    const params = new URLSearchParams(searchParams);
    params.set('page', page.toString());
    
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }, [pathname, router, searchParams]);

  const handleWordClick = (word: string) => {
    router.push(`/dictionaries/${meta.code}/words/${encodeURIComponent(word)}`);
  };

  const isLoadingOrPending = isLoading || isPending;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <CardTitle>Search Dictionary</CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="outline">{words.length} displayed</Badge>
              {currentPagination && (
                <Badge variant="outline">{currentPagination.total} total</Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <SearchInput
            placeholder={`Search ${meta.name} words...`}
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="w-full"
          />
        </CardContent>
      </Card>

      {isLoadingOrPending ? (
        <LoadingState />
      ) : words.length === 0 ? (
        <EmptyState
          title="No words found"
          description={search ? `No words matching "${search}" in the ${meta.name} dictionary.` : `No words available in the ${meta.name} dictionary yet.`}
          action={
            search ? (
              <Button onClick={() => handleSearch('')} variant="outline">
                Clear search
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <DictionaryTableWithLikes 
            words={words}
            onWordClick={handleWordClick}
          />
          
          {currentPagination && currentPagination.totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-6">
              <Button
                variant="outline"
                onClick={() => handlePageChange(currentPagination.page - 1)}
                disabled={!currentPagination.hasPrev || isLoadingOrPending}
              >
                Previous
              </Button>
              <div className="flex items-center gap-2 px-4">
                <span className="text-sm text-muted-foreground">
                  Page {currentPagination.page} of {currentPagination.totalPages}
                </span>
              </div>
              <Button
                variant="outline"
                onClick={() => handlePageChange(currentPagination.page + 1)}
                disabled={!currentPagination.hasNext || isLoadingOrPending}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}