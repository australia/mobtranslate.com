/**
 * Credits — the people, communities and work this app is built on.
 *
 * MobTranslate's dictionaries, pronunciation bridges and synthesized voices all
 * stand on decades of community knowledge and linguistic scholarship. This is a
 * curated, hand-written acknowledgement of that work. Each entry has a short bio
 * and links out to the source. Add people here; the /credits pages render it.
 *
 * Accuracy matters — these are real people and communities. Keep bios honest and
 * respectful, and don't imply anyone endorses this project.
 */

export type CreditCategory = 'community' | 'dictionary' | 'linguistics' | 'voice';

export interface CreditLink {
  label: string;
  href: string;
}

export interface Credit {
  slug: string;
  name: string;
  role: string;
  category: CreditCategory;
  /** Human-readable language names this credit relates to. */
  languages?: string[];
  /** One line: what of theirs the app actually uses. */
  contribution: string;
  /** A short biographical paragraph. */
  bio: string;
  links?: CreditLink[];
}

export const CATEGORY_META: Record<CreditCategory, { label: string; blurb: string }> = {
  community: {
    label: 'Communities & custodians',
    blurb: 'The language belongs to its people. They are its first and final authority.',
  },
  dictionary: {
    label: 'Dictionary makers',
    blurb: 'Those who recorded the words and built the writing systems we read from.',
  },
  linguistics: {
    label: 'Linguists',
    blurb: 'Whose descriptions of grammar and sound ground how the app pronounces each language.',
  },
  voice: {
    label: 'Voice technology',
    blurb: 'The open speech models and voices the synthesized pronunciation is built on.',
  },
};

export const CATEGORY_ORDER: CreditCategory[] = ['community', 'dictionary', 'linguistics', 'voice'];

export const CREDITS: Credit[] = [
  // ---- Communities & custodians ------------------------------------------
  {
    slug: 'eastern-kuku-yalanji',
    name: 'Eastern Kuku Yalanji people',
    role: 'Custodians & speakers',
    category: 'community',
    languages: ['Kuku Yalanji'],
    contribution: 'The Kuku Yalanji language itself, and the right to speak it.',
    bio: 'The Eastern Kuku Yalanji are the Traditional Owners of the rainforest and coastal country between Mossman and Cooktown in far north Queensland. Kuku Yalanji is still spoken across the region and taught to children. Every word in the Yalanji dictionary is theirs; this app only holds it.',
  },
  {
    slug: 'warnindilyakwa',
    name: 'Warnindilyakwa people',
    role: 'Custodians & speakers',
    category: 'community',
    languages: ['Anindilyakwa'],
    contribution: 'The Anindilyakwa language and its knowledge.',
    bio: 'The Warnindilyakwa are the Traditional Owners of the Groote Eylandt archipelago in the Gulf of Carpentaria. Anindilyakwa is one of the few Australian languages still being learned by children — spoken by well over a thousand people across fourteen clans. The language and its knowledge belong to them.',
  },
  {
    slug: 'groote-eylandt-language-centre',
    name: 'Groote Eylandt Language Centre',
    role: 'Community language custodians',
    category: 'community',
    languages: ['Anindilyakwa'],
    contribution: 'Custodianship of contemporary Anindilyakwa language resources.',
    bio: 'Part of the Anindilyakwa Land Council, the Groote Eylandt Language Centre is the Warnindilyakwa-led body that records, teaches and protects the Anindilyakwa language — maintaining the dictionary, recordings and learning materials. Community-governed language work like theirs is the proper home for any voice or dictionary built on the language.',
    links: [{ label: 'anindilyakwa.org.au', href: 'https://www.anindilyakwa.org.au/' }],
  },
  {
    slug: 'community-speakers',
    name: 'Community speakers & recorders',
    role: 'Voices of the dictionary',
    category: 'community',
    contribution: 'Recordings of real pronunciation — the ground truth behind every word.',
    bio: 'Elders and speakers who lend their voices give the dictionary its true sound. A synthesized voice is only a scaffold: wherever a community recording exists it is the real pronunciation, and the goal is always to replace the machine voice with a human one — recorded with consent, and able to be withdrawn at any time.',
  },

  // ---- Dictionary makers --------------------------------------------------
  {
    slug: 'hershberger',
    name: 'Hank & Ruth Hershberger',
    role: 'Authors, Kuku-Yalanji Dictionary',
    category: 'dictionary',
    languages: ['Kuku Yalanji'],
    contribution: 'The Kuku Yalanji dictionary data and its practical spelling system.',
    bio: 'Henry D. ("Hank") and Ruth Hershberger were SIL linguists who worked with Kuku Yalanji speakers and compiled the Kuku-Yalanji Dictionary (1982, Work Papers of SIL-AAB). They developed the practical orthography — the everyday spelling — that the app still uses for Yalanji, and which the pronunciation bridge reads from.',
    links: [{ label: 'Kuku-Yalanji Dictionary (SIL)', href: 'https://www.sil.org/resources/archives/18038' }],
  },
  {
    slug: 'judith-stokes',
    name: 'Judith Stokes',
    role: 'Compiler, Anindilyakwa Dictionary',
    category: 'dictionary',
    languages: ['Anindilyakwa'],
    contribution: 'Anindilyakwa dictionary work and writing-system development.',
    bio: 'Judith Stokes worked for many years at Angurugu on Groote Eylandt and, with Warnindilyakwa speakers, compiled the Anindilyakwa Dictionary and helped shape the language’s practical writing system. Her four-vowel analysis is one of the two classic accounts of the famously complex Anindilyakwa vowel system.',
  },

  // ---- Linguists ----------------------------------------------------------
  {
    slug: 'elisabeth-patz',
    name: 'Elisabeth Patz',
    role: 'Author, Kuku Yalanji reference grammar',
    category: 'linguistics',
    languages: ['Kuku Yalanji'],
    contribution: 'The grammar and phonology that ground the Yalanji pronunciation bridge.',
    bio: 'Elisabeth Patz wrote A Grammar of the Kuku Yalanji Language of North Queensland (2002, Pacific Linguistics), the reference description of the language. Its account of the sound system and rules — final-/y/ deletion, compounding and reduplication — directly grounds how the app converts Yalanji spelling for synthesis.',
  },
  {
    slug: 'velma-leeding',
    name: 'Velma Leeding',
    role: 'Anindilyakwa phonologist',
    category: 'linguistics',
    languages: ['Anindilyakwa'],
    contribution: 'Foundational analysis of Anindilyakwa sounds.',
    bio: 'Velma Leeding’s PhD, Anindilyakwa Phonology and Morphology (1989, University of Sydney), is a foundational study of the language’s sound system — including the influential two-vowel analysis that, with Stokes’ account, frames how the language’s vowels are understood and pronounced.',
  },
  {
    slug: 'marie-van-egmond',
    name: 'Marie-Elaine van Egmond',
    role: 'Anindilyakwa linguist',
    category: 'linguistics',
    languages: ['Anindilyakwa'],
    contribution: 'The phoneme inventory and classification the bridge relies on.',
    bio: 'Marie-Elaine van Egmond’s PhD, Enindhilyakwa Phonology, Morphosyntax and Genetic Position (2012), established the modern description of Anindilyakwa’s sounds and showed it to belong to the Eastern Gunwinyguan family. That phoneme inventory is what the Anindilyakwa pronunciation bridge maps from.',
  },
  {
    slug: 'james-bednall',
    name: 'James Bednall',
    role: 'Anindilyakwa linguist',
    category: 'linguistics',
    languages: ['Anindilyakwa'],
    contribution: 'Ongoing documentation of Anindilyakwa.',
    bio: 'James Bednall is a linguist whose PhD documented temporal, aspectual and modal expression in Anindilyakwa, working closely with the Groote Eylandt community. His continuing documentation deepens the description the app draws on.',
    links: [{ label: 'jamesbednall.com', href: 'https://jamesbednall.com/anindilyakwa.html' }],
  },

  // ---- Voice technology ---------------------------------------------------
  {
    slug: 'meta-mms',
    name: 'Meta AI — Massively Multilingual Speech',
    role: 'Open speech-synthesis models',
    category: 'voice',
    languages: ['Kuku Yalanji', 'Anindilyakwa'],
    contribution: 'The open neural text-to-speech models the synthesized voices run on.',
    bio: 'The MMS project (Vineel Pratap, Andros Tjandra and colleagues at Meta AI, "Scaling Speech Technology to 1,000+ Languages", 2023) released open speech-synthesis models for over 1,100 languages, trained on recorded readings of public-domain texts. The app uses their Pitjantjatjara model as a donor voice — read through a language-specific spelling bridge — for languages without a model of their own.',
    links: [
      { label: 'Paper (arXiv 2305.13516)', href: 'https://arxiv.org/abs/2305.13516' },
      { label: 'Models on Hugging Face', href: 'https://huggingface.co/facebook/mms-tts' },
    ],
  },
  {
    slug: 'pitjantjatjara-voice',
    name: 'Pitjantjatjara voice & speakers',
    role: 'Donor voice',
    category: 'voice',
    languages: ['Kuku Yalanji', 'Anindilyakwa'],
    contribution: 'The actual voice heard for Yalanji and Anindilyakwa pronunciation.',
    bio: 'The neural voice the app speaks with is the Pitjantjatjara (Anangu) model from MMS, learned from recorded readings in Pitjantjatjara. For Kuku Yalanji — a related Western Desert/Pama-Nyungan neighbour — it is a close fit; for Anindilyakwa it is a respectful stand-in from a different language family until Warnindilyakwa voices are recorded. We are grateful to the Pitjantjatjara speakers whose voice makes this possible, and treat it as a scaffold, not a replacement for either community’s own.',
  },
];

const BY_SLUG = new Map(CREDITS.map((c) => [c.slug, c]));

export function getCredit(slug: string): Credit | undefined {
  return BY_SLUG.get(slug);
}

export function creditsByCategory(): { category: CreditCategory; items: Credit[] }[] {
  return CATEGORY_ORDER.map((category) => ({
    category,
    items: CREDITS.filter((c) => c.category === category),
  })).filter((g) => g.items.length > 0);
}

/** Slugs of the credits relevant to a given dictionary language code. */
export function creditsForLanguage(code: string | null | undefined): Credit[] {
  if (!code) return [];
  const name =
    code === 'kuku_yalanji' || code === 'zku' ? 'Kuku Yalanji'
    : code === 'anindilyakwa' || code === 'aoi' ? 'Anindilyakwa'
    : null;
  if (!name) return [];
  return CREDITS.filter((c) => c.languages?.includes(name));
}
