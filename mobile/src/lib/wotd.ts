import { API_BASE } from './api';
import { sourceBackedDailyWord } from './dailyWord';

export interface WordOfDay {
  id: string;
  word: string;
  pronunciation?: string;
  meaning?: string;
  example?: string;
  image?: any; // require() asset or { uri }
}

const FALLBACK_IMG = require('../../assets/images/gen/wotd-default.jpg');

/** Word of the day: try the server (which generates + caches a watercolour image),
 *  but accept only a real dictionary record with an addressable source trail. */
export async function getWordOfDay(code: string): Promise<WordOfDay | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 9000);
    const res = await fetch(`${API_BASE}/api/wotd?lang=${encodeURIComponent(code)}`, {
      headers: { 'User-Agent': 'curl/8.5.0' }, signal: ctrl.signal,
    }).finally(() => clearTimeout(t));
    if (res.ok) {
      const d = sourceBackedDailyWord(await res.json());
      if (d) {
        return {
          id: d.id,
          word: d.word,
          pronunciation: d.pronunciation ?? undefined,
          meaning: d.meaning ?? undefined,
          example: d.example ?? undefined,
          image: d.imageUrl ? { uri: d.imageUrl } : FALLBACK_IMG,
        };
      }
    }
  } catch { /* no source-backed word available */ }
  return null;
}
