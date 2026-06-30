import { streamText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { getSessionUser } from '@/lib/auth-helpers';

export async function POST(req: Request) {
  try {
    // Check authentication
    const user = await getSessionUser();

    if (!user) {
      return new Response('Unauthorized', { status: 401 });
    }

    // Check if OpenAI API key is set
    if (!process.env.OPENAI_API_KEY) {
      console.error('OPENAI_API_KEY is not set');
      return new Response('OpenAI API key not configured', { status: 500 });
    }

    // Construct the OpenAI provider lazily so the build doesn't need the key.
    const openai = createOpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const body = await req.json();
    const { messages } = body;

    // Simple stream without tools
    const result = streamText({
      model: openai('gpt-5.4-mini'),
      messages,
      system: 'You are a helpful language learning assistant.',
    });

    return result.toUIMessageStreamResponse();

  } catch (error: any) {
    console.error('Simple Chat API error:', error);

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
