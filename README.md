# MobTranslate

<p align="center">
  <img src="https://mobtranslate.com/og-image.png" alt="MobTranslate Logo" width="600" />
</p>

<p align="center">
  <strong>Preserving Indigenous Languages Through Technology</strong>
</p>

<p align="center">
  <a href="https://mobtranslate.com">Website</a> •
  <a href="#features">Features</a> •
  <a href="#getting-started">Getting Started</a> •
  <a href="#tech-stack">Tech Stack</a> •
  <a href="#api-documentation">API Documentation</a> •
  <a href="#contributing">Contributing</a>
</p>

## Overview

MobTranslate is a fully open-source, community-driven platform designed to create "Google Translate" for Indigenous languages worldwide. Our mission is to preserve and promote Indigenous languages through modern technology, making them accessible to speakers, learners, and researchers globally.

## 🚀 Features

### Core Features
- **📚 Digital Dictionaries** - Comprehensive dictionaries for multiple Indigenous languages
- **🔄 AI-Powered Translation** - Translate text between English and Indigenous languages
- **🎯 Interactive Learning** - Gamified learning experience with spaced repetition
- **🏆 Leaderboards** - Track progress and compete with other learners
- **❤️ Favorites System** - Save and organize words for easy reference
- **🌐 Global Support** - Supporting Indigenous languages from around the world

### Technical Features
- **🎨 Modern UI/UX** - Beautiful, responsive design with dark mode support
- **⚡ Real-time Search** - Fast, fuzzy search across thousands of words
- **📱 Mobile-First** - Optimized for all devices and screen sizes
- **♿ Accessible** - WCAG compliant with proper contrast ratios and keyboard navigation
- **🔒 Secure** - Built on Supabase with row-level security
- **📊 Analytics** - Track learning progress and language statistics

## 🛠️ Tech Stack

### Frontend
- **Framework**: Next.js 14 with App Router
- **Language**: TypeScript (strict mode)
- **Styling**: Tailwind CSS with custom design system
- **UI Components**: Custom component library (`@ui/components`)
- **State Management**: React hooks + SWR for data fetching
- **AI Integration**: Vercel AI SDK with streaming support

### Backend
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **Storage**: Supabase Storage for audio files
- **API**: RESTful API with Next.js API routes
- **Deployment**: Vercel with edge functions

### Development
- **Monorepo**: Turborepo for efficient builds
- **Package Manager**: pnpm for fast, efficient dependency management
- **Code Quality**: ESLint, Prettier, TypeScript
- **Version Control**: Git with conventional commits

## 📦 Project Structure

```
mobtranslate.com/
├── apps/
│   └── web/                    # Main Next.js application
│       ├── app/                # App Router pages and API routes
│       │   ├── (auth)         # Authentication pages
│       │   ├── api/           # API endpoints
│       │   ├── chat/          # AI chat interface
│       │   ├── dashboard/     # User dashboard
│       │   ├── dictionaries/  # Dictionary browsing
│       │   ├── learn/         # Learning modules
│       │   ├── leaderboard/   # Gamification
│       │   └── stats/         # Progress tracking
│       ├── components/         # React components
│       ├── lib/               # Utilities and helpers
│       └── public/            # Static assets
├── ui/                         # Shared UI component library
│   ├── components/            # Reusable UI components
│   │   ├── Alert.tsx          # Notification component
│   │   ├── Button.tsx         # Button with variants
│   │   ├── Card.tsx           # Card container
│   │   ├── Input.tsx          # Form inputs
│   │   └── Table.tsx          # Data tables
│   └── lib/                   # UI utilities
├── dictionaries/              # Language data and types
└── supabase/                  # Database configuration
    ├── migrations/            # Database migrations
    └── functions/             # Edge functions
```

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v22 or later
- [pnpm](https://pnpm.io/) v7.15.0 or later
- [Supabase](https://supabase.com/) account (for database)
- [OpenAI API key](https://openai.com/) (for AI features)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/australia/mobtranslate.com.git
   cd mobtranslate.com
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Set up environment variables**
   ```bash
   cp apps/web/.env.example apps/web/.env
   ```
   
   Fill in the required environment variables:
   ```env
   # Supabase
   NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   
   # OpenAI
   OPENAI_API_KEY=your-openai-api-key
   
   # App
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   ```

4. **Run database migrations**
   ```bash
   pnpm supabase db push
   ```

5. **Start the development server**
   ```bash
   pnpm dev
   ```

6. **Access the application**
   Open [http://localhost:3000](http://localhost:3000) in your browser

## 📚 API Documentation

### Dictionary Endpoints

#### GET /api/dictionaries
Returns all available language dictionaries.

#### GET /api/dictionaries/[language]
Returns dictionary data for a specific language with search and pagination.

**Query Parameters:**
- `page` - Page number (default: 1)
- `limit` - Results per page (default: 50)
- `search` - Search term
- `letter` - Filter by starting letter
- `sortBy` - Sort field (default: 'word')
- `sortOrder` - 'asc' or 'desc'

#### GET /api/dictionaries/[language]/words/[word]
Returns detailed information for a specific word.

### Translation Endpoints

#### POST /api/translate/[language]
Translates text to/from an Indigenous language.

**Request Body:**
```json
{
  "text": "Hello, how are you?",
  "direction": "to-indigenous",
  "stream": true
}
```

### Learning Endpoints

#### GET /api/v2/learn/next-word
Returns the next word to learn based on spaced repetition algorithm.

#### POST /api/v2/learn/attempt
Records a learning attempt and updates progress.

### User Endpoints

#### GET /api/v2/user/profile
Returns user profile and statistics.

#### GET /api/v2/user/likes
Returns user's favorited words.

## 🤝 Contributing

We welcome contributions from developers, linguists, and language communities! Here's how you can help:

### Development Setup

1. **Fork the repository**
2. **Create a feature branch**
   ```bash
   git checkout -b feature/amazing-feature
   ```
3. **Make your changes**
   - Follow the [LLM Engineer Guide](./LLM_ENGINEER_GUIDE.md)
   - Use components from `@ui/components`
   - Maintain TypeScript strict mode
   - Write meaningful commit messages

4. **Test your changes**
   ```bash
   pnpm build
   pnpm lint
   ```

5. **Submit a Pull Request**

### Adding a New Language

1. Create language data in `dictionaries/[language-code]/`
2. Add language metadata to the database
3. Update types in `dictionaries/types.ts`
4. Submit a PR with the new language data

### Reporting Issues

- Use GitHub Issues for bug reports and feature requests
- Include reproduction steps for bugs
- Check existing issues before creating new ones

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Indigenous communities worldwide for sharing their languages
- All contributors who have helped build this platform
- [Supabase](https://supabase.com) for the amazing backend infrastructure
- [Vercel](https://vercel.com) for hosting and deployment
- [OpenAI](https://openai.com) for AI capabilities

## 🌍 Supported Languages

Currently supporting:
- **Kuku Yalanji** - Far North Queensland, Australia
- **Mi'gmaq** - Eastern Canada and Northeastern United States
- **Anindilyakwa** - Groote Eylandt, Northern Territory, Australia

More languages are being added regularly. Contact us if you'd like to contribute a new language!

## 📞 Contact

- Website: [https://mobtranslate.com](https://mobtranslate.com)
- GitHub: [https://github.com/australia/mobtranslate.com](https://github.com/australia/mobtranslate.com)
- Email: contact@mobtranslate.com

---

<p align="center">
  Built with ❤️ by the global community for Indigenous language preservation
</p>