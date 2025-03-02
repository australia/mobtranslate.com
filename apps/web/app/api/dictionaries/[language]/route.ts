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
  const limit = parseInt(searchParams.get('limit') || '50', 10);
  const search = searchParams.get('search') || '';
  const sortBy = searchParams.get('sortBy') || 'word';
  const sortOrder = searchParams.get('sortOrder') || 'asc';
  
  try {
    const dictionary = await getDictionary(language);
    
    if (!dictionary) {
      console.error(`Dictionary for language '${language}' not found`);
      return NextResponse.json({ 
        success: false, 
        error: `Dictionary for language '${language}' not found` 
      }, { status: 404 });
    }
    
    // Filter words based on search query
    let filteredWords = dictionary.words;
    
    if (search) {
      const searchLower = search.toLowerCase();
      filteredWords = filteredWords.filter(word => {
        // Search in word
        if (word.word && word.word.toLowerCase().includes(searchLower)) return true;
        
        // Search in definition (string or array)
        if (typeof word.definition === 'string' && word.definition.toLowerCase().includes(searchLower)) return true;
        if (Array.isArray(word.definitions) && word.definitions.some(def => typeof def === 'string' && def.toLowerCase().includes(searchLower))) return true;
        
        // Search in translations
        if (Array.isArray(word.translations) && word.translations.some(trans => typeof trans === 'string' && trans.toLowerCase().includes(searchLower))) return true;
        
        // Search in examples
        if (typeof word.example === 'string' && word.example.toLowerCase().includes(searchLower)) return true;
        
        return false;
      });
    }
    
    // Sort the filtered words
    filteredWords.sort((a, b) => {
      const valueA = a[sortBy as keyof typeof a] || '';
      const valueB = b[sortBy as keyof typeof b] || '';
      
      if (typeof valueA === 'string' && typeof valueB === 'string') {
        return sortOrder === 'asc' 
          ? valueA.localeCompare(valueB) 
          : valueB.localeCompare(valueA);
      }
      
      return 0;
    });
    
    // If we have fewer than 3000 words total, return all of them
    // Otherwise, use pagination
    const totalWords = filteredWords.length;
    let paginatedWords = filteredWords;
    
    if (totalWords > 3000) {
      // Calculate pagination
      const startIndex = (page - 1) * limit;
      const endIndex = page * limit;
      paginatedWords = filteredWords.slice(startIndex, endIndex);
    }
    
    // Prepare pagination metadata
    const totalPages = totalWords > 3000 ? Math.ceil(totalWords / limit) : 1;
    
    return NextResponse.json({
      success: true,
      meta: dictionary.meta,
      data: paginatedWords,
      pagination: {
        total: totalWords,
        page,
        limit,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
      filters: {
        search,
        sortBy,
        sortOrder,
      },
    }, { status: 200 });
    
  } catch (error) {
    console.error(`Error fetching dictionary for ${language}:`, error);
    
    // Return a more detailed error message for debugging
    const errorMessage = error instanceof Error 
      ? error.message 
      : 'Unknown error fetching dictionary data';
      
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch dictionary data',
      details: errorMessage,
      language
    }, { status: 500 });
  }
}
