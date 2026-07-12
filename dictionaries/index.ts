import yaml from 'js-yaml';
import fs from 'fs';
import path from 'path';
import kuku_yalanji from './kuku_yalanji/dictionary.js';
import migmaq from './migmaq/dictionary.js';
import anindilyakwa from './anindilyakwa/dictionary.js';
import woiwurrung from './woiwurrung/dictionary.js';
import gamilaraay from './gamilaraay/dictionary.js';
import anguthimri from './anguthimri/dictionary.js';
import eastern_arrernte from './eastern_arrernte/dictionary.js';
import pitjantjatjara from './pitjantjatjara/dictionary.js';

const dictionaries: Record<string, any> = {
  kuku_yalanji,
  migmaq,
  anindilyakwa,
  woiwurrung,
  gamilaraay,
  anguthimri,
  eastern_arrernte,
  pitjantjatjara
}

// Define supported language codes
export type LanguageCode =
  | 'kuku_yalanji' | 'migmaq' | 'anindilyakwa'
  | 'woiwurrung' | 'gamilaraay' | 'anguthimri' | 'eastern_arrernte' | 'pitjantjatjara';

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
  },
  woiwurrung: {
    name: 'Woiwurrung',
    description: 'Woiwurrung is a Kulin (Pama-Nyungan) language of the Woi-wurrung people of the Yarra River basin around Melbourne, Victoria. Sourced from Wiktionary (CC-BY-SA 4.0).',
    region: 'Yarra Valley & Melbourne, Victoria',
  },
  gamilaraay: {
    name: 'Gamilaraay',
    description: 'Gamilaraay (Kamilaroi) is a Pama-Nyungan language of north-central New South Wales. Sourced from Wiktionary (CC-BY-SA 4.0).',
    region: 'North-central New South Wales',
  },
  anguthimri: {
    name: 'Anguthimri',
    description: 'Anguthimri is a Paman (Pama-Nyungan) language of western Cape York Peninsula, Queensland. Sourced from Wiktionary (CC-BY-SA 4.0).',
    region: 'Western Cape York Peninsula, Queensland',
  },
  eastern_arrernte: {
    name: 'Eastern Arrernte',
    description: 'Eastern Arrernte (Eastern Aranda) is an Arandic (Pama-Nyungan) language of the Alice Springs region, Central Australia. Sourced from Wiktionary (CC-BY-SA 4.0).',
    region: 'Alice Springs region, Northern Territory',
  },
  pitjantjatjara: {
    name: 'Pitjantjatjara',
    description: 'Pitjantjatjara is a Western Desert (Pama-Nyungan) language of the APY Lands in northern South Australia and adjacent NT/WA. Sourced from Wiktionary (CC-BY-SA 4.0).',
    region: 'APY Lands, northern South Australia',
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
      console.error(`Dictionary string not found for language: ${language}`);
      return [];
    }
    
    // Parse the YAML string
    let parsedDictionary;
    try {
      parsedDictionary = yaml.load(dictionaryString) as { meta: DictionaryMeta, words: DictionaryWord[] };
      
      if (!parsedDictionary || !Array.isArray(parsedDictionary.words)) {
        console.error(`Invalid dictionary format for ${language}, words array not found`);
        return [];
      }
      
      // Ensure all words have the required structure
      const words = parsedDictionary.words.map(word => {
        return {
          word: word.word || '',
          type: word.type || '',
          definition: word.definition || '',
          definitions: Array.isArray(word.definitions) ? word.definitions : [],
          translations: Array.isArray(word.translations) ? word.translations : [],
          synonyms: Array.isArray(word.synonyms) ? word.synonyms : [],
          example: word.example || '',
          cultural_context: word.cultural_context || ''
        };
      });
      
      return words;
    } catch (yamlError) {
      console.error(`Error parsing YAML for ${language}:`, yamlError);
      return [];
    }
  } catch (error) {
    console.error(`Error processing dictionary for ${language}:`, error);
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
 * Get the lexicon file for a specific language
 * @param language The language code or slug
 * @returns The lexicon content as a string or null if not found
 */
export function getLexicon(language: string): string | null {
  try {
    // Normalize the language code/slug
    const slug = language.toLowerCase().replace(' ', '_');
    
    // Check if this is a supported language
    if (!Object.keys(dictionaryMeta).includes(slug)) {
      console.error(`Language not supported for lexicon: ${language}`);
      return null;
    }
    
    // Get the lexicon file path using multiple possible locations
    // Try different paths to handle various environments (local dev, production, etc.)
    const possiblePaths = [
      // Direct path from current directory
      path.join(process.cwd(), 'dictionaries', slug, 'lexicon.jsonld'),
      // Path from monorepo root
      path.join(process.cwd(), '..', '..', 'dictionaries', slug, 'lexicon.jsonld'),
      // Path relative to this module
      path.join(__dirname, slug, 'lexicon.jsonld'),
      // If we're in the dist directory
      path.join(__dirname, '..', slug, 'lexicon.jsonld'),
      // Absolute path as a last resort
      path.resolve('/home/ajax/repos/mobtranslate.com/dictionaries', slug, 'lexicon.jsonld')
    ];
    
    // Find the first path that exists
    let lexiconPath = '';
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        lexiconPath = p;
        break;
      }
    }
    
    // If no path was found, use the first one for error reporting
    if (!lexiconPath) {
      lexiconPath = possiblePaths[0];
    }
    
    // Check if the file exists
    if (!fs.existsSync(lexiconPath)) {
      console.error(`Lexicon file not found at: ${lexiconPath}`);
      return null;
    }
    
    // Read and return the lexicon file
    return fs.readFileSync(lexiconPath, 'utf-8');
  } catch (error) {
    console.error(`Error loading lexicon for ${language}:`, error);
    return null;
  }
}

/**
 * Get the dictionary for a specific language
 * @param language The language code
 * @returns The dictionary object or null if not found
 */
async function getDictionary(language: string): Promise<Dictionary | null> {
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

// Default export
export default getDictionary;
