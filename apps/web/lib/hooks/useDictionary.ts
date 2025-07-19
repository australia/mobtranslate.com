'use client';

import useSWR from 'swr';
import type { Word, Language, DictionaryQueryParams } from '@/lib/supabase/types';

const fetcher = (url: string) => fetch(url).then(res => res.json());

interface DictionaryResponse {
  words: Word[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
  language: Language;
}

export function useDictionary(params: DictionaryQueryParams) {
  const searchParams = new URLSearchParams();
  
  if (params.search) searchParams.append('search', params.search);
  if (params.page) searchParams.append('page', params.page.toString());
  if (params.limit) searchParams.append('limit', params.limit.toString());
  if (params.sortBy) searchParams.append('sortBy', params.sortBy);
  if (params.sortOrder) searchParams.append('sortOrder', params.sortOrder);
  if (params.wordClass) searchParams.append('wordClass', params.wordClass);
  if (params.letter) searchParams.append('letter', params.letter);

  const queryString = searchParams.toString();
  const url = `/api/v2/dictionaries/${params.language}${queryString ? `?${queryString}` : ''}`;

  const { data, error, isLoading, mutate } = useSWR<DictionaryResponse>(
    params.language ? url : null,
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 60000, // 1 minute
    }
  );

  return {
    words: data?.words,
    language: data?.language,
    pagination: data?.pagination,
    isLoading,
    isError: error,
    mutate
  };
}

export function useWord(wordId: string) {
  const { data, error, isLoading } = useSWR<Word>(
    wordId ? `/api/v2/words/${wordId}` : null,
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    }
  );

  return {
    word: data,
    isLoading,
    isError: error
  };
}

export function useLanguages() {
  const { data, error, isLoading } = useSWR<Language[]>(
    '/api/v2/languages',
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 3600000, // 1 hour
    }
  );

  return {
    languages: data,
    isLoading,
    isError: error
  };
}

export function useSearch(searchTerm: string, languageCode?: string) {
  const searchParams = new URLSearchParams();
  if (languageCode) searchParams.append('language', languageCode);
  
  const queryString = searchParams.toString();
  const url = `/api/v2/search?q=${encodeURIComponent(searchTerm)}${queryString ? `&${queryString}` : ''}`;

  const { data, error, isLoading } = useSWR<Word[]>(
    searchTerm.length >= 2 ? url : null,
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 10000, // 10 seconds
    }
  );

  return {
    results: data,
    isLoading,
    isError: error
  };
}