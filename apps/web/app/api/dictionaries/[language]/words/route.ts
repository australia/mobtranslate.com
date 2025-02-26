import { NextRequest, NextResponse } from 'next/server';
import getDictionary from '@dictionaries';

export async function GET(
  request: NextRequest,
  { params }: { params: { language: string } }
) {
  const { language } = params;
  const searchParams = request.nextUrl.searchParams;
  
  // Extract query parameters for pagination and filtering
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = parseInt(searchParams.get('limit') || '100', 10);
  const letter = searchParams.get('letter') || '';
  const sortOrder = searchParams.get('sortOrder') || 'asc';
  
  try {
    const dictionary = await getDictionary(language);
    
    if (!dictionary) {
      return NextResponse.json({ 
        success: false, 
        error: `Dictionary for language '${language}' not found` 
      }, { status: 404 });
    }
    
    // Filter words if a letter is specified
    let filteredWords = dictionary.words;
    
    if (letter) {
      const letterUpper = letter.toUpperCase();
      filteredWords = filteredWords.filter(word => 
        word.word.charAt(0).toUpperCase() === letterUpper
      );
    }
    
    // Sort alphabetically
    filteredWords.sort((a, b) => {
      return sortOrder === 'asc' 
        ? a.word.localeCompare(b.word) 
        : b.word.localeCompare(a.word);
    });
    
    // Group words by first letter for alphabetical listing
    const wordsByLetter: Record<string, typeof filteredWords> = {};
    
    filteredWords.forEach(word => {
      const firstLetter = word.word.charAt(0).toUpperCase();
      if (!wordsByLetter[firstLetter]) {
        wordsByLetter[firstLetter] = [];
      }
      wordsByLetter[firstLetter].push(word);
    });
    
    // Get all available letters in the dictionary
    const availableLetters = Object.keys(wordsByLetter).sort();
    
    // Calculate pagination
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;
    const paginatedWords = filteredWords.slice(startIndex, endIndex);
    
    // Prepare pagination metadata
    const totalWords = filteredWords.length;
    const totalPages = Math.ceil(totalWords / limit);
    
    return NextResponse.json({
      success: true,
      meta: dictionary.meta,
      data: paginatedWords,
      wordsByLetter: letter ? wordsByLetter : undefined, // Only include when filtering by letter
      availableLetters,
      pagination: {
        total: totalWords,
        page,
        limit,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
      filters: {
        letter,
        sortOrder,
      },
    }, { status: 200 });
    
  } catch (error) {
    console.error(`Error fetching words for ${language}:`, error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch dictionary words',
    }, { status: 500 });
  }
}
