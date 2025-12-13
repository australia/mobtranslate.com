export interface Language {
  id: string;
  code: string;
  name: string;
  native_name: string;
  description?: string;
  region?: string;
  country?: string;
  status?: string;
  family?: string;
  writing_system?: string;
  is_active: boolean;
}

export interface WordClass {
  id: string;
  code: string;
  name: string;
  abbreviation?: string;
  description?: string;
  parent_id?: string;
  sort_order?: number;
}

export interface Word {
  id: string;
  language_id: string;
  word: string;
  normalized_word?: string;
  phonetic_transcription?: string;
  word_class_id?: string;
  word_type?: string;
  gender?: string;
  number?: string;
  stem?: string;
  is_loan_word?: boolean;
  loan_source_language?: string;
  frequency_score?: number;
  register?: string;
  domain?: string;
  dialectal_variation?: boolean;
  obsolete?: boolean;
  sensitive_content?: boolean;
  notes?: string;
  metadata?: Record<string, any>;
  created_at?: string;
  updated_at?: string;
  word_class?: WordClass;
  definitions?: Definition[];
  translations?: Translation[];
  usage_examples?: UsageExample[];
  cultural_contexts?: CulturalContext[];
}

export interface Definition {
  id: string;
  word_id: string;
  definition: string;
  definition_number?: number;
  context?: string;
  register?: string;
  domain?: string;
  is_primary?: boolean;
  notes?: string;
  translations?: Translation[];
}

export interface Translation {
  id: string;
  word_id: string;
  definition_id?: string;
  translation: string;
  target_language?: string;
  translation_type?: string;
  is_primary?: boolean;
  notes?: string;
}

export interface UsageExample {
  id: string;
  word_id: string;
  definition_id?: string;
  example_text: string;
  translation?: string;
  transliteration?: string;
  context?: string;
  source?: string;
  notes?: string;
}

export interface CulturalContext {
  id: string;
  word_id: string;
  context_description: string;
  cultural_significance?: string;
  usage_restrictions?: string;
  ceremonial_use?: boolean;
  gender_specific?: boolean;
  age_specific?: boolean;
  sacred_or_taboo?: string;
  notes?: string;
}

export interface DictionaryQueryParams {
  language?: string;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: 'word' | 'created_at' | 'frequency_score';
  sortOrder?: 'asc' | 'desc';
  wordClass?: string;
  letter?: string;
}