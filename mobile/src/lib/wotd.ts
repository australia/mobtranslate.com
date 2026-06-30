import { API_BASE } from './api';

export interface WordOfDay {
  word: string;
  pronunciation?: string;
  meaning?: string;
  example?: string;
  image?: any; // require() asset or { uri }
}

const FALLBACK_IMG = require('../../assets/images/gen/wotd-default.jpg');

// Curated samples shown instantly while/if the API is unavailable.
const SAMPLES: Record<string, WordOfDay> = {
  kuku_yalanji: {
    word: 'bama', pronunciation: 'ba-ma', meaning: 'noun · person, Aboriginal person',
    example: 'Bama nyulu — that one is a person.', image: FALLBACK_IMG,
  },
  default: {
    word: 'bubu', pronunciation: 'bu-bu', meaning: 'noun · ground, Country, place',
    example: 'A word for the land that holds us.', image: FALLBACK_IMG,
  },
};

/** Word of the day: try the server (which generates + caches a watercolour image),
 *  fall back to a curated sample so the card never looks empty. */
export async function getWordOfDay(code: string): Promise<WordOfDay> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 9000);
    const res = await fetch(`${API_BASE}/api/wotd?lang=${encodeURIComponent(code)}`, {
      headers: { 'User-Agent': 'curl/8.5.0' }, signal: ctrl.signal,
    }).finally(() => clearTimeout(t));
    if (res.ok) {
      const d = await res.json();
      if (d && d.word) {
        return {
          word: d.word,
          pronunciation: d.pronunciation ?? undefined,
          meaning: d.meaning ?? undefined,
          example: d.example ?? undefined,
          image: d.imageUrl ? { uri: d.imageUrl } : FALLBACK_IMG,
        };
      }
    }
  } catch { /* fall through to sample */ }
  return SAMPLES[code] ?? SAMPLES.default;
}
