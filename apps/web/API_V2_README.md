# MobTranslate Dictionary API v2

## Overview

The MobTranslate Dictionary API v2 provides free, open access to comprehensive dictionary data including words, definitions, translations, pronunciations, and more. Perfect for building language learning applications, quiz games, and educational tools.

## Features

- **🌐 Completely Open**: No authentication required
- **🔓 CORS Enabled**: Accessible from any domain
- **📚 Rich Data**: Words, definitions, translations, etymologies, pronunciations
- **🔍 Powerful Search**: Search across words, definitions, and translations
- **📄 Pagination**: Efficiently handle large datasets
- **📖 Interactive Documentation**: Swagger UI available at `/api/v2/public/docs`

## Base URL

```
Production: https://mobtranslate.com/api/v2/public
Development: http://localhost:3000/api/v2/public
```

## Endpoints

### 1. List All Dictionaries
```
GET /dictionaries
```

Query Parameters:
- `page` (integer): Page number (default: 1)
- `limit` (integer): Items per page, max 100 (default: 20)

Example:
```javascript
fetch('https://mobtranslate.com/api/v2/public/dictionaries')
  .then(res => res.json())
  .then(data => console.log(data));
```

### 2. Get Dictionary Details
```
GET /dictionaries/{id}
```

Parameters:
- `id`: Dictionary ID (UUID) or language code

Example:
```javascript
fetch('https://mobtranslate.com/api/v2/public/dictionaries/en')
  .then(res => res.json())
  .then(data => console.log(data));
```

### 3. Get Words from Dictionary
```
GET /dictionaries/{id}/words
```

Parameters:
- `id`: Dictionary ID or language code

Query Parameters:
- `page` (integer): Page number (default: 1)
- `limit` (integer): Items per page, max 100 (default: 50)
- `search` (string): Search filter for words
- `word_class` (string): Filter by word class ID
- `verified_only` (boolean): Only return verified words

Example:
```javascript
fetch('https://mobtranslate.com/api/v2/public/dictionaries/en/words?search=hello&limit=10')
  .then(res => res.json())
  .then(data => console.log(data));
```

### 4. Get Word Details
```
GET /words/{id}
```

Parameters:
- `id`: Word ID (UUID)

Returns complete word information including:
- Basic word data (word, phonetic transcription, word class)
- Definitions
- Translations
- Usage examples
- Synonyms and antonyms
- Etymologies
- Audio pronunciations
- Cultural contexts
- Dialectal variations

### 5. Search
```
GET /search
```

Query Parameters:
- `q` (string, required): Search query
- `type` (string): Search type - "all", "word", "definition", "translation" (default: "all")
- `dictionary_id` (string): Filter by dictionary ID
- `dictionary_code` (string): Filter by language code
- `page` (integer): Page number (default: 1)
- `limit` (integer): Items per page, max 100 (default: 20)

Example:
```javascript
fetch('https://mobtranslate.com/api/v2/public/search?q=hello&type=word')
  .then(res => res.json())
  .then(data => console.log(data));
```

## Response Format

All responses follow this general structure:

### Success Response
```json
{
  "data": { /* requested data */ },
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "total_pages": 5,
    "has_next": true,
    "has_previous": false
  }
}
```

### Error Response
```json
{
  "error": "Error message"
}
```

## Example Use Cases

### Building a Quiz Game
```javascript
async function getRandomQuizWord(dictionaryId) {
  // Get a random page of words
  const randomPage = Math.floor(Math.random() * 10) + 1;
  const response = await fetch(
    `https://mobtranslate.com/api/v2/public/dictionaries/${dictionaryId}/words?page=${randomPage}&limit=50`
  );
  const data = await response.json();
  
  // Pick a random word from the results
  const randomWord = data.words[Math.floor(Math.random() * data.words.length)];
  
  return {
    question: `What does "${randomWord.word}" mean?`,
    answer: randomWord.definitions[0]?.definition,
    options: generateOptions(randomWord)
  };
}
```

### Building a Translation Tool
```javascript
async function translateWord(word, sourceLang) {
  const response = await fetch(
    `https://mobtranslate.com/api/v2/public/search?q=${word}&dictionary_code=${sourceLang}&type=word`
  );
  const data = await response.json();
  
  if (data.results.length > 0) {
    const wordData = data.results[0];
    return {
      word: wordData.word,
      translations: wordData.translations,
      definitions: wordData.definitions
    };
  }
  return null;
}
```

### Building Flashcards
```javascript
async function createFlashcards(dictionaryId, wordClass) {
  const response = await fetch(
    `https://mobtranslate.com/api/v2/public/dictionaries/${dictionaryId}/words?word_class=${wordClass}&verified_only=true&limit=100`
  );
  const data = await response.json();
  
  return data.words.map(word => ({
    front: word.word,
    back: word.definitions[0]?.definition || word.translations[0]?.translation,
    pronunciation: word.phonetic_transcription,
    examples: word.usage_examples
  }));
}
```

## Interactive Documentation

Visit the interactive API documentation with Swagger UI:
- Production: https://mobtranslate.com/api/v2/public/docs
- Development: http://localhost:3000/api/v2/public/docs

## OpenAPI Specification

Access the OpenAPI 3.0 specification:
- Production: https://mobtranslate.com/api/v2/public/spec
- Development: http://localhost:3000/api/v2/public/spec

## CORS Support

All API endpoints include CORS headers allowing access from any domain:
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With
```

## Rate Limiting

Currently, there are no rate limits on the API. Please use responsibly.

## Support

For issues or questions about the API, please contact the MobTranslate team.

## License

The API is free to use for both commercial and non-commercial purposes.