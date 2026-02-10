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

  if (error) {
    console.error('Error fetching language by code:', code, error);
    throw new Error(`Language '${code}' not found`);
  }
  
  if (!data) {
    throw new Error(`Language '${code}' not found`);
  }
  
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
  console.log('[getWordsForLanguage] Starting with params:', { language, page, limit });
  
  const supabase = createClient();
  
  // First get the language
  const languageData = await getLanguageByCode(language!);
  console.log('[getWordsForLanguage] Language data:', languageData);
  
  // Build the query with relations
  let query = supabase
    .from('words')
    .select(`
      *,
      word_class:word_classes(*)
    `, { count: 'exact' })
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
  
  console.log('[getWordsForLanguage] Query result:', { 
    wordCount: words?.length, 
    totalCount: count,
    error: error?.message 
  });

  if (error) {
    console.error('[getWordsForLanguage] Query error:', error);
    throw error;
  }

  // Use the count from the main query if available, otherwise do a separate count
  const totalCount = count || 0;

  // If we have words, fetch their definitions and examples
  if (words && words.length > 0) {
    const wordIds = words.map(w => w.id);
    
    // Fetch definitions with translations
    const { data: definitions } = await supabase
      .from('definitions')
      .select(`
        *,
        translations(*)
      `)
      .in('word_id', wordIds);

    // Fetch usage examples
    const { data: usageExamples } = await supabase
      .from('usage_examples')
      .select('*')
      .in('word_id', wordIds);

    // Map definitions and examples back to words
    const wordsWithRelations = words.map(word => ({
      ...word,
      definitions: definitions?.filter(d => d.word_id === word.id) || [],
      usage_examples: usageExamples?.filter(e => e.word_id === word.id) || []
    }));

    console.log('[getWordsForLanguage] Sample word with relations:', wordsWithRelations[0]);

    return {
      words: wordsWithRelations as Word[],
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
      definitions(
        *,
        translations(*)
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

export async function getLocationWordsForLanguage(languageCode: string) {
  const supabase = createClient();

  const languageData = await getLanguageByCode(languageCode);

  const { data: words, error } = await supabase
    .from('words')
    .select(`
      id,
      word,
      normalized_word,
      is_location,
      latitude,
      longitude,
      word_type,
      word_class:word_classes(name),
      definitions(definition)
    `)
    .eq('language_id', languageData.id)
    .eq('is_location', true)
    .not('latitude', 'is', null)
    .not('longitude', 'is', null)
    .order('word', { ascending: true });

  if (error) throw error;

  // Supabase returns word_class as array from join; normalize to single object
  const normalized = (words || []).map((w: any) => ({
    id: w.id as string,
    word: w.word as string,
    normalized_word: w.normalized_word as string | undefined,
    is_location: w.is_location as boolean,
    latitude: w.latitude as number,
    longitude: w.longitude as number,
    word_type: w.word_type as string | undefined,
    word_class: Array.isArray(w.word_class) ? w.word_class[0] : w.word_class,
    definitions: w.definitions as Array<{ definition: string }> | undefined,
  }));

  return {
    words: normalized,
    language: languageData,
  };
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