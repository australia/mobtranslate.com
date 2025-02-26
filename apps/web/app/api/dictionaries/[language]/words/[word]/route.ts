import { NextRequest, NextResponse } from 'next/server';
import getDictionary from '@dictionaries';

export async function GET(
  request: NextRequest,
  { params }: { params: { language: string; word: string } }
) {
  const { language, word } = params;
  
  try {
    const dictionary = await getDictionary(language);
    
    if (!dictionary) {
      return NextResponse.json({ 
        success: false, 
        error: `Dictionary for language '${language}' not found` 
      }, { status: 404 });
    }
    
    // Find the specific word
    const wordData = dictionary.words.find(w => 
      w.word.toLowerCase() === decodeURIComponent(word).toLowerCase()
    );
    
    if (!wordData) {
      return NextResponse.json({ 
        success: false, 
        error: `Word '${word}' not found in dictionary for language '${language}'` 
      }, { status: 404 });
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
    
    return NextResponse.json({
      success: true,
      meta: dictionary.meta,
      data: wordData,
      relatedWords,
    }, { status: 200 });
    
  } catch (error) {
    console.error(`Error fetching word '${word}' for ${language}:`, error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch word data',
    }, { status: 500 });
  }
}
