import yaml from 'js-yaml';
import fs from 'fs';
import path from 'path';

// Define supported language codes
export type LanguageCode = 'kuku_yalanji' | 'migmaq' | 'anindilyakwa';

// Word interface for dictionary entries
export interface DictionaryWord {
  word: string;
  type: string;
  definition?: string;
  definitions?: string[] | string;
  example?: string;
  cultural_context?: string;
}

// Dictionary interface
export interface Dictionary {
  meta?: {
    name: string;
    description?: string;
  };
  words: DictionaryWord[];
}

// Mock dictionaries for development and build 
const mockDictionaries: Record<LanguageCode, Dictionary> = {
  kuku_yalanji: {
    meta: { name: 'Kuku Yalanji' },
    words: [
      {
        word: 'bada',
        type: 'adverb',
        definitions: ['downward', 'down'],
      },
      {
        word: 'baja',
        type: 'adverb',
        definitions: ['again', 'more'],
      }
    ]
  },
  migmaq: {
    meta: { name: 'Mi\'gmaq' },
    words: [
      {
        word: 'agase\'wa\'latl',
        type: 'verb animate transitive',
        definitions: ['hire'],
      }
    ]
  },
  anindilyakwa: {
    meta: { name: 'Anindilyakwa' },
    words: [
      {
        word: 'akina',
        type: 'pronoun',
        definitions: ['that', 'those'],
      }
    ]
  }
};

/**
 * Get dictionary data for a specific language
 * @param language The language code to get dictionary for
 * @returns Dictionary data
 */
const getDictionary = (language: string): Dictionary => {
  try {
    // Check if language is supported
    if (!(language in mockDictionaries)) {
      throw new Error(`Dictionary not found for language: ${language}`);
    }
    
    // For now, use mock data until we migrate the actual dictionary files to TypeScript
    const dictionaryData = mockDictionaries[language as LanguageCode];
    
    // Ensure the dictionary structure matches what the app expects
    if (!dictionaryData || !dictionaryData.words) {
      throw new Error(`Invalid dictionary format for language: ${language}`);
    }
    
    return dictionaryData;
  } catch (error) {
    console.error(`Error loading dictionary for "${language}":`, error);
    return {
      meta: { name: language },
      words: []
    };
  }
};

export default getDictionary;
