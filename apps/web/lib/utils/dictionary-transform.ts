import type { Word } from '@/lib/supabase/types';

export interface TransformedDictionaryWord {
  word: string;
  type?: string;
  definitions?: string[];
  translations?: string[];
  definition?: string;
  example?: string;
  phonetic?: string;
  notes?: string;
  culturalContext?: string;
}

export function transformWordForUI(word: Word): TransformedDictionaryWord {
  // Extract simple string values from complex objects
  const firstDefinition = word.definitions?.[0];
  const definitionText = typeof firstDefinition === 'string' 
    ? firstDefinition 
    : firstDefinition?.definition || '';
    
  const definitionsArray = word.definitions?.map(d => 
    typeof d === 'string' ? d : d.definition
  ).filter(Boolean) || [];
  
  const translationsArray = word.definitions?.flatMap(d => {
    if (typeof d === 'string') return [];
    return d.translations?.map(t => 
      typeof t === 'string' ? t : t.translation
    ) || [];
  }) || [];
  
  const exampleText = word.usage_examples?.[0];
  const example = typeof exampleText === 'string'
    ? exampleText
    : exampleText?.example_text;
    
  return {
    word: word.word,
    type: word.word_type || word.word_class?.name,
    definitions: definitionsArray,
    translations: translationsArray,
    definition: definitionText,
    example: example,
    phonetic: word.phonetic_transcription,
    notes: word.notes,
    culturalContext: word.cultural_contexts?.[0]?.context_description
  };
}

export function transformWordsForUI(words: Word[]): TransformedDictionaryWord[] {
  return words.map(transformWordForUI);
}