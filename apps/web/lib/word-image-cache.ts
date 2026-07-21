import path from 'path'

export const SITE = 'https://mobtranslate.com'

// These caches already exist on the live filesystem and are read at request
// time. They are deployment data, not build inputs.
const runtimePublicDir = process.env.MOBTRANSLATE_RUNTIME_PUBLIC_DIR
  ?? path.join(process.cwd(), 'public')
export const WORD_IMG_DIR = path.join(runtimePublicDir, 'word-img')
export const WOTD_DIR = path.join(runtimePublicDir, 'wotd')

export function slug(value: string): string {
  return (
    (value || '')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'word'
  )
}

export function cacheKey(lang: string, word: string): string {
  return `${slug(lang)}-${slug(word)}`
}

/** Build a runtime cache path without adding cache contents to NFT manifests. */
export function cachePath(directory: string, file: string): string {
  return path.join(/*turbopackIgnore: true*/ directory, file)
}
