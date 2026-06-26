import { NextRequest, NextResponse } from 'next/server';
import { OpenAI } from 'openai';
import { asc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import {
  definitions as definitionsT,
  languages as languagesT,
  translations as translationsT,
  words as wordsT,
} from '@/lib/db/schema';
import { logTranslationRequest } from '@/lib/usage-log';
import { getSessionUser } from '@/lib/auth-helpers';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Lazily construct the OpenAI client inside the handler so the build doesn't
// require OPENAI_API_KEY at module load.
let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}

interface DictionaryMeta {
  name: string;
  description?: string;
  region?: string;
  code: string;
}

interface GlossEntry {
  word: string;
  gloss: string;
}

interface Dictionary {
  meta: DictionaryMeta;
  words: GlossEntry[];
}

// ---------------------------------------------------------------------------
// Full-dictionary loader (cached). Translation quality depends on the model
// actually seeing the whole word list — e.g. "woman" → "jalbu" only works if
// jalbu is in the prompt. We load every entry (de-duped by headword, senses
// merged) once per language and cache it, rather than a 500-row slice.
// ---------------------------------------------------------------------------
const DICT_TTL = 60 * 60 * 1000; // 1h
const dictCache = new Map<string, { at: number; dictionary: Dictionary }>();

async function loadDictionary(language: string): Promise<Dictionary | null> {
  const cached = dictCache.get(language);
  if (cached && Date.now() - cached.at < DICT_TTL) return cached.dictionary;

  const langRows = await db
    .select({
      id: languagesT.id,
      name: languagesT.name,
      description: languagesT.description,
      region: languagesT.region,
      code: languagesT.code,
    })
    .from(languagesT)
    .where(eq(languagesT.code, language))
    .limit(1);
  const lang = langRows[0];
  if (!lang) return null;

  // Load the whole dictionary: every word + its definitions + translations.
  const wordRows = await db
    .select({ id: wordsT.id, word: wordsT.word })
    .from(wordsT)
    .where(eq(wordsT.languageId, lang.id))
    .orderBy(asc(wordsT.word));

  const wordIds = wordRows.map((w) => w.id);

  // De-dupe by headword, merging glosses (translations + definitions) across senses.
  const byWord = new Map<string, Set<string>>();
  if (wordIds.length > 0) {
    const wordById = new Map(wordRows.map((w) => [w.id, (w.word || '').trim()]));

    // Pull defs + translations in chunks to stay within parameter limits.
    const CHUNK = 5000;
    const defsByWordId = new Map<string, string[]>();
    const transByWordId = new Map<string, string[]>();
    for (let i = 0; i < wordIds.length; i += CHUNK) {
      const slice = wordIds.slice(i, i + CHUNK);
      const [defs, trans] = await Promise.all([
        db
          .select({ wordId: definitionsT.wordId, definition: definitionsT.definition })
          .from(definitionsT)
          .where(inArray(definitionsT.wordId, slice)),
        db
          .select({ wordId: translationsT.wordId, translation: translationsT.translation })
          .from(translationsT)
          .where(inArray(translationsT.wordId, slice)),
      ]);
      for (const d of defs) {
        const arr = defsByWordId.get(d.wordId) ?? [];
        arr.push(d.definition);
        defsByWordId.set(d.wordId, arr);
      }
      for (const t of trans) {
        const arr = transByWordId.get(t.wordId) ?? [];
        arr.push(t.translation);
        transByWordId.set(t.wordId, arr);
      }
    }

    for (const id of wordIds) {
      const key = wordById.get(id) || '';
      if (!key) continue;
      if (!byWord.has(key)) byWord.set(key, new Set());
      const set = byWord.get(key)!;
      transByWordId.get(id)?.forEach((t) => t && set.add(t.trim()));
      defsByWordId.get(id)?.forEach((d) => d && set.add(d.trim()));
    }
  }

  const words: GlossEntry[] = [...byWord.entries()]
    .map(([word, glosses]) => {
      // Keep the prompt compact: cap a single entry's gloss length.
      let gloss = [...glosses].join('; ');
      if (gloss.length > 160) gloss = gloss.slice(0, 157) + '…';
      return { word, gloss };
    })
    .sort((a, b) => a.word.localeCompare(b.word));

  const dictionary: Dictionary = {
    meta: { name: lang.name, description: lang.description || '', region: lang.region || '', code: lang.code },
    words,
  };
  dictCache.set(language, { at: Date.now(), dictionary });
  return dictionary;
}

function glossaryBlock(dictionary: Dictionary): string {
  return dictionary.words.map((w) => `${w.word}: ${w.gloss}`).join('\n');
}

const createTranslationPrompt = (text: string, dictionary: Dictionary) => `
You are a skilled translator and cultural expert specializing in ${dictionary.meta.name}, with a deep understanding of its cultural and linguistic nuances.

This is the COMPLETE ${dictionary.meta.name} dictionary (${dictionary.words.length} headwords). Treat it as authoritative — if a word appears here, use it; do not claim a word is missing if it is listed below.

=== ${dictionary.meta.name} DICTIONARY (word: English meanings) ===
${glossaryBlock(dictionary)}
=== END DICTIONARY ===

User Input:
"${text}"

Guidelines:
1. FIRST, determine if the user wants a translation or a creative request (poem, story, greeting…).
2. FOR TRANSLATIONS:
   - Look up each English word in the dictionary above and use the listed ${dictionary.meta.name} word. (E.g. if "woman" maps to a headword, use it.)
   - Only when no entry fits, choose the closest culturally appropriate option and say so.
   - Preserve tone, meaning, and intent.
3. FOR CREATIVE REQUESTS: create the content in ${dictionary.meta.name} using dictionary words, then give an English translation. Use markdown.
4. FOR QUESTIONS about the language/culture: answer from the dictionary and your knowledge.

After your translation/creation, add a "### Translation Notes:" section: key word choices, a word-by-word breakdown, notable linguistic features, cultural context, and any substitutions (with reasoning). Keep it accurate — never invent entries, and never say a word is absent if it is in the dictionary above.
`;

const createConcisePrompt = (text: string, dictionary: Dictionary) => `
You translate English into ${dictionary.meta.name}, an Indigenous language.

This is the COMPLETE ${dictionary.meta.name} dictionary (${dictionary.words.length} headwords). If a word is listed here, use it.

=== DICTIONARY (word: English meanings) ===
${glossaryBlock(dictionary)}
=== END DICTIONARY ===

Translate this English text into ${dictionary.meta.name}:
"${text}"

Rules:
- Map each English word to its ${dictionary.meta.name} headword from the dictionary above wherever one exists.
- Only where none exists, choose the closest culturally appropriate option.
- Be concise. No explanations or markdown.
- Respond with ONLY a JSON object: {"translation": "<text in ${dictionary.meta.name}>", "gloss": "<short literal English back-translation>"}.
`;

export async function POST(request: NextRequest, props: { params: Promise<{ language: string }> }) {
  const params = await props.params;
  const startedAt = Date.now();
  // Who's asking (if signed in) — best-effort, never blocks the response.
  const userId = await getSessionUser().then((u) => u?.id ?? null).catch(() => null);
  let language = '';
  let body: { text?: string; stream?: boolean; mode?: string } = {};
  try {
    ({ language } = params);
    body = await request.json();
    const { text, stream = false, mode = 'chat' } = body;

    if (!text) {
      return NextResponse.json({ success: false, error: 'No text provided for translation' }, { status: 400 });
    }

    const dictionary = await loadDictionary(language);
    if (!dictionary || dictionary.words.length === 0) {
      return NextResponse.json(
        { success: false, error: `Dictionary for language '${language}' not found or empty` },
        { status: 404 },
      );
    }

    // Google-Translate pane: concise, structured, non-streaming.
    if (mode === 'translate') {
      const completion = await getOpenAI().chat.completions.create({
        model: 'gpt-4.1-mini',
        messages: [
          { role: 'system', content: `You are a precise translator for ${dictionary.meta.name}. Return only JSON.` },
          { role: 'user', content: createConcisePrompt(text, dictionary) },
        ],
        response_format: { type: 'json_object' },
      });

      const raw = completion.choices[0]?.message?.content || '{}';
      let parsed: { translation?: string; gloss?: string };
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = { translation: raw };
      }

      const translation = (parsed.translation || '').trim();
      const gloss = (parsed.gloss || '').trim();
      void logTranslationRequest({
        kind: 'translate',
        source: 'homepage',
        languageCode: dictionary.meta.code,
        inputText: text,
        outputText: translation,
        gloss,
        userId,
        model: 'gpt-4.1-mini',
        durationMs: Date.now() - startedAt,
      });

      return NextResponse.json({
        success: true,
        translation,
        gloss,
        language: { name: dictionary.meta.name, code: dictionary.meta.code },
      });
    }

    const prompt = createTranslationPrompt(text, dictionary);
    const systemPrompt = `You are a helpful translator specializing in ${dictionary.meta.name}. Use the provided dictionary entries to ensure accurate translations while maintaining cultural context.`;

    if (stream) {
      const streamResponse = await getOpenAI().chat.completions.create({
        model: 'gpt-4.1',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        stream: true,
      });

      const readable = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();
          let full = '';
          for await (const chunk of streamResponse) {
            const content = chunk.choices[0]?.delta?.content || '';
            if (content) {
              full += content;
              controller.enqueue(encoder.encode(content));
            }
          }
          controller.close();
          // Log the completed chat once the stream finishes.
          void logTranslationRequest({
            kind: 'chat',
            source: 'homepage',
            languageCode: dictionary.meta.code,
            inputText: text,
            outputText: full,
            userId,
            model: 'gpt-4.1',
            durationMs: Date.now() - startedAt,
          });
        },
      });

      return new Response(readable, {
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
      });
    }

    const completion = await getOpenAI().chat.completions.create({
      model: 'gpt-4.1',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
    });

    const out = completion.choices[0].message.content || '';
    void logTranslationRequest({
      kind: 'chat',
      source: 'homepage',
      languageCode: dictionary.meta.code,
      inputText: text,
      outputText: out,
      userId,
      model: 'gpt-4.1',
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json({ success: true, translation: out });
  } catch (error) {
    console.error('Translation error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    // Best-effort: capture the failed attempt so the admin can see what broke.
    if (body?.text) {
      void logTranslationRequest({
        kind: body.mode === 'translate' ? 'translate' : 'chat',
        source: 'homepage',
        languageCode: language,
        inputText: body.text,
        userId,
        status: 'error',
        error: errorMessage,
        durationMs: Date.now() - startedAt,
      });
    }
    if (errorMessage.includes('not found')) {
      return NextResponse.json({ success: false, error: 'Dictionary for language not found' }, { status: 404 });
    }
    return NextResponse.json({ success: false, error: 'Translation error occurred' }, { status: 500 });
  }
}
