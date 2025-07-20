import { streamText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createClient } from '@/lib/supabase/server';

// Create OpenAI provider
const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  console.log('Simple Chat API called');
  
  try {
    const supabase = createClient();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    console.log('Auth check:', { user: user?.id, authError });
    
    if (authError || !user) {
      console.error('Auth failed:', authError);
      return new Response('Unauthorized', { status: 401 });
    }

    // Check if OpenAI API key is set
    if (!process.env.OPENAI_API_KEY) {
      console.error('OPENAI_API_KEY is not set');
      return new Response('OpenAI API key not configured', { status: 500 });
    }

    const body = await req.json();
    console.log('Request body:', { messageCount: body.messages?.length });
    
    const { messages } = body;

    console.log('Creating simple stream...');

    // Simple stream without tools
    const result = streamText({
      model: openai('gpt-4o-mini'),
      messages,
      system: 'You are a helpful language learning assistant.',
    });

    console.log('Simple stream created successfully');
    return result.toDataStreamResponse();
    
  } catch (error: any) {
    console.error('Simple Chat API error:', error);
    console.error('Error details:', {
      name: error?.name,
      message: error?.message,
      stack: error?.stack
    });
    
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error', 
        details: error?.message || 'Unknown error' 
      }), 
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}