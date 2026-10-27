import { getWordsForLanguage } from '@/lib/db/queries';
import { pickHeadword } from '@/lib/dictionary-headword';
import { CARD_SIZE, clip, renderCard } from '@/lib/og/card';

export const alt = 'A word from a Mob Translate dictionary, with its meaning';
export const size = CARD_SIZE;
export const contentType = 'image/png';
export const revalidate = 86400;

type Props = { params: Promise<{ language: string; word: string }> };

/** The card for a shared word: the word, what it means, and where it is spoken. */
export default async function Image({ params }: Props) {
  const { language: code, word: slug } = await params;
  const decoded = decodeURIComponent(slug);
  try {
    const { words, language } = await getWordsForLanguage({ language: code, search: decoded, limit: 50 });
    const word = pickHeadword(words, decoded);
    const meaning = word ? word.gloss || word.definitions?.[0]?.definition : undefined;
    return renderCard({
      kicker: language.name,
      headline: word ? clip(word.word, 40) : clip(decoded, 40),
      body: meaning ? clip(meaning, 110) : undefined,
      footer: `${language.name} dictionary · mobtranslate.com`,
      language: code,
    });
  } catch {
    return renderCard({ kicker: 'Dictionary', headline: clip(decoded, 40), footer: 'mobtranslate.com' });
  }
}
