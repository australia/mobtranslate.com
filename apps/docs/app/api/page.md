# API Reference

The MobTranslate API provides comprehensive endpoints for managing indigenous language data, translations, and user interactions.

## Base URL

```
https://mobtranslate.com/api/v2
```

## Authentication

All API requests require authentication using Supabase Auth tokens:

```typescript
headers: {
  'Authorization': 'Bearer YOUR_AUTH_TOKEN',
  'Content-Type': 'application/json'
}
```

## Public Endpoints

### Languages

#### List All Languages
```http
GET /languages
```

Returns all published languages with basic information.

**Response:**
```json
[
  {
    "id": "uuid",
    "name": "Kuku Yalanji",
    "code": "gvn",
    "region": "Queensland",
    "status": "low-volume",
    "word_count": 150,
    "phrase_count": 25
  }
]
```

#### Get Language Details
```http
GET /languages/{id}
```

Returns detailed information about a specific language.

### Words

#### Search Words
```http
GET /languages/{languageId}/words?q={query}
```

Search for words in a specific language.

**Query Parameters:**
- `q` - Search query (searches in both original and translations)
- `limit` - Number of results (default: 20, max: 100)
- `offset` - Pagination offset

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "original": "bama",
      "translation": "person",
      "pronunciation": "BAH-mah",
      "part_of_speech": "noun",
      "audio_url": "https://...",
      "cultural_significance": "Traditional term for Aboriginal person"
    }
  ],
  "total": 150,
  "limit": 20,
  "offset": 0
}
```

### Phrases

#### List Common Phrases
```http
GET /languages/{languageId}/phrases
```

Returns common phrases with translations and audio.

## Authenticated Endpoints

### User Progress

#### Get Learning Progress
```http
GET /progress
```

Returns the authenticated user's learning progress across all languages.

#### Update Progress
```http
POST /progress
```

**Request Body:**
```json
{
  "language_id": "uuid",
  "word_id": "uuid",
  "action": "viewed" | "learned" | "practiced",
  "score": 0-100
}
```

### Favorites

#### List Favorites
```http
GET /favorites
```

#### Add Favorite
```http
POST /favorites
```

**Request Body:**
```json
{
  "word_id": "uuid",
  "language_id": "uuid"
}
```

#### Remove Favorite
```http
DELETE /favorites/{id}
```

## Admin Endpoints

Admin endpoints require admin role authentication.

### Language Management

#### Create Language
```http
POST /admin/languages
```

**Request Body:**
```json
{
  "name": "Language Name",
  "code": "ISO 639-3 code",
  "region": "Geographic region",
  "status": "low-volume" | "very-low-volume",
  "description": "Language description"
}
```

#### Update Language
```http
PUT /admin/languages/{id}
```

#### Delete Language
```http
DELETE /admin/languages/{id}
```

### Word Management

#### Bulk Import Words
```http
POST /admin/languages/{languageId}/words/import
```

**Request Body:**
```json
{
  "words": [
    {
      "original": "word",
      "translation": "translation",
      "pronunciation": "pro-nun-ci-ation",
      "part_of_speech": "noun",
      "example_sentence": "Example usage",
      "cultural_significance": "Cultural context"
    }
  ]
}
```

### Statistics

#### Get Platform Statistics
```http
GET /admin/stats
```

Returns comprehensive platform statistics including:
- Total languages
- Total words and phrases
- User engagement metrics
- Learning progress statistics

## Curator Endpoints

Curator endpoints require curator role for the specific language.

### Content Management

#### List Pending Contributions
```http
GET /curator/languages/{languageId}/pending
```

#### Approve Contribution
```http
POST /curator/contributions/{id}/approve
```

#### Reject Contribution
```http
POST /curator/contributions/{id}/reject
```

**Request Body:**
```json
{
  "reason": "Rejection reason"
}
```

### Comments

#### Add Comment
```http
POST /curator/contributions/{id}/comments
```

**Request Body:**
```json
{
  "content": "Comment text"
}
```

## Error Responses

The API uses standard HTTP status codes and returns errors in the following format:

```json
{
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "Language not found",
    "details": {
      "language_id": "invalid-uuid"
    }
  }
}
```

### Common Error Codes

- `UNAUTHORIZED` - Missing or invalid authentication
- `FORBIDDEN` - Insufficient permissions
- `RESOURCE_NOT_FOUND` - Requested resource doesn't exist
- `VALIDATION_ERROR` - Invalid request data
- `RATE_LIMIT_EXCEEDED` - Too many requests

## Rate Limiting

API requests are limited to:
- Public endpoints: 100 requests per minute
- Authenticated endpoints: 1000 requests per minute
- Admin endpoints: No limit

Rate limit information is included in response headers:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640995200
```

## Webhooks

MobTranslate supports webhooks for real-time notifications:

### Available Events

- `language.created`
- `language.updated`
- `word.created`
- `contribution.submitted`
- `contribution.approved`
- `contribution.rejected`

### Webhook Payload

```json
{
  "event": "word.created",
  "timestamp": "2024-01-29T12:00:00Z",
  "data": {
    "word_id": "uuid",
    "language_id": "uuid",
    "original": "bama",
    "translation": "person"
  }
}
```

## SDK Examples

### JavaScript/TypeScript

```typescript
import { createClient } from '@mobtranslate/sdk';

const client = createClient({
  apiKey: 'your-api-key',
  baseUrl: 'https://mobtranslate.com/api/v2'
});

// Search for words
const results = await client.words.search('bama', {
  languageId: 'language-uuid',
  limit: 10
});

// Get user progress
const progress = await client.progress.get();
```

### Python

```python
from mobtranslate import Client

client = Client(api_key='your-api-key')

# List all languages
languages = client.languages.list()

# Get word details
word = client.words.get(
    language_id='language-uuid',
    word_id='word-uuid'
)
```

## Best Practices

1. **Caching**: Cache language and word data locally when possible
2. **Pagination**: Always use pagination for list endpoints
3. **Error Handling**: Implement exponential backoff for rate limits
4. **Security**: Never expose API keys in client-side code
5. **Versioning**: Always use the v2 API endpoints

## Support

For API support, please contact:
- Email: api@mobtranslate.com
- GitHub Issues: github.com/australia/mobtranslate.com/issues