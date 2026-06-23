import { NextRequest, NextResponse } from 'next/server';
import { OpenAI } from 'openai';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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

  const supabase = await createClient();
  const { data: lang } = await supabase
    .from('languages')
    .select('id, name, description, region, code')
    .eq('code', language)
    .maybeSingle();
  if (!lang) return null;

  // Page past the 1000-row PostgREST cap to get the whole dictionary.
  type Row = { word: string; definitions: { definition: string }[] | null; translations: { translation: string }[] | null };
  const rows: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('words')
      .select('word, definitions(definition), translations(translation)')
      .eq('language_id', lang.id)
      .order('word', { ascending: true })
      .range(from, from + 999);
    if (error || !data || data.length === 0) break;
    rows.push(...(data as Row[]));
    if (data.length < 1000) break;
  }

  // De-dupe by headword, merging glosses (translations + definitions) across senses.
  const byWord = new Map<string, Set<string>>();
  for (const r of rows) {
    const key = (r.word || '').trim();
    if (!key) continue;
    if (!byWord.has(key)) byWord.set(key, new Set());
    const set = byWord.get(key)!;
    r.translations?.forEach((t) => t.translation && set.add(t.translation.trim()));
    r.definitions?.forEach((d) => d.definition && set.add(d.definition.trim()));
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
  try {
    const { language } = params;
    const { text, stream = false, mode = 'chat' } = await request.json();

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
      const completion = await openai.chat.completions.create({
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

      return NextResponse.json({
        success: true,
        translation: (parsed.translation || '').trim(),
        gloss: (parsed.gloss || '').trim(),
        language: { name: dictionary.meta.name, code: dictionary.meta.code },
      });
    }

    const prompt = createTranslationPrompt(text, dictionary);
    const systemPrompt = `You are a helpful translator specializing in ${dictionary.meta.name}. Use the provided dictionary entries to ensure accurate translations while maintaining cultural context.`;

    if (stream) {
      const streamResponse = await openai.chat.completions.create({
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
          for await (const chunk of streamResponse) {
            const content = chunk.choices[0]?.delta?.content || '';
            if (content) controller.enqueue(encoder.encode(content));
          }
          controller.close();
        },
      });

      return new Response(readable, {
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
      });
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-4.1',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
    });

    return NextResponse.json({ success: true, translation: completion.choices[0].message.content || '' });
  } catch (error) {
    console.error('Translation error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    if (errorMessage.includes('not found')) {
      return NextResponse.json({ success: false, error: 'Dictionary for language not found' }, { status: 404 });
    }
    return NextResponse.json({ success: false, error: 'Translation error occurred' }, { status: 500 });
  }
}
