import { NextRequest } from 'next/server';
import { getActiveLanguages } from '@/lib/supabase/queries';

export async function GET(request: NextRequest) {
  try {
    const languages = await getActiveLanguages();

    return new Response(
      JSON.stringify({
        success: true,
        data: languages.map(lang => ({
          code: lang.code,
          meta: {
            name: lang.name,
            description: lang.description || '',
            region: lang.region || '',
          }
        })),
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
