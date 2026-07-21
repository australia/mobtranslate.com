// In-process image-generation worker/queue.
//
// gpt-image-2 takes ~20-90s per image, which exceeds the public edge (Cloudflare
// ~100s) proxy limit, so API routes must NEVER block on a cold generation.
// Instead they ENQUEUE a job here and return immediately (cached URL or null);
// this background worker drains the queue with bounded concurrency, dedupes
// concurrent requests for the same key, and writes each result to the on-disk
// cache (served forever after). The `next start` process is long-lived, so the
// worker persists across requests. The disk cache survives restarts; only the
// in-memory queue is lost on restart (jobs simply re-enqueue on next access).
import { promises as fs } from 'fs'
import { ensureWordImage } from './word-image'
import { cacheKey, cachePath, SITE } from './word-image-cache'

interface Job { lang: string; word: string; meaning: string | null; dir: string; urlPrefix: string }

const MAX_CONCURRENT = 2
const queue: Job[] = []
const inflight = new Map<string, Promise<string | null>>() // id -> generation promise
let active = 0

function idFor(dir: string, key: string) { return `${dir}|${key}` }

/** Public URL of an already-cached image (with a ?v=<mtime> cache-buster so a
 *  regenerated image is not masked by the CDN), or null (never generates). */
export async function peekCached(lang: string, word: string, dir: string, urlPrefix: string): Promise<string | null> {
  const key = cacheKey(lang, word)
  for (const ext of ['jpg', 'png']) {
    try {
      const st = await fs.stat(cachePath(dir, `${key}.${ext}`))
      return `${SITE}${urlPrefix}/${key}.${ext}?v=${Math.round(st.mtimeMs)}`
    } catch { /* miss */ }
  }
  return null
}

/**
 * Ensure an image for this key is (being) generated. Returns a promise that
 * resolves to the URL when generation completes (or null on failure).
 * Concurrent callers for the same key share ONE generation. Honours the
 * concurrency cap by queueing.
 */
export function requestImage(lang: string, word: string, meaning: string | null, dir: string, urlPrefix: string): Promise<string | null> {
  const id = idFor(dir, cacheKey(lang, word))
  const existing = inflight.get(id)
  if (existing) return existing

  let resolve!: (v: string | null) => void
  const promise = new Promise<string | null>((r) => { resolve = r })
  inflight.set(id, promise)
  ;(promise as any).__resolve = resolve
  ;(promise as any).__job = { lang, word, meaning, dir, urlPrefix }
  queue.push({ lang, word, meaning, dir, urlPrefix })
  pump()
  return promise
}

function pump() {
  while (active < MAX_CONCURRENT && queue.length > 0) {
    const job = queue.shift()!
    const id = idFor(job.dir, cacheKey(job.lang, job.word))
    const p = inflight.get(id) as any
    active++
    ensureWordImage(job.lang, job.word, job.meaning, { dir: job.dir, urlPrefix: job.urlPrefix })
      .then((url) => { p?.__resolve?.(url) })
      .catch(() => { p?.__resolve?.(null) })
      .finally(() => { active--; inflight.delete(id); pump() })
  }
}

/** Race a generation against a soft cap (ms). Returns the URL if ready in time,
 *  else null — the generation continues in the background and caches. */
export async function requestImageSoft(
  lang: string, word: string, meaning: string | null, dir: string, urlPrefix: string, capMs: number,
): Promise<string | null> {
  const gen = requestImage(lang, word, meaning, dir, urlPrefix)
  const TIMEOUT = Symbol('t')
  const winner = await Promise.race([gen, new Promise<typeof TIMEOUT>((r) => setTimeout(() => r(TIMEOUT), capMs))])
  if (winner === TIMEOUT) { gen.catch(() => {}); return null }
  return winner as string | null
}
