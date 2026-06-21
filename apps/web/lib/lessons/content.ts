// Interactive lesson content. Kept as typed data so lessons stay easy to edit
// and could later move into the database. Translations for Kuku Yalanji are
// grounded in the dictionary; anything not yet confirmed is marked `confirm`.

export interface VocabItem {
  term: string;
  gloss: string;
  note?: string;
  confirm?: boolean;
}

export interface PhraseItem {
  term: string;
  gloss: string;
  literal?: string;
  confirm?: boolean;
}

export interface QuizQuestion {
  prompt: string; // shown to the learner (English or language)
  answer: string;
  options: string[];
  ask: 'meaning' | 'say'; // "what does X mean" vs "how do you say X"
}

export interface BuilderLine {
  template: string; // uses {name} / {place}
  gloss: string;
  confirm?: boolean;
}

export interface Lesson {
  slug: string;
  number: number;
  title: string;
  subtitle: string;
  languageCode: string;
  languageName: string;
  intro: string;
  objectives: string[];
  vocab: VocabItem[];
  phrases: PhraseItem[];
  builder: { lines: BuilderLine[] };
  quiz: QuizQuestion[];
  sourceNote?: string;
  confirmNote?: string;
}

const kukuYalanjiLesson1: Lesson = {
  slug: '1',
  number: 1,
  title: 'Introducing yourself',
  subtitle: 'Ngayu bama Yalanji',
  languageCode: 'kuku_yalanji',
  languageName: 'Kuku Yalanji',
  intro:
    'In this first lesson you’ll learn to say who you are in Kuku Yalanji — your name, that you’re a Yalanji person, and where your country is.',
  objectives: [
    'Say “I am a Yalanji person”',
    'Tell someone your name',
    'Say where your country is',
  ],
  vocab: [
    { term: 'ngayu', gloss: 'I / me' },
    { term: 'ngayku', gloss: 'my / for me' },
    { term: 'bama', gloss: 'person (Aboriginal person)' },
    { term: 'Yalanji', gloss: 'this place / Yalanji', note: 'bama Yalanji = a Yalanji person' },
    { term: 'bubu', gloss: 'country, ground (the place you belong)' },
    { term: 'buri', gloss: 'name', confirm: true },
  ],
  phrases: [
    { term: 'Ngayu bama Yalanji.', gloss: 'I am a Yalanji person.', literal: 'I · person · this-place' },
    { term: 'Ngayku buri …', gloss: 'My name is …', literal: 'my · name · …', confirm: true },
    { term: 'Ngayu … bubu-mun.', gloss: 'I am from … (my country is …).', literal: 'I · … · country-from', confirm: true },
  ],
  builder: {
    lines: [
      { template: 'Ngayu bama Yalanji.', gloss: 'I am a Yalanji person.' },
      { template: 'Ngayku buri {name}.', gloss: 'My name is {name}.', confirm: true },
      { template: 'Ngayu {place} bubu-mun.', gloss: 'I am from {place}.', confirm: true },
    ],
  },
  quiz: [
    { ask: 'meaning', prompt: 'bama', answer: 'person', options: ['person', 'country', 'name', 'water'] },
    { ask: 'meaning', prompt: 'ngayu', answer: 'I / me', options: ['you', 'I / me', 'we', 'they'] },
    { ask: 'meaning', prompt: 'bubu', answer: 'country / ground', options: ['sky', 'food', 'country / ground', 'house'] },
    { ask: 'say', prompt: 'I am a Yalanji person', answer: 'Ngayu bama Yalanji', options: ['Ngayku buri Yalanji', 'Ngayu bama Yalanji', 'Ngayu bubu Yalanji', 'Bama ngayu Yalanji'] },
  ],
  sourceNote: 'Based on Aunty’s handwritten introduction notes.',
  confirmNote:
    'A few words from the notes (buri “name”, and the “from country” pattern) are still being confirmed with speakers — they’re marked “to confirm”.',
};

const LESSONS: Record<string, Lesson[]> = {
  kuku_yalanji: [kukuYalanjiLesson1],
};

export function getLessons(languageCode: string): Lesson[] {
  return LESSONS[languageCode] ?? [];
}

export function getLesson(languageCode: string, slug: string): Lesson | null {
  return getLessons(languageCode).find((l) => l.slug === slug) ?? null;
}
