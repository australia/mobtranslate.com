// Shared house-style watercolour image generation + on-disk cache.
//
// One consistent look across the whole app (calm watercolour on cream paper),
// with a per-language palette + Country cue so each dictionary feels distinct.
// Used by both /api/word-image and /api/wotd. Bounded cost: an image is only
// ever generated ONCE per cache key, then served from disk forever.
import { promises as fs } from 'fs'
import path from 'path'

export const SITE = 'https://mobtranslate.com'
export const WORD_IMG_DIR = path.join(process.cwd(), 'public', 'word-img')
export const WOTD_DIR = path.join(process.cwd(), 'public', 'wotd')

// Per-language palette + Country cue. `default` covers any unmapped language.
const PALETTES: Record<string, string> = {
  kuku_yalanji:
    'palette of deep rainforest green and turquoise reef water (Far North Queensland wet-tropics Country)',
  anindilyakwa:
    'palette of turquoise sea and warm sandstone ochre (Groote Eylandt island Country)',
  migmaq:
    'palette of muted autumn sage and slate blue (Atlantic Canada coastal woodland Country)',
  wbv:
    'palette of red ochre earth and gold spinifex (Pilbara desert Country, Western Australia)',
}
const DEFAULT_PALETTE = 'palette of eucalyptus sage-green and warm cream (open Australian Country)'

export function paletteFor(lang: string): string {
  return PALETTES[lang] ?? DEFAULT_PALETTE
}

export function slug(s: string): string {
  return (
    (s || '')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'word'
  )
}

export function cacheKey(lang: string, word: string): string {
  return `${slug(lang)}-${slug(word)}`
}

// Word-image prompts are constructed entirely by AI (see composeImagePrompt) —
// no string matching, and no generic fallback image is ever cached.

// One gpt-5.4-mini JSON call, retried a few times (the box can be under load).
async function chatJSON(system: string, user: string): Promise<any | null> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null
  for (let attempt = 0; attempt < 3; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 45_000)
    try {
      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'User-Agent': 'curl/8' },
        body: JSON.stringify({
          model: 'gpt-5.4-mini',
          messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
          response_format: { type: 'json_object' },
        }),
        signal: controller.signal,
      })
      if (resp.ok) {
        const j: any = await resp.json()
        return JSON.parse(j?.choices?.[0]?.message?.content ?? '{}')
      }
    } catch { /* retry */ } finally { clearTimeout(timer) }
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)))
  }
  return null
}

/**
 * Construct the gpt-image-2 prompt for a word using AI calls (NOT string matching).
 * Two calls: (1) analyse the meaning into a respectful visual subject; (2) compose
 * the final watercolour prompt. Returns NULL if the AI calls fail — the caller
 * then skips generation entirely rather than caching a misleading generic image.
 */
export async function composeImagePrompt(lang: string, word: string, meaning: string | null | undefined): Promise<string | null> {
  const m = (meaning ?? '').trim()
  if (!m) return null

  // Call 1 — analyse: decide HOW to depict this meaning, warmly + SPECIFICALLY.
  const analysis = await chatJSON(
    `You plan a single, warm, respectful watercolour illustration for a dictionary word from an Australian Aboriginal language. Describe a SPECIFIC, recognisable subject that clearly conveys the meaning — never a vague empty landscape.
Rules for the subject:
- CONCRETE thing (animal, bird, fish, plant, flower, food, object, tool, body part, land or water feature): paint that specific thing clearly as the subject.
- PEOPLE (person, man, woman, boy, girl, child, baby, family, people, mob, kin, elder): depict STYLIZED HUMAN FIGURE(S) — simple, dignified humanoid forms, NOT realistic — in everyday life on Country, with simple cues to suit the word: man → a figure holding a spear; woman → a figure with a dilly bag and digging stick; child → a small figure; family/people → a group of figures around a campfire; elder → a seated figure by the fire. Respectful, never a specific real individual, no caricature, no sacred/ceremonial scenes.
- ACTION / VERB: depict a stylized human figure (or figures, or an animal if more apt) DOING the action — e.g. "come"/"go"/"walk" → a figure walking a track toward camp; "ask"/"talk"/"tell"/"call" → two figures sitting talking by a fire; "give" → a figure handing a coolamon to another; "hunt" → a figure with a spear; "cook" → a figure at the coals; "swim" → a figure in a waterhole.
- EMOTION / feeling / abstract / grammatical: a stylized figure showing the feeling, OR weather/light/water (anger → dark storm clouds; calm → still dawn water; fear → a long shadow over the land).
ALWAYS choose a single clear focal subject. Respond as JSON: {"category": "concrete|people|action|abstract", "subject": "<one vivid sentence describing exactly what to paint>"}`,
    `Word: "${word}". Meaning: ${m}`,
  )
  const subject: string | undefined = typeof analysis?.subject === 'string' ? analysis.subject : undefined
  if (!subject) return null

  // Call 2 — compose: turn the subject into the final image-generation prompt.
  const composed = await chatJSON(
    `You write ONE final prompt for the gpt-image-2 image model. STYLE: a warm watercolour illustration on cream paper that reimagines ANCIENT figurative painting in our own gentle style — simplified, STYLIZED HUMANOID figures and forms (flat, hand-painted, NOT realistic, not photographic, not 3D), earthy ochres and charcoal with soft accents from this palette: ${paletteFor(lang)}, loose painterly washes and visible paper texture. Take the given SUBJECT and write a single vivid prompt to paint it in this style, with one clear focal subject. Figures must be simple stylized humanoid forms, dignified, never a specific or famous real person, no caricature. Do NOT copy any specific sacred or traditional rock-art designs — this is our own original style; do NOT depict sacred or ceremonial scenes. No text, letters, words, labels or signatures anywhere. Respond as JSON: {"prompt": "<the final image prompt>"}`,
    `SUBJECT: ${subject}`,
  )
  const prompt: string | undefined = typeof composed?.prompt === 'string' ? composed.prompt : undefined
  return prompt || null
}

// Resolve sharp at runtime through an indirection so the bundler does not try to
// statically resolve it (it is an optional native dep). Returns null if missing.
function loadSharp(): any {
  try {
    const dynRequire: any = eval('require')
    let s = dynRequire('sharp')
    if (s?.default) s = s.default
    return s
  } catch {
    return null
  }
}

let sharpChecked = false
let sharpCached: any = null
function getSharp(): any {
  if (!sharpChecked) {
    sharpCached = loadSharp()
    sharpChecked = true
  }
  return sharpCached
}

/** Whether sharp (JPEG downscaling) is available in this runtime. */
export function sharpAvailable(): boolean {
  return !!getSharp()
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
  const dir = opts.dir ?? WORD_IMG_DIR
  const urlPrefix = opts.urlPrefix ?? '/word-img'
  const key = cacheKey(lang, word)

  await fs.mkdir(dir, { recursive: true }).catch(() => {})

  // 1. Serve from cache if present (mandatory — never regenerate). jpg first.
  for (const ext of ['jpg', 'png']) {
    try {
      await fs.access(path.join(dir, `${key}.${ext}`))
      return `${SITE}${urlPrefix}/${key}.${ext}`
    } catch {
      /* not present */
    }
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null

  const sharp = getSharp()
  // If the AI couldn't build a prompt (e.g. transient load), DON'T generate a
  // generic fallback — return null so it retries later instead of caching a wrong image.
  const prompt = await composeImagePrompt(lang, word, meaning)
  if (!prompt) return null

  // gpt-image-2 at quality:"high" routinely takes >60s; this only runs once per
  // key (then cached forever), so give it generous room.
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 240_000)
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
    })

    if (!resp.ok) {
      console.error('[word-image] generation failed', resp.status, await resp.text().catch(() => ''))
      return null
    }

    const json: any = await resp.json()
    const b64 = json?.data?.[0]?.b64_json
    if (!b64) {
      console.error('[word-image] generation returned no b64_json')
      return null
    }
    const pngBuf = Buffer.from(b64, 'base64')

    if (sharp) {
      const jpg = await sharp(pngBuf)
        .resize(840, 840, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 86 })
        .toBuffer()
      await fs.writeFile(path.join(dir, `${key}.jpg`), jpg)
      return `${SITE}${urlPrefix}/${key}.jpg`
    }
    await fs.writeFile(path.join(dir, `${key}.png`), pngBuf)
    return `${SITE}${urlPrefix}/${key}.png`
  } catch (err: any) {
    console.error('[word-image] generation error', err?.message || err)
    return null
  } finally {
    clearTimeout(timer)
  }
}
