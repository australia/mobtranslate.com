'use client';

import ResearchTranslatorClient from '../ResearchTranslatorClient';

const config = {
  apiPath: '/api/labs/v2',
  dataLanguage: 'gvn',
  targetLang: 'gvn',
  targetName: 'Kuku Yalanji',
  modelLabel: 'model v21.2, guarded decoder',
  directionLabel: 'English to Kuku Yalanji',
  title: 'Kuku Yalanji translator (v2)',
  description: 'Write one English sentence and see a live draft from the experimental v21.2 model.',
  notice: 'Machine translation from an experimental model. It is not elder-verified and may contain errors. The dictionary and human recordings remain the authoritative sources.',
  disclaimer: 'Draft output from an experimental model, not a speaker-certified translation. Check important language with a fluent Kuku Yalanji speaker before relying on it.',
  examples: [
    'The woman went down to the river.',
    'The children are sitting here.',
    'We saw the kangaroo in the bush yesterday.',
    'I am hungry and I want to eat fish.',
  ],
  dictionaryHref: '/dictionaries/kuku_yalanji',
  dictionaryLabel: 'Dictionary',
  docsHref: '/docs/kuku-v22-experiment.html',
  docsLabel: 'Model evidence',
  activePath: '/labs/v2',
  maxCharacters: 400,
};

export default function KukuYalanjiV2LabClient() {
  return <ResearchTranslatorClient config={config} />;
}
