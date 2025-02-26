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

MobTranslate provides a RESTful API for accessing dictionary data:

### Endpoints

#### GET /api/dictionaries
Returns a list of all available dictionaries.

**Response:**
```json
{
  "data": [
    {
      "code": "kuku_yalanji",
      "name": "Kuku Yalanji",
      "description": "Language of the Kuku Yalanji people of Far North Queensland",
      "region": "Far North Queensland, Australia",
      "source": "Community Dictionary Project",
      "wordCount": 2500,
      "lastUpdated": "2023-05-15"
    },
    // Additional dictionaries...
  ]
}
```

#### GET /api/dictionaries/[language]
Returns words from a specific dictionary with optional search and pagination.

**Query Parameters:**
- `search` (optional): Filter words by search term
- `page` (optional): Page number for pagination
- `pageSize` (optional): Number of items per page

**Notes:**
- For dictionaries with fewer than 3000 words, all words are returned regardless of pagination settings
- For larger dictionaries, pagination is applied according to the specified parameters

**Response:**
```json
{
  "meta": {
    "code": "kuku_yalanji",
    "name": "Kuku Yalanji",
    "description": "Language of the Kuku Yalanji people of Far North Queensland",
    "region": "Far North Queensland, Australia",
    "source": "Community Dictionary Project",
    "wordCount": 2500,
    "lastUpdated": "2023-05-15"
  },
  "data": [
    {
      "word": "bama",
      "type": "noun",
      "definition": "person, human being, Aboriginal person",
      "example": "Bama yinduynju nyajil."
    },
    // Additional words...
  ],
  "pagination": {
    "total": 2500,
    "page": 1,
    "pageSize": 50,
    "totalPages": 50
  }
}
```

#### GET /api/dictionaries/[language]/words
Returns all words from a dictionary with optional filtering by letter and pagination.

**Query Parameters:**
- `letter` (optional): Filter words starting with this letter
- `page` (optional): Page number for pagination
- `pageSize` (optional): Number of items per page

**Response:** Same format as `/api/dictionaries/[language]`

#### GET /api/dictionaries/[language]/words/[word]
Returns detailed information about a specific word, including related words.

**Response:**
```json
{
  "meta": {
    // Dictionary metadata...
  },
  "data": {
    "word": "bama",
    "type": "noun",
    "definition": "person, human being, Aboriginal person",
    "definitions": [
      "person, human being",
      "Aboriginal person"
    ],
    "example": "Bama yinduynju nyajil.",
    "relatedWords": [
      {
        "word": "bamakarra",
        "type": "noun",
        "definition": "human race, people"
      },
      // Additional related words...
    ]
  }
}
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
