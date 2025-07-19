import { createClient } from '@/lib/supabase/server';
import type { Word, Language, DictionaryQueryParams } from './types';

export async function getLanguageByCode(code: string) {
  const supabase = createClient();
  
  const { data, error } = await supabase
    .from('languages')
    .select('*')
    .eq('code', code)
    .eq('is_active', true)
    .single();

  if (error) throw error;
  return data as Language;
}

export async function getWordsForLanguage({
  language,
  search,
  page = 1,
  limit = 50,
  sortBy = 'word',
  sortOrder = 'asc',
  wordClass,
  letter
}: DictionaryQueryParams) {
  const supabase = createClient();
  
  // First get the language
  const languageData = await getLanguageByCode(language!);
  
  // Build the query
  let query = supabase
    .from('words')
    .select(`
      *,
      word_class:word_classes(*),
      definitions!inner(
        *,
        translations:translations(*)
      ),
      usage_examples(*),
      cultural_contexts(*)
    `)
    .eq('language_id', languageData.id);

  // Apply search filter
  if (search) {
    query = query.or(`word.ilike.%${search}%,normalized_word.ilike.%${search}%`);
  }

  // Apply word class filter
  if (wordClass) {
    const { data: wordClassData } = await supabase
      .from('word_classes')
      .select('id')
      .eq('code', wordClass)
      .single();
    
    if (wordClassData) {
      query = query.eq('word_class_id', wordClassData.id);
    }
  }

  // Apply letter filter
  if (letter) {
    query = query.ilike('word', `${letter}%`);
  }

  // Apply sorting
  if (sortBy === 'word') {
    query = query.order('normalized_word', { ascending: sortOrder === 'asc' });
  } else {
    query = query.order(sortBy, { ascending: sortOrder === 'asc' });
  }

  // Apply pagination
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  query = query.range(from, to);

  const { data: words, error, count } = await query;

  if (error) throw error;

  // Get total count for pagination
  const { count: totalCount } = await supabase
    .from('words')
    .select('*', { count: 'exact', head: true })
    .eq('language_id', languageData.id)
    .then(res => ({ count: res.count || 0 }));

  return {
    words: words as Word[],
    pagination: {
      total: totalCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit),
      hasNext: page * limit < totalCount,
      hasPrev: page > 1
    },
    language: languageData
  };
}

export async function getWordById(wordId: string) {
  const supabase = createClient();
  
  const { data, error } = await supabase
    .from('words')
    .select(`
      *,
      word_class:word_classes(*),
      definitions(
        *,
        translations:translations(*)
      ),
      usage_examples(*),
      cultural_contexts(*),
      language:languages(*)
    `)
    .eq('id', wordId)
    .single();

  if (error) throw error;
  return data as Word;
}

export async function searchWords(searchTerm: string, languageCode?: string) {
  const supabase = createClient();
  
  let query = supabase
    .from('words')
    .select(`
      *,
      word_class:word_classes(*),
      definitions!inner(
        *,
        translations:translations(*)
      ),
      language:languages(*)
    `)
    .or(`word.ilike.%${searchTerm}%,normalized_word.ilike.%${searchTerm}%`);

  if (languageCode) {
    const languageData = await getLanguageByCode(languageCode);
    query = query.eq('language_id', languageData.id);
  }

  query = query.limit(20);

  const { data, error } = await query;

  if (error) throw error;
  return data as Word[];
}

export async function getActiveLanguages() {
  const supabase = createClient();
  
  const { data, error } = await supabase
    .from('languages')
    .select('*')
    .eq('is_active', true)
    .order('name');

  if (error) throw error;
  return data as Language[];
}

export async function getWordClasses() {
  const supabase = createClient();
  
  const { data, error } = await supabase
    .from('word_classes')
    .select('*')
    .order('sort_order');

  if (error) throw error;
  return data;
}