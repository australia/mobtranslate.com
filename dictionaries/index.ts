import yaml from 'js-yaml';
import fs from 'fs';
import path from 'path';
import kuku_yalanji from './kuku_yalanji/dictionary.js';
import migmaq from './migmaq/dictionary.js';
import anindilyakwa from './anindilyakwa/dictionary.js';

const dictionaries: Record<string, any> = {
  kuku_yalanji,
  migmaq,
  anindilyakwa
}

// Define supported language codes
export type LanguageCode = 'kuku_yalanji' | 'migmaq' | 'anindilyakwa';

// Define dictionary word type
export interface DictionaryWord {
  word: string;
  type?: string;
  definition?: string;
  definitions?: string[];
  translations?: string[];
  synonyms?: string[];
  example?: string;
  cultural_context?: string;
}

// Define dictionary metadata interface
export interface DictionaryMeta {
  name: string;
  description?: string;
  source?: string;
  region?: string;
  contributors?: string[];
  lastUpdated?: string;
}

// Define complete dictionary interface
export interface Dictionary {
  meta: DictionaryMeta;
  words: DictionaryWord[];
}

// Dictionary metadata
export const dictionaryMeta: Record<LanguageCode, DictionaryMeta> = {
  kuku_yalanji: {
    name: 'Kuku Yalanji',
    description: 'The Kuku Yalanji language is spoken by the Kuku Yalanji people of Far North Queensland, Australia.',
    region: 'Far North Queensland',
  },
  migmaq: {
    name: 'Mi\'gmaq',
    description: 'Mi\'gmaq is an Eastern Algonquian language spoken primarily in Eastern Canada and parts of the United States.',
    region: 'Eastern Canada, Northeastern United States',
  },
  anindilyakwa: {
    name: 'Anindilyakwa',
    description: 'Anindilyakwa is an Australian Aboriginal language spoken on Groote Eylandt in the Northern Territory.',
    region: 'Groote Eylandt, Northern Territory',
  }
};

/**
 * Process and return dictionary data for a given language code
 * @param language The language code
 * @returns Array of dictionary words
 */
const getDictionaryData = (language: LanguageCode): DictionaryWord[] => {
  try {
    const dictionaryString = dictionaries[language];
    if (!dictionaryString) {
      throw new Error(`Dictionary string not found for language: ${language}`);
    }
    
    // Parse the YAML string
    const parsedDictionary = yaml.load(dictionaryString) as { meta: DictionaryMeta, words: DictionaryWord[] };
    return parsedDictionary.words;
  } catch (error) {
    console.error(`Error parsing dictionary for ${language}:`, error);
    return [];
  }
};

/**
 * Returns a list of all supported languages with their metadata
 */
export function getSupportedLanguages(): { code: LanguageCode; meta: DictionaryMeta }[] {
  return Object.keys(dictionaryMeta).map((code) => ({
    code: code as LanguageCode,
    meta: dictionaryMeta[code as LanguageCode],
  }));
}

/**
 * Get the dictionary for a specific language
 * @param language The language code
 * @returns The dictionary object or null if not found
 */
export default async function getDictionary(language: string): Promise<Dictionary | null> {
  try {
    if (!Object.keys(dictionaryMeta).includes(language)) {
      console.error(`Language not supported: ${language}`);
      return null;
    }
    
    // Get the dictionary words
    const words = getDictionaryData(language as LanguageCode);
    
    if (!words) {
      throw new Error(`Words not found for language: ${language}`);
    }
    
    // Combine metadata and words
    return {
      meta: dictionaryMeta[language as LanguageCode],
      words
    };
  } catch (error) {
    console.error(`Error loading dictionary for ${language}:`, error);
    return null;
  }
}
