'use client';

import ResearchTranslatorClient from '../ResearchTranslatorClient';

const config = {
  apiPath: '/api/labs/migmaq',
  dataLanguage: 'mic',
  targetLang: 'mic',
  targetName: "Mi'gmaq",
  modelLabel: 'model 1.0.0-rc1',
  directionLabel: "English to Mi'gmaq",
  title: "Mi'gmaq translator",
  description: "Write one English sentence and see a live draft from the first dictionary-example research candidate.",
  notice: 'This noncommercial model is not speaker-reviewed and may omit or replace important meaning. Use the source dictionary for attested language.',
  disclaimer: "Draft output from a research model, not a speaker-certified translation. Check important language with a qualified Mi'gmaq speaker or language worker before relying on it.",
  examples: [
    'My son shaves his head every summer.',
    'The wind is blowing from the South.',
    'Who will be going to work tomorrow?',
  ],
  dictionaryHref: '/dictionaries/migmaq',
  dictionaryLabel: 'Dictionary',
  docsHref: '/docs/migmaq-model-card.html',
  docsLabel: 'Model card',
  activePath: '/labs/migmaq',
  maxCharacters: 400,
};

export default function MigmaqTranslatorClient() {
  return <ResearchTranslatorClient config={config} />;
}
