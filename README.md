# MobTranslate

<p align="center">
  <img src="https://via.placeholder.com/200x200.png?text=MobTranslate" alt="MobTranslate Logo" width="200" height="200" />
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#getting-started">Getting Started</a> •
  <a href="#project-structure">Project Structure</a> •
  <a href="#api-documentation">API Documentation</a> •
  <a href="#development">Development</a> •
  <a href="#contributing">Contributing</a> •
  <a href="#license">License</a>
</p>

## Overview

MobTranslate is an open-source web application designed to explore and celebrate Indigenous languages. The project provides a centralized dictionary platform for Aboriginal languages, currently supporting Kuku Yalanji, Mi'gmaq, and Anindilyakwa.

Built with modern technologies like Next.js 14, TypeScript, and a Turborepo monorepo setup, MobTranslate aims to make language learning and preservation more accessible.

## Features

- 📚 Digital dictionaries for Aboriginal languages
- 🔍 Advanced search functionality
- 📱 Responsive design for all devices
- 🌐 Server-side rendering for fast page loads
- 📊 Table-based word display for improved readability
- ⚡ Smart data loading strategy (all words for small dictionaries, pagination for large ones)
- 🔤 Alphabetical browsing options
- 🔗 Related word suggestions
- 📝 Example usage and contextual information
- 🌍 Support for multiple languages

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/en/) (v18 or later)
- [pnpm](https://pnpm.io/) (v8 or later)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/mobtranslate.com.git
   cd mobtranslate.com
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Build the project:
   ```bash
   pnpm build
   ```

4. Start the development server:
   ```bash
   pnpm dev
   ```

5. Access the application at http://localhost:3000

## Project Structure

```
mobtranslate.com/
├── apps/
│   └── web/                 # Main Next.js application
│       ├── app/             # Next.js App Router
│       │   ├── dictionaries/# Dictionary pages
│       │   └── lib/         # Shared utilities
│       └── public/          # Static assets
├── ui/                      # Shared UI components
│   ├── components/          # UI components library
│   │   ├── card/           
│   │   └── input/          
│   └── lib/                 # UI utilities
├── dictionaries/            # Dictionary data and models
└── package.json             # Project configuration
```

## API Documentation

MobTranslate provides a RESTful API for accessing dictionary data and translation services:

### Dictionary Endpoints

#### GET /api/dictionaries
Returns a list of all available dictionaries.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "code": "kuku_yalanji",
      "meta": {
        "name": "Kuku Yalanji",
        "description": "The Kuku Yalanji language is spoken by the Kuku Yalanji people of Far North Queensland, Australia.",
        "region": "Far North Queensland"
      }
    },
    {
      "code": "migmaq",
      "meta": {
        "name": "Mi'gmaq",
        "description": "Mi'gmaq is an Eastern Algonquian language spoken primarily in Eastern Canada and parts of the United States.",
        "region": "Eastern Canada, Northeastern United States"
      }
    }
  ],
  "count": 2
}
```

#### GET /api/dictionaries/[language]
Returns detailed dictionary data for the specified language, with optional search and pagination.

**Query Parameters:**
- `page`: Page number (default: 1)
- `limit`: Results per page (default: 50)
- `search`: Search term to filter words
- `sortBy`: Field to sort by (default: 'word')
- `sortOrder`: 'asc' or 'desc' (default: 'asc')

**Response:**
```json
{
  "success": true,
  "data": {
    "meta": {
      "name": "Kuku Yalanji",
      "description": "The Kuku Yalanji language is spoken by the Kuku Yalanji people of Far North Queensland, Australia.",
      "region": "Far North Queensland"
    },
    "words": [
      {
        "word": "babaji",
        "type": "trv",
        "definitions": ["ask. \"Ngayu nyungundu babajin, Wanju nyulu?\" \"I asked him, Who is he?\""],
        "translations": ["ask", "asked"]
      }
    ]
  },
  "pagination": {
    "currentPage": 1,
    "totalPages": 10,
    "totalItems": 500,
    "hasMore": true
  }
}
```

#### GET /api/dictionaries/[language]/words
Returns a paginated list of all words in the specified language dictionary.

#### GET /api/dictionaries/[language]/words/[word]
Returns details for a specific word, including related words and usage examples.

### Translation Endpoints

#### POST /api/translate/[language]
Translates text to the specified Aboriginal language using dictionary data and AI.

**Request Body:**
```json
{
  "text": "Hello, how are you today?",
  "stream": true
}
```

**Parameters:**
- `text` (required): Text to translate
- `stream` (optional): Whether to stream the response (default: true, recommended)

**Response (Streaming):**
The API returns a stream of text chunks that can be processed in real-time, creating a more interactive experience.

**Response (Non-Streaming):**
```json
{
  "success": true,
  "translation": "Wayi, yundu wanjarr nyiku?"
}
```

**Example Usage:**
```javascript
// Streaming example (recommended)
const response = await fetch('/api/translate/kuku_yalanji', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ 
    text: 'Hello',
    stream: true // Default value, can be omitted
  })
});
const reader = response.body.getReader();
const decoder = new TextDecoder();
let result = '';

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  result += decoder.decode(value, { stream: true });
  // Process partial translation
}

// Non-streaming example (only if needed)
const response = await fetch('/api/translate/kuku_yalanji', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ 
    text: 'Hello',
    stream: false 
  })
});
const data = await response.json();
console.log(data.translation);
```

## Development

This project uses a Turborepo monorepo setup with PNPM workspaces. This structure provides parallel builds, optimized dependency management, and simplified package sharing.

### Development Workflow

To develop all apps and packages:

```bash
pnpm dev
```

To build all apps and packages:

```bash
pnpm build
```

### Adding Dependencies

When adding dependencies to specific workspaces:

```bash
# For the web app
cd apps/web && pnpm add <package-name>

# For UI components
cd ui && pnpm add <package-name>
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Thanks to all contributors who have helped shape this project
- Special thanks to the Indigenous communities that have shared their languages
