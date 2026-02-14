'use client';

import React, { useState, useCallback, useTransition, useMemo } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Badge, Button, cn } from '@mobtranslate/ui';
import { SearchInput } from '@ui/components/SearchInput';
import { EmptyState } from '@ui/components/EmptyState';
import { LoadingState } from '@/components/layout/LoadingState';
import { DictionaryTableWithLikes } from '@/components/DictionaryTableWithLikes';
import { useDictionary } from '@/lib/hooks/useDictionary';
import type { DictionaryQueryParams } from '@/lib/supabase/types';
import { transformWordsForUI } from '@/lib/utils/dictionary-transform';
import { Search, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, X } from 'lucide-react';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

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

  const activeLetter = searchParams.get('letter') || null;

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
      params.set('page', '1');
      params.delete('letter'); // Clear letter filter when searching
    } else {
      params.delete('search');
    }

    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }, [pathname, router, searchParams]);

  const handleLetterClick = useCallback((letter: string) => {
    const params = new URLSearchParams(searchParams);

    if (activeLetter === letter.toLowerCase()) {
      // Toggle off
      params.delete('letter');
    } else {
      params.set('letter', letter.toLowerCase());
      params.set('page', '1');
      params.delete('search'); // Clear search when filtering by letter
      setSearch('');
    }

    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }, [pathname, router, searchParams, activeLetter]);

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

  const clearFilters = useCallback(() => {
    setSearch('');
    startTransition(() => {
      router.push(pathname);
    });
  }, [pathname, router]);

  const isLoadingOrPending = isLoading || isPending;
  const hasActiveFilters = !!activeLetter || !!search;

  // Generate page numbers for pagination
  const getPageNumbers = () => {
    if (!currentPagination) return [];
    const { page, totalPages } = currentPagination;
    const pages: (number | 'ellipsis')[] = [];

    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (page > 3) pages.push('ellipsis');
      for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) {
        pages.push(i);
      }
      if (page < totalPages - 2) pages.push('ellipsis');
      pages.push(totalPages);
    }
    return pages;
  };

  return (
    <div className="space-y-4">
      {/* Search & Filter Bar */}
      <div className="rounded-xl border bg-card overflow-hidden">
        {/* Search input row */}
        <div className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex-1 relative">
              <SearchInput
                placeholder={`Search ${meta.name} words...`}
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
                className="w-full"
              />
            </div>
            <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground">
              {currentPagination && (
                <span>{currentPagination.total.toLocaleString()} words</span>
              )}
            </div>
          </div>
        </div>

        {/* Alphabet strip */}
        <div className="border-t px-4 py-2.5 bg-muted/30">
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground mr-1 hidden sm:block">Browse:</span>
            <div className="flex flex-wrap gap-0.5">
              {ALPHABET.map((letter) => (
                <button
                  key={letter}
                  onClick={() => handleLetterClick(letter)}
                  className={cn(
                    'w-7 h-7 sm:w-8 sm:h-8 rounded-md text-xs sm:text-sm font-medium transition-all duration-150',
                    activeLetter === letter.toLowerCase()
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  )}
                >
                  {letter}
                </button>
              ))}
            </div>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="ml-2 flex items-center gap-1 px-2 py-1 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <X className="w-3 h-3" />
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Active filter indicator */}
      {hasActiveFilters && (
        <div className="flex items-center gap-2 text-sm">
          {activeLetter && (
            <Badge variant="secondary" className="gap-1">
              Letter: {activeLetter.toUpperCase()}
              <button onClick={() => handleLetterClick(activeLetter)} className="ml-1 hover:text-foreground">
                <X className="w-3 h-3" />
              </button>
            </Badge>
          )}
          {search && (
            <Badge variant="secondary" className="gap-1">
              Search: &ldquo;{search}&rdquo;
              <button onClick={() => handleSearch('')} className="ml-1 hover:text-foreground">
                <X className="w-3 h-3" />
              </button>
            </Badge>
          )}
          <span className="text-muted-foreground">
            {words.length} result{words.length !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      {/* Content */}
      {isLoadingOrPending ? (
        <LoadingState />
      ) : words.length === 0 ? (
        <EmptyState
          title="No words found"
          description={search ? `No words matching "${search}" in the ${meta.name} dictionary.` : `No words available in the ${meta.name} dictionary yet.`}
          action={
            hasActiveFilters ? (
              <Button onClick={clearFilters} variant="outline">
                Clear filters
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

          {/* Pagination */}
          {currentPagination && currentPagination.totalPages > 1 && (
            <div className="flex items-center justify-between gap-4 pt-2">
              <p className="text-sm text-muted-foreground hidden sm:block">
                Showing {((currentPagination.page - 1) * currentPagination.limit) + 1}&ndash;{Math.min(currentPagination.page * currentPagination.limit, currentPagination.total)} of {currentPagination.total.toLocaleString()}
              </p>

              <div className="flex items-center gap-1 mx-auto sm:mx-0">
                {/* First page */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handlePageChange(1)}
                  disabled={currentPagination.page === 1 || isLoadingOrPending}
                  className="hidden sm:flex w-8 h-8 p-0"
                >
                  <ChevronsLeft className="w-4 h-4" />
                </Button>

                {/* Previous */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handlePageChange(currentPagination.page - 1)}
                  disabled={!currentPagination.hasPrev || isLoadingOrPending}
                  className="w-8 h-8 p-0"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>

                {/* Page numbers */}
                {getPageNumbers().map((pageNum, i) => (
                  pageNum === 'ellipsis' ? (
                    <span key={`ellipsis-${i}`} className="w-8 h-8 flex items-center justify-center text-muted-foreground text-sm">
                      &hellip;
                    </span>
                  ) : (
                    <button
                      key={pageNum}
                      onClick={() => handlePageChange(pageNum)}
                      disabled={isLoadingOrPending}
                      className={cn(
                        'w-8 h-8 rounded-md text-sm font-medium transition-colors',
                        currentPagination.page === pageNum
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                      )}
                    >
                      {pageNum}
                    </button>
                  )
                ))}

                {/* Next */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handlePageChange(currentPagination.page + 1)}
                  disabled={!currentPagination.hasNext || isLoadingOrPending}
                  className="w-8 h-8 p-0"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>

                {/* Last page */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handlePageChange(currentPagination.totalPages)}
                  disabled={currentPagination.page === currentPagination.totalPages || isLoadingOrPending}
                  className="hidden sm:flex w-8 h-8 p-0"
                >
                  <ChevronsRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
