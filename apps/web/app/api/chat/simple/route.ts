import { streamText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { getSessionUser } from '@/lib/auth-helpers';
import {
  apiGuardResponse,
  enforceChatRequestLimit,
  enforceOpenAiProviderBudget,
} from '@/lib/api-rate-limit.server';

const MAX_CHAT_BODY_BYTES = 256 * 1024;
const MAX_CHAT_MESSAGES = 50;
const MAX_CHAT_TEXT_CHARS = 12_000;

export async function POST(req: Request) {
  try {
    const contentLength = Number(req.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > MAX_CHAT_BODY_BYTES) {
      return Response.json(
        { error: 'That conversation is too large.' },
        { status: 413, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    // Check authentication
    const user = await getSessionUser();

    if (!user) {
      return new Response('Unauthorized', {
        status: 401,
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    // Check if OpenAI API key is set
    if (!process.env.OPENAI_API_KEY) {
      console.error('OPENAI_API_KEY is not set');
      return Response.json(
        { error: 'The assistant is temporarily unavailable.' },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    // Construct the OpenAI provider lazily so the build doesn't need the key.
    const openai = createOpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const body = await req.json();
    const { messages } = body;
    if (!Array.isArray(messages) || messages.length === 0) {
      return Response.json(
        { error: 'Messages are required.' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    if (messages.length > MAX_CHAT_MESSAGES) {
      return Response.json(
        {
          error: `Keep the conversation to ${MAX_CHAT_MESSAGES} messages or fewer.`,
        },
        { status: 413, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    if (JSON.stringify(messages).length > MAX_CHAT_TEXT_CHARS) {
      return Response.json(
        { error: 'That conversation contains too much text.' },
        { status: 413, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    await enforceChatRequestLimit(req, user.id);
    await enforceOpenAiProviderBudget(req, user.id);

    // Simple stream without tools
    const result = streamText({
      model: openai('gpt-5.4-mini'),
      messages,
      system: 'You are a helpful language learning assistant.',
      maxRetries: 0,
    });

    return result.toUIMessageStreamResponse();
  } catch (error: any) {
    const guardResponse = apiGuardResponse(error);
    if (guardResponse) return guardResponse;
    console.error('Simple Chat API error:', error);

    return Response.json(
      { error: 'The assistant is temporarily unavailable.' },
      {
        status: 503,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }
}
