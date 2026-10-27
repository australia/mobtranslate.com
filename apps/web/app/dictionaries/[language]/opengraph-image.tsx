import { getWordsForLanguage } from '@/lib/db/queries';
import { CARD_SIZE, clip, renderCard } from '@/lib/og/card';

export const alt = 'A Mob Translate dictionary: the language, where it is spoken and how many words it holds';
export const size = CARD_SIZE;
export const contentType = 'image/png';
export const revalidate = 86400;

type Props = { params: Promise<{ language: string }> };

/** The card for a shared dictionary. */
export default async function Image({ params }: Props) {
  const { language: code } = await params;
  try {
    const { language, pagination } = await getWordsForLanguage({ language: code, limit: 1 });
    const where = language.region ? `${language.region}. ` : '';
    return renderCard({
      kicker: 'Dictionary',
      headline: language.name,
      body: clip(`${where}${pagination.total.toLocaleString('en-AU')} words, each with its source.`, 110),
      footer: `mobtranslate.com/dictionaries/${code}`,
      language: code,
    });
  } catch {
    return renderCard({ kicker: 'Dictionary', headline: 'Mob Translate', footer: 'mobtranslate.com' });
  }
}
