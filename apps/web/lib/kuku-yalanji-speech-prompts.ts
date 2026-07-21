export const KUKU_YALANJI_VOICE_PROMPTS = [
  {
    id: 'line-1',
    kuku: 'dingkar jalbu karrkay',
    english: 'man · woman · small child',
    sourceRefs: [
      'dictionaries/kuku_yalanji/dictionary.yaml#573',
      'dictionaries/kuku_yalanji/dictionary.yaml#698',
      'dictionaries/kuku_yalanji/dictionary.yaml#1224',
    ],
  },
  {
    id: 'line-2',
    kuku: 'nyulu wulbuman bama',
    english: 'he or she · old woman · people',
    sourceRefs: [
      'dictionaries/kuku_yalanji/dictionary.yaml#2148',
      'dictionaries/kuku_yalanji/dictionary.yaml#2402',
      'dictionaries/kuku_yalanji/dictionary.yaml#91',
    ],
  },
  {
    id: 'line-3',
    kuku: 'bayan balibali bana walalarrku',
    english: 'The house is leaky; water is coming in',
    sourceRefs: [
      'dictionaries/kuku_yalanji/dictionary.yaml#words[72].examples[0]',
    ],
  },
  {
    id: 'line-4',
    kuku: 'wungaraba dayirr bajaku balban',
    english: 'The sun shone brightly',
    sourceRefs: [
      'dictionaries/kuku_yalanji/dictionary.yaml#words[69].examples[0]',
    ],
  },
  {
    id: 'line-5',
    kuku: 'babingka jija kujin-kujil',
    english: 'Grandmother is looking after her grandchild',
    sourceRefs: [
      'dictionaries/kuku_yalanji/dictionary.yaml#words[10].examples[0]',
    ],
  },
  {
    id: 'line-6',
    kuku: 'kaykay-kaykayangka wulngku bangka-bangkangan',
    english: 'The children sang loudly',
    sourceRefs: [
      'dictionaries/kuku_yalanji/dictionary.yaml#words[113].examples[0]',
    ],
  },
  {
    id: 'line-7',
    kuku: 'ngayu baduriji dungaka yinya bubu babanka',
    english: 'I want to go fishing and try that place',
    sourceRefs: [
      'dictionaries/kuku_yalanji/dictionary.yaml#words[5].examples[0]',
    ],
  },
  {
    id: 'line-8',
    kuku: 'nganka balkajinda',
    english: 'There are flowers now',
    sourceRefs: [
      'dictionaries/kuku_yalanji/dictionary.yaml#words[77].examples[1]',
    ],
  },
  {
    id: 'line-9',
    kuku: 'baya dalngarri-bunga',
    english: 'Make the fire give light',
    sourceRefs: [
      'dictionaries/kuku_yalanji/dictionary.yaml#words[495].examples[0]',
    ],
  },
  {
    id: 'line-10',
    kuku: 'ngayu kurriyala bijarrin',
    english: 'I dream about a carpet snake',
    sourceRefs: [
      'dictionaries/kuku_yalanji/dictionary.yaml#words[188].examples[0]',
    ],
  },
] as const;

export const REQUIRED_KUKU_YALANJI_VOICE_PROMPTS = 10;

export type KukuYalanjiVoicePrompt =
  (typeof KUKU_YALANJI_VOICE_PROMPTS)[number];
export type KukuYalanjiVoicePromptId = KukuYalanjiVoicePrompt['id'];
