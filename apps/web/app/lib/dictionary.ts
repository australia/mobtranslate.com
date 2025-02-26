// Dictionary interfaces
export interface DictionaryWord {
  word: string;
  type: string;
  definition: string;
  example?: string;
  cultural_context?: string;
}

export interface Dictionary {
  name: string;
  description: string;
  words: DictionaryWord[];
}

// Define supported language codes
export type LanguageCode = 'kuku_yalanji' | 'migmaq' | 'anindilyakwa';

// Import the dictionary module
// Using alias path for better organization
import getDictionaryRaw from '@dictionaries/index';

// Dictionary language info
const languageInfo: Record<LanguageCode, { name: string; description: string }> = {
  kuku_yalanji: {
    name: 'Kuku Yalanji',
    description: 'Language traditionally spoken by the Kuku Yalanji people of the rainforest regions of Far North Queensland, Australia.'
  },
  migmaq: {
    name: 'Mi\'gmaq',
    description: 'Language of the Mi\'gmaq First Nations people, indigenous to the northeastern region of North America.'
  },
  anindilyakwa: {
    name: 'Anindilyakwa',
    description: 'Language spoken by the Anindilyakwa people of Groote Eylandt in the Northern Territory of Australia.'
  }
};

// Function to get dictionary data for a specific language
export function getDictionary(language: string): Dictionary {
  try {
    // Check if this is a supported language
    if (!isValidLanguageCode(language)) {
      throw new Error(`Unsupported language: "${language}"`);
    }
    
    // Get the dictionary data using the imported function
    const rawDictionary = getDictionaryRaw(language);
    
    // Make sure we handle any unexpected format
    if (!rawDictionary || !Array.isArray(rawDictionary.words)) {
      throw new Error(`Invalid dictionary format for "${language}"`);
    }
    
    // Format words to match our interface
    const formattedWords = rawDictionary.words.map(word => {
      // Ensure the definition is a string
      let definition = '';
      
      if (typeof word.definition === 'string') {
        definition = word.definition;
      } else if (Array.isArray(word.definitions)) {
        definition = word.definitions.join('\n');
      } else if (typeof word.definitions === 'string') {
        definition = word.definitions;
      }
      
      return {
        word: word.word,
        type: word.type || '',
        definition,
        // Pass through additional fields if they exist
        example: word.example,
        cultural_context: word.cultural_context
      };
    });
    
    // Convert to our interface format
    return {
      name: languageInfo[language as LanguageCode]?.name || language,
      description: languageInfo[language as LanguageCode]?.description || '',
      words: formattedWords
    };
  } catch (error) {
    console.error(`Error loading dictionary for "${language}":`, error);
    // Provide a fallback dictionary with error info
    return {
      name: languageInfo[language as LanguageCode]?.name || language,
      description: `Unable to load dictionary for ${language}. ${error instanceof Error ? error.message : String(error)}`,
      words: []
    };
  }
}

// Function to check if a language code is valid
function isValidLanguageCode(code: string): code is LanguageCode {
  return Object.keys(languageInfo).includes(code);
}

// Get list of supported languages
export function getSupportedLanguages() {
  return [
    {
      code: 'kuku_yalanji' as LanguageCode,
      name: 'Kuku Yalanji',
      description: 'Language traditionally spoken by the Kuku Yalanji people of the rainforest regions of Far North Queensland, Australia.'
    },
    {
      code: 'migmaq' as LanguageCode,
      name: 'Mi\'gmaq',
      description: 'Language of the Mi\'gmaq First Nations people, indigenous to the northeastern region of North America.'
    },
    {
      code: 'anindilyakwa' as LanguageCode,
      name: 'Anindilyakwa',
      description: 'Language spoken by the Anindilyakwa people of Groote Eylandt in the Northern Territory of Australia.'
    }
  ];
}
