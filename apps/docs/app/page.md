# What is MobTranslate?

MobTranslate is a platform dedicated to preserving and sharing indigenous languages through technology. Our mission is to help communities maintain their linguistic heritage while making these languages accessible to new learners.

## Install MobTranslate

Install the MobTranslate library:

```bash
npm install @mobtranslate/sdk
```

or

```bash
yarn add @mobtranslate/sdk
```

## Import MobTranslate

Import the MobTranslate library in your app:

```javascript
const MobTranslate = require('@mobtranslate/sdk');
```

If you're using ESM:

```javascript
import MobTranslate from '@mobtranslate/sdk';
```

## Use MobTranslate

Call the `translate`, `search` and `learn` MobTranslate functions to interact with indigenous language content.

```javascript
// Initialize the client
const client = new MobTranslate({
  apiKey: 'your-api-key'
});

// Search for words
const results = await client.search('hello', {
  language: 'kuku-yalanji'
});

// Get translations
const translation = await client.translate('Welcome', {
  from: 'english',
  to: 'kuku-yalanji'
});
```

## Key Features

- **Language Preservation**: Document and preserve endangered indigenous languages
- **Community-Driven**: Content created and verified by native speakers
- **Educational Tools**: Interactive learning features for language students
- **Audio Support**: Pronunciation guides recorded by native speakers
- **Cultural Context**: Learn not just words, but their cultural significance

## Getting Started

Ready to start using MobTranslate? Check out our [installation guide](/getting-started) to set up your development environment.