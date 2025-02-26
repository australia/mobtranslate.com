import { NextRequest, NextResponse } from 'next/server';
import { getSupportedLanguages } from '@dictionaries';

export async function GET(request: NextRequest) {
  try {
    // Get languages with metadata
    const languages = getSupportedLanguages();
    
    return NextResponse.json({
      success: true,
      data: languages,
      count: languages.length,
    }, { status: 200 });
  } catch (error) {
    console.error('Error fetching dictionaries:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch dictionaries',
    }, { status: 500 });
  }
}
