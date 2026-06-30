/** Editorial metadata per language (curated brand copy — region, Country place, tagline).
 *  Keyed by the API language code. Artwork/map live in theme.LANG_ART. */
export interface LangMeta { region: string; place: string; tagline: string }

export const LANG_META: Record<string, LangMeta> = {
  kuku_yalanji: {
    region: 'Far North Queensland',
    place: 'Daintree, QLD',
    tagline: 'Our language, our Country, our future.',
  },
  anindilyakwa: {
    region: 'Groote Archipelago, NT',
    place: 'Groote Eylandt, NT',
    tagline: 'Language carried across the islands.',
  },
  migmaq: {
    region: "Mi'kma'ki, Canada",
    place: 'Atlantic Canada',
    tagline: 'Words that hold the land and sea.',
  },
  wbv: {
    region: 'Pilbara, WA',
    place: 'Murchison, WA',
    tagline: 'Spoken on the red earth, still strong.',
  },
};

export function langMeta(code: string): LangMeta {
  return LANG_META[code] ?? { region: '', place: '', tagline: 'Our language, our Country, our future.' };
}
