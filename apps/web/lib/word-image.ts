// Shared house-style watercolour image generation + on-disk cache.
//
// One consistent look across the whole app (calm watercolour on cream paper),
// with a per-language palette + Country cue so each dictionary feels distinct.
// Used by both /api/word-image and /api/wotd. Bounded cost: an image is only
// ever generated ONCE per cache key, then served from disk forever.
import { promises as fs } from 'fs';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, tool } from 'ai';
import sharp from 'sharp';
import { z } from 'zod';
import { cacheKey, cachePath, SITE, WORD_IMG_DIR } from './word-image-cache';

export {
  cacheKey,
  SITE,
  slug,
  WORD_IMG_DIR,
  WOTD_DIR,
} from './word-image-cache';

// Per-language palette + Country cue. `default` covers any unmapped language.
const PALETTES: Record<string, string> = {
  kuku_yalanji:
    'palette of deep rainforest green and turquoise reef water (Far North Queensland wet-tropics Country)',
  anindilyakwa:
    'palette of turquoise sea and warm sandstone ochre (Groote Eylandt island Country)',
  migmaq:
    'palette of muted autumn sage and slate blue (Atlantic Canada coastal woodland Country)',
  wbv: 'palette of red ochre earth and gold spinifex (Pilbara desert Country, Western Australia)',
};
const DEFAULT_PALETTE =
  'palette of eucalyptus sage-green and warm cream (open Australian Country)';

export function paletteFor(lang: string): string {
  return PALETTES[lang] ?? DEFAULT_PALETTE;
}

// Word-image prompts are constructed entirely by AI (see composeImagePrompt) —
// no string matching, and no generic fallback image is ever cached.

const VisualSubjectSchema = z.object({
  category: z.enum(['concrete', 'people', 'action', 'abstract']),
  subject: z.string().trim().min(1).max(1200),
});

const ImagePromptSchema = z.object({
  prompt: z.string().trim().min(1).max(2400),
});

let promptProvider: ReturnType<typeof createOpenAI> | null = null;

function getPromptProvider(): ReturnType<typeof createOpenAI> | null {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  if (!promptProvider) promptProvider = createOpenAI({ apiKey });
  return promptProvider;
}

// Force a schema-validated tool call. Never scrape JSON out of model prose.
async function callStructured<T>(
  schema: z.ZodType<T>,
  system: string,
  prompt: string,
): Promise<T | null> {
  const provider = getPromptProvider();
  if (!provider) return null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const completion = await generateText({
        model: provider('gpt-5.4-mini'),
        system,
        prompt,
        tools: {
          submit: tool({
            description: 'Submit the validated image-planning result.',
            inputSchema: schema,
          }),
        },
        toolChoice: { type: 'tool', toolName: 'submit' },
        maxRetries: 0,
        abortSignal: AbortSignal.timeout(45_000),
      });
      const submitted = completion.toolCalls.find(
        (call) => call.toolName === 'submit',
      );
      if (submitted) return schema.parse(submitted.input);
    } catch {
      // Retry transient provider and validation failures.
    }
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
  }
  return null;
}

/**
 * Construct the gpt-image-2 prompt for a word using AI calls (NOT string matching).
 * Two calls: (1) analyse the meaning into a respectful visual subject; (2) compose
 * the final watercolour prompt. Returns NULL if the AI calls fail — the caller
 * then skips generation entirely rather than caching a misleading generic image.
 */
export async function composeImagePrompt(
  lang: string,
  word: string,
  meaning: string | null | undefined,
): Promise<string | null> {
  const m = (meaning ?? '').trim();
  if (!m) return null;

  // Call 1 — analyse: decide HOW to depict this meaning, warmly + SPECIFICALLY.
  const analysis = await callStructured(
    VisualSubjectSchema,
    `You plan a single, respectful editorial watercolour illustration for a dictionary entry. Describe a specific, recognisable subject that conveys the supplied meaning without inventing cultural claims.
Rules for the subject:
- CONCRETE thing (animal, bird, fish, plant, flower, food, object, tool, body part, land or water feature): paint that specific thing clearly as the subject.
- PEOPLE: depict simple, dignified stylized human figures in an ordinary, nonspecific setting. Do not infer clothing, tools, body markings, gender roles, ceremony, ethnicity, or cultural practices from a short gloss.
- ACTION / VERB: depict a stylized person, people, or an animal visibly doing the action in a neutral everyday setting.
- EMOTION / feeling / abstract / grammatical: a stylized figure showing the feeling, OR weather/light/water (anger → dark storm clouds; calm → still dawn water; fear → a long shadow over the land).
ALWAYS choose one clear focal subject. Never add sacred, ceremonial, restricted, or community-specific imagery. Submit the category and one vivid sentence describing exactly what to paint.`,
    `Word: "${word}". Meaning: ${m}`,
  );
  const subject = analysis?.subject;
  if (!subject) return null;

  // Call 2 — compose: turn the subject into the final image-generation prompt.
  const composed = await callStructured(
    ImagePromptSchema,
    `Write one final prompt for the gpt-image-2 image model. Use an original contemporary editorial watercolour style on cream paper: flat hand-painted forms, loose washes, visible paper texture, earthy neutral colours, and restrained accents from this palette: ${paletteFor(lang)}. Keep one clear focal subject. People must be simple, dignified stylized figures, never a real or famous person and never a caricature. Do not imitate or evoke Indigenous art, rock art, dot painting, traditional cross-hatching, sacred designs, community-specific motifs, ceremony, regalia, or restricted cultural material. Do not add text, letters, labels, signatures, flags, maps, or logos. Submit only the complete image prompt.`,
    `SUBJECT: ${subject}`,
  );
  return composed?.prompt ?? null;
}

/** Whether sharp (JPEG downscaling) is available in this runtime. */
export function sharpAvailable(): boolean {
  return true;
}

/**
 * Ensure a cached house-style image exists for (lang, word, meaning).
 * Returns the absolute public URL, or null on any failure (caller falls back).
 *
 * @param dir       directory to cache into (WORD_IMG_DIR or WOTD_DIR)
 * @param urlPrefix public path prefix, e.g. '/word-img' or '/wotd'
 */
export async function ensureWordImage(
  lang: string,
  word: string,
  meaning: string | null | undefined,
  opts: { dir?: string; urlPrefix?: string } = {},
): Promise<string | null> {
  const dir = opts.dir ?? WORD_IMG_DIR;
  const urlPrefix = opts.urlPrefix ?? '/word-img';
  const key = cacheKey(lang, word);

  await fs.mkdir(dir, { recursive: true }).catch(() => {});

  // 1. Serve from cache if present (mandatory — never regenerate). jpg first.
  for (const ext of ['jpg', 'png']) {
    try {
      await fs.access(cachePath(dir, `${key}.${ext}`));
      return `${SITE}${urlPrefix}/${key}.${ext}`;
    } catch {
      /* not present */
    }
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  // If the AI couldn't build a prompt (e.g. transient load), DON'T generate a
  // generic fallback — return null so it retries later instead of caching a wrong image.
  const prompt = await composeImagePrompt(lang, word, meaning);
  if (!prompt) return null;

  // gpt-image-2 at quality:"high" routinely takes >60s; this only runs once per
  // key (then cached forever), so give it generous room.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 240_000);
  try {
    const resp = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'curl/8.5.0',
      },
      body: JSON.stringify({
        model: 'gpt-image-2',
        prompt,
        size: '1024x1024',
        n: 1,
        // Generation is fully async via the worker/queue, so quality is free of
        // the edge-proxy timeout. 'medium' balances watercolour quality vs speed.
        quality: 'medium',
      }),
      signal: controller.signal,
    });

    if (!resp.ok) {
      console.error(
        '[word-image] generation failed',
        resp.status,
        await resp.text().catch(() => ''),
      );
      return null;
    }

    const json: any = await resp.json();
    const b64 = json?.data?.[0]?.b64_json;
    if (!b64) {
      console.error('[word-image] generation returned no b64_json');
      return null;
    }
    const pngBuf = Buffer.from(b64, 'base64');

    const jpg = await sharp(pngBuf)
      .resize(840, 840, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 86 })
      .toBuffer();
    await fs.writeFile(cachePath(dir, `${key}.jpg`), jpg);
    return `${SITE}${urlPrefix}/${key}.jpg`;
  } catch (err: any) {
    console.error('[word-image] generation error', err?.message || err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
