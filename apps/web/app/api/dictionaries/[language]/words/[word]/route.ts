import { NextRequest } from 'next/server';
import getDictionary from '@dictionaries';

export async function GET(
  request: NextRequest,
  { params }: { params: { language: string; word: string } }
) {
  const { language, word } = params;
  
  try {
    const dictionary = await getDictionary(language);
    
    if (!dictionary) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Dictionary for language '${language}' not found` 
        }), 
        { 
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    
    // Find the specific word
    const wordData = dictionary.words.find(w => 
      w.word.toLowerCase() === decodeURIComponent(word).toLowerCase()
    );
    
    if (!wordData) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Word '${word}' not found in dictionary for language '${language}'` 
        }), 
        { 
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    
    // Find related words (words with same type or synonyms)
    const relatedWords = dictionary.words
      .filter(w => {
        if (w.word === wordData.word) return false; // Skip the current word
        
        // Words with same type
        if (wordData.type && w.type && wordData.type === w.type) return true;
        
        // Words that are synonyms
        if (wordData.synonyms && wordData.synonyms.includes(w.word)) return true;
        if (w.synonyms && w.synonyms.includes(wordData.word)) return true;
        
        return false;
      })
      .slice(0, 5); // Limit to 5 related words
    
    return new Response(
      JSON.stringify({
        success: true,
        meta: dictionary.meta,
        data: wordData,
        relatedWords,
      }), 
      { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );
    
  } catch (error) {
    console.error(`Error fetching word '${word}' for ${language}:`, error);
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Failed to fetch word data',
        details: error instanceof Error ? error.message : 'Unknown error'
      }), 
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}
