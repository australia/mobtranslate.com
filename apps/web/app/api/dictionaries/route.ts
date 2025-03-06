import { NextRequest } from 'next/server';
import { getSupportedLanguages } from '@dictionaries';

export async function GET(request: NextRequest) {
  try {
    // Get languages with metadata
    const languages = getSupportedLanguages();

    return new Response(
      JSON.stringify({
        success: true,
        data: languages,
        count: languages.length,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  } catch (error) {
    console.error('Error fetching dictionaries:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Failed to fetch dictionaries',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}
