# MobTranslate - Comprehensive Documentation

**Last Updated**: January 29, 2025

## Table of Contents

1. [Project Overview](#project-overview)
2. [Getting Started](#getting-started)
3. [Architecture & Technology Stack](#architecture--technology-stack)
4. [Development Guides](#development-guides)
5. [Curation System](#curation-system)
6. [API Documentation](#api-documentation)
7. [UI Components & Style Guide](#ui-components--style-guide)
8. [AI Integration & Document Processing](#ai-integration--document-processing)
9. [Database Schema](#database-schema)
10. [Deployment & Operations](#deployment--operations)
11. [Contributing](#contributing)
12. [Change History](#change-history)

---

## Project Overview

MobTranslate is a fully open-source, community-driven platform designed to create "Google Translate" for Indigenous languages worldwide. Our mission is to preserve and promote Indigenous languages through modern technology, making them accessible to speakers, learners, and researchers globally.

### Vision & Mission

In today's digital world, language preservation has become increasingly important, especially for Aboriginal languages that face the risk of disappearing. MobTranslate creates accessible digital dictionaries for Aboriginal languages, helping to document, preserve, and revitalize these important cultural treasures.

### Core Features

- **📚 Digital Dictionaries** - Comprehensive dictionaries for multiple Indigenous languages
- **🔄 AI-Powered Translation** - Translate text between English and Indigenous languages
- **🎯 Interactive Learning** - Gamified learning experience with spaced repetition
- **🏆 Leaderboards** - Track progress and compete with other learners
- **❤️ Favorites System** - Save and organize words for easy reference
- **🌐 Global Support** - Supporting Indigenous languages from around the world
- **👥 Community Curation** - Collaborative editing and improvement system

### Currently Supported Languages

- **Kuku Yalanji** - Far North Queensland, Australia
- **Mi'gmaq** - Eastern Canada and Northeastern United States
- **Anindilyakwa** - Groote Eylandt, Northern Territory, Australia

---

## Getting Started

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

---

## Architecture & Technology Stack

### Monorepo Structure

```
mobtranslate.com/
├── apps/
│   └── web/                    # Main Next.js application
│       ├── app/                # App Router pages and API routes
│       │   ├── (auth)          # Authentication pages
│       │   ├── api/            # API endpoints
│       │   ├── chat/           # AI chat interface
│       │   ├── dashboard/      # User dashboard
│       │   ├── dictionaries/   # Dictionary browsing
│       │   ├── learn/          # Learning modules
│       │   ├── leaderboard/    # Gamification
│       │   ├── admin/          # Admin panel
│       │   ├── curator/        # Curator interface
│       │   └── stats/          # Progress tracking
│       ├── components/         # React components
│       ├── lib/                # Utilities and helpers
│       └── public/             # Static assets
├── ui/                         # Shared UI component library
│   ├── components/             # Reusable UI components
│   └── lib/                    # UI utilities
├── dictionaries/               # Language data and types
└── supabase/                   # Database configuration
    ├── migrations/             # Database migrations
    └── functions/              # Edge functions
```

### Technology Stack

#### Frontend
- **Framework**: Next.js 14 with App Router
- **Language**: TypeScript (strict mode)
- **Styling**: Tailwind CSS with custom design system
- **UI Components**: Custom component library (`@ui/components`)
- **State Management**: React hooks + SWR for data fetching
- **AI Integration**: Vercel AI SDK with streaming support

#### Backend
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **Storage**: Supabase Storage for audio files
- **API**: RESTful API with Next.js API routes
- **Deployment**: Vercel with edge functions

#### Development
- **Monorepo**: Turborepo for efficient builds
- **Package Manager**: pnpm for fast, efficient dependency management
- **Code Quality**: ESLint, Prettier, TypeScript
- **Version Control**: Git with conventional commits

---

## Development Guides

### Component Architecture

#### Component-First Approach
- **Everything is a Component**: Break UI into small, reusable components
- **Component Types**:
  - **UI Components**: Pure presentational components (in `/ui`)
  - **Feature Components**: Components with business logic
  - **Page Components**: Top-level components that compose features
  - **Layout Components**: Define page structure

#### Use Server Components by Default
```typescript
// ✅ Good: Server Component (default)
export default async function DictionaryPage() {
  const words = await getWordsFromDatabase();
  return <WordList words={words} />;
}

// Only use client components when necessary
'use client';
export function InteractiveSearch() {
  const [query, setQuery] = useState('');
  // Client-side interactivity
}
```

### CRITICAL: Always Use the Component Library

**When making ANY UI changes on the site, you MUST use our existing components from the `@ui/components` package or the custom app components.**

#### Component Usage Priority:
1. **First**: Check `@ui/components` for existing components
2. **Second**: Check `/components` for app-specific components
3. **Third**: Check the Style Guide at `/styleguide` for component examples
4. **Last Resort**: If no suitable component exists, extend or create a new component

### Import Conventions

```typescript
// UI Components
import { Button } from '@ui/components/Button';
import { Card, CardHeader, CardContent } from '@ui/components/card';

// Dictionary Functionality
import getDictionary from '@dictionaries/index';
import { Dictionary, DictionaryWord } from '@dictionaries/index';

// Local Components
import { SharedLayout } from '../components/SharedLayout';
```

### Data Fetching Patterns

#### Server-Side Data Fetching
```typescript
import { createClient } from '@/lib/supabase/server';

export default async function LanguagePage({ params }) {
  const supabase = createClient();
  
  const { data: words, error } = await supabase
    .from('words')
    .select('*, word_class(*), definitions(*)')
    .eq('language_code', params.language)
    .order('word', { ascending: true });
    
  if (error) throw error;
  
  return <DictionaryContent words={words} />;
}
```

#### Client-Side Data Fetching with SWR
```typescript
'use client';
import useSWR from 'swr';

export function UserProgress() {
  const { data, error, isLoading } = useSWR('/api/user/progress', fetcher);
  
  if (isLoading) return <Skeleton />;
  if (error) return <ErrorState />;
  
  return <ProgressChart data={data} />;
}
```

### Styling with Tailwind CSS

#### Design System Tokens

1. **Typography**:
   - Headers: font-crimson (serif)
   - Body: font-source-sans (sans-serif)
   - Sizes: Use Tailwind's default scale (text-xs through text-6xl)

2. **Colors**:
   - Primary: Brand colors
   - Secondary: Supporting colors
   - Muted: For subtle text and backgrounds
   - Border: For dividers and outlines
   - Card: Background colors for card components

3. **Spacing**:
   - Use Tailwind's default spacing scale
   - Common patterns: p-4, p-6 for component padding
   - Consistent gaps: gap-2, gap-4, gap-6

### Performance Optimization

- Use Next.js built-in optimizations:
  - Image optimization with `next/image`
  - Font optimization with `next/font`
  - Route prefetching
- Implement code splitting with dynamic imports
- Use React.memo for expensive components
- Optimize re-renders with proper key usage and dependency arrays

### Accessibility Standards

All components should follow WCAG 2.1 AA standards:
- Use semantic HTML elements
- Ensure proper keyboard navigation
- Provide appropriate aria attributes
- Maintain sufficient color contrast
- Support screen readers

---

## Curation System

The MobTranslate Curation System enables community-driven dictionary improvement through collaborative editing, commenting, and document processing.

### User Roles & Permissions

#### Role Hierarchy
```
Super Admin
    ↓
Dictionary Admin
    ↓
Curator/Maintainer
    ↓
Contributor
    ↓
Registered User
```

#### Permission Matrix

| Action | Registered User | Contributor | Curator | Dict Admin | Super Admin |
|--------|----------------|-------------|---------|------------|-------------|
| View dictionaries | ✓ | ✓ | ✓ | ✓ | ✓ |
| Comment on words | ✓ | ✓ | ✓ | ✓ | ✓ |
| Submit word improvements | ✓ | ✓ | ✓ | ✓ | ✓ |
| Approve improvements | ✗ | ✗ | ✓ | ✓ | ✓ |
| Upload documents | ✗ | ✓ | ✓ | ✓ | ✓ |
| Edit words directly | ✗ | ✗ | ✓ | ✓ | ✓ |
| Manage curators | ✗ | ✗ | ✗ | ✓ | ✓ |
| Create dictionaries | ✗ | ✗ | ✗ | ✗ | ✓ |

### Core Features

1. **Word Comments System**
   - Threaded comments on individual words
   - Markdown support for formatting
   - Mentions (@username) with notifications
   - Comment moderation tools for curators
   - Voting/reactions on comments

2. **Word Improvement Submissions**
   - Structured improvement forms based on improvement type
   - Diff view showing current vs suggested changes
   - Bulk improvements for multiple words
   - Automatic validation based on dictionary rules
   - Collaborative review process

3. **Curator Dashboard**
   ```
   /curator/[dictionary]
   ├── /overview          # Stats and recent activity
   ├── /pending          # Pending improvements to review
   ├── /comments         # Comment moderation queue
   ├── /documents        # Document upload management
   ├── /words           # Direct word editing interface
   ├── /team            # Team member management
   └── /settings        # Dictionary settings
   ```

4. **Super Admin Panel**
   ```
   /admin
   ├── /dictionaries     # Create/manage all dictionaries
   ├── /users           # User management and roles
   ├── /curators        # Assign curators to dictionaries
   ├── /documents       # Global document processing queue
   ├── /analytics       # Platform-wide analytics
   ├── /settings        # Platform settings
   └── /logs           # System logs and audit trail
   ```

### Implementation Status (~85% Complete)

✅ **Completed**:
- Database schema and migrations
- All API endpoints implemented
- UI components and pages created
- Role-based access control
- Activity tracking and metrics

🔄 **In Progress**:
- Connecting UI to real API endpoints
- Testing and validation
- Document processing integration

---

## API Documentation

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

### Curation APIs

#### Comments
- `POST /api/v2/words/:wordId/comments` - Create comment
- `GET /api/v2/words/:wordId/comments` - List comments
- `PUT /api/v2/comments/:commentId` - Update comment
- `DELETE /api/v2/comments/:commentId` - Delete comment
- `POST /api/v2/comments/:commentId/vote` - Vote on comment

#### Improvements
- `POST /api/v2/words/:wordId/improvements` - Submit improvement
- `GET /api/v2/improvements?status=pending` - List improvements
- `PUT /api/v2/improvements/:id/review` - Review improvement

#### Admin APIs
- `POST /api/v2/admin/roles` - Manage roles
- `POST /api/v2/admin/users/:userId/assign-role` - Assign role
- `GET /api/v2/admin/analytics` - Platform analytics
- `POST /api/v2/admin/documents/upload` - Upload documents

### API Best Practices

#### URL Construction
```typescript
// Good - handles empty query parameters properly
const queryString = searchParams.toString();
const url = `/api/endpoint${queryString ? `?${queryString}` : ''}`;

// Bad - can lead to invalid URLs with trailing question marks
const url = `/api/endpoint?${searchParams.toString()}`;
```

#### Response Format
All API responses follow a consistent structure:
```typescript
{
  success: boolean;
  meta?: {
    // request metadata
  };
  data?: any; // the requested data
  error?: string; // error message if failed
  pagination?: {
    total: number;
    page: number;
    limit: number;
    pages: number;
  };
}
```

---

## UI Components & Style Guide

### Component Library Structure

Our UI component library (`/ui/components/`) follows these patterns:

1. **Core UI Components**:
   - Button, Badge, Alert, Input, Textarea, Select
   - Card (with subcomponents: CardHeader, CardTitle, etc.)
   - Table (with subcomponents: TableHeader, TableRow, etc.)

2. **Layout Components**:
   - Container, Section, PageHeader
   - Navigation, Breadcrumbs

3. **Feedback Components**:
   - LoadingSpinner, LoadingState, LoadingSkeleton
   - EmptyState, ErrorBoundary

4. **Domain-Specific Components**:
   - DictionaryEntry, DictionaryTable
   - TranslationInterface
   - AlphabetFilter, FilterTags

### Component Definition Pattern

```tsx
export interface ComponentProps extends React.HTMLAttributes<HTMLElement> {
  variant?: 'primary' | 'secondary';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
}

export function Component({ variant = 'primary', ...props }: ComponentProps) {
  return (
    <div className={cn(
      "base-styles",
      variants[variant],
      props.className
    )}>
      {props.children}
    </div>
  );
}
```

### Style Guide Page

We maintain a live style guide at `/styleguide` that showcases all UI components and design patterns. When adding new components:
1. Add them to the UI component library
2. Update the style guide page to showcase the component
3. Include all variants and states
4. Document any special usage considerations

---

## AI Integration & Document Processing

### AI-Powered Translation

The translation system uses OpenAI's GPT-4o-mini model to provide culturally-aware translations:

- Uses dictionary context to ensure accuracy
- Delivers real-time streaming translations
- Processes all translations server-side
- Includes comprehensive token usage logging

```typescript
// Translation API example
const result = await streamText({
  model: openai('gpt-4o-mini'),
  messages: [
    {
      role: 'system',
      content: `Translate from ${sourceLang} to ${targetLang}. Preserve cultural context.`
    },
    {
      role: 'user',
      content: text
    }
  ],
});
```

### Document Processing Pipeline

The system includes a sophisticated linguistic data extraction pipeline:

#### 1. PDF to Markdown Conversion
- Uses OpenAI API to convert PDFs to well-structured markdown
- Processes in batches of 10 pages for efficiency
- Successfully converted a 270-page Kuku Yalanji grammar guide

#### 2. Linguistic Data Extraction
Produces three standardized formats:

**a) CLDF (Cross-Linguistic Data Formats)**
- Grammar features extracted as CSV
- Each feature has unique ID, parameter, value, and source reference

**b) XIGT JSON (Interlinear Glossed Text)**
- Morpheme-by-morpheme glossing with translations
- Includes phonetic transcriptions
```json
{
  "transcript": "kuku yala-nji",
  "phonetic": "kuku jala-ndʒi",
  "gloss": [
    {"morpheme": "kuku", "gloss": "word, language"},
    {"morpheme": "yala-nji", "gloss": "this-COMIT"}
  ],
  "translation": "the language with \"this\"",
  "source": "§3.2.3.3"
}
```

**c) OntoLex-Lemon JSON-LD**
- W3C standard for lexical resources as linked data
- Structured lexical entries with parts of speech

#### 3. Text-to-Speech Generation
- Converts IPA to audio files
- Maps language-specific phonemes to X-SAMPA notation
- Generates WAV files for pronunciation guides

### Processing Pipeline Architecture

```
Document Upload
      ↓
Validation & Storage
      ↓
Queue for Processing
      ↓
Text Extraction
      ↓
Language Detection
      ↓
Word Tokenization
      ↓
Grammatical Analysis
      ↓
Dictionary Matching
      ↓
Conflict Resolution
      ↓
Database Update
      ↓
Report Generation
```

---

## Database Schema

### Core Language Tables
- `languages` - Language metadata and settings
- `words` - Dictionary entries with linguistic properties
- `translations` - Word translations
- `definitions` - Word definitions
- `dialects` - Regional variations

### User Interaction
- `user_favorites` - Saved words
- `user_word_likes` - Word ratings
- `quiz_attempts` - Learning progress
- `quiz_sessions` - Learning sessions

### Content Enhancement
- `usage_examples` - Example sentences
- `cultural_contexts` - Cultural information
- `audio_pronunciations` - Audio files

### Curation System
- `user_roles` - Role definitions
- `user_role_assignments` - User-role mappings
- `word_comments` - Community comments
- `word_improvement_suggestions` - Improvement submissions
- `curator_activities` - Audit trail
- `document_uploads` - Document processing

### Key Database Features
- Row Level Security (RLS) on all tables
- Automatic quality scoring for words
- Comprehensive audit trail
- Helper functions for common operations

---

## Deployment & Operations

### Deployment Checklist

1. **Environment Variables**: Ensure all required env vars are set in Vercel
2. **Database Migrations**: Run latest migrations on production Supabase
3. **Type Generation**: Generate TypeScript types from Supabase schema
4. **Build Optimization**: Check bundle size with `next build --analyze`
5. **Error Monitoring**: Set up Sentry or similar error tracking
6. **Performance Monitoring**: Enable Vercel Analytics
7. **SEO**: Verify meta tags and OpenGraph data
8. **Accessibility**: Run accessibility audit
9. **Security Headers**: Configure security headers in `next.config.js`
10. **Rate Limiting**: Implement rate limiting on API routes

### Performance Considerations

#### Server-Side Rendering
All dictionary pages support SSR for improved performance and SEO:
- Pages are rendered on the server during request
- Search engines can fully index content
- Faster initial page load
- Content available without JavaScript

#### Caching Strategy
- Static pages revalidated hourly
- API responses cached appropriately
- CDN for static assets
- Database query optimization

### Security Measures
- Supabase Row Level Security
- API rate limiting
- Input validation and sanitization
- Regular security audits
- Secure authentication flow

---

## Contributing

We welcome contributions from developers, linguists, and language communities!

### Development Setup

1. **Fork the repository**
2. **Create a feature branch**
   ```bash
   git checkout -b feature/amazing-feature
   ```
3. **Make your changes**
   - Follow the coding standards
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

### Code Style Guidelines

- Use TypeScript for all new code
- Follow the established patterns and conventions
- Write clear, self-documenting code
- Include error handling for all async operations
- Test your changes thoroughly

### Git Workflow

- Use feature branches for all changes
- Write descriptive commit messages following conventional commits
- Create focused PRs with clear descriptions
- Require code reviews before merging
- Keep PRs small and focused on a single change

---

## Change History

### [Unreleased]

#### Added
- Comprehensive curation system with role-based access control
- Admin and curator dashboards
- Document processing pipeline with AI integration
- Community commenting and improvement suggestions
- Advanced analytics and metrics tracking

### [0.2.0] - 2025-02-26

#### Added
- TypeScript conversion for the entire codebase
- Tailwind CSS styling replacing styled-components
- SEO-optimized dictionary pages with dynamic routing
- Individual word pages for better search engine indexing
- Server-Side Rendering (SSR) support for all dictionary pages
- RESTful API for dictionaries with search & pagination
- AI-powered translation with streaming support

#### Changed
- Migrated from JavaScript to TypeScript
- Updated app structure to Next.js 14 standards
- Improved dictionary browsing experience with searchable tables
- Enhanced layout with consistent SharedLayout component

### [0.1.0] - Initial Release

#### Added
- Basic dictionary functionality
- Simple translation interface
- Support for Kuku Yalanji language
- Basic styled-components styling
- Core Next.js structure

---

## Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [Supabase Documentation](https://supabase.com/docs)
- [Vercel AI SDK](https://sdk.vercel.ai/docs)
- [Tailwind CSS](https://tailwindcss.com/docs)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- **[Component Style Guide](/styleguide)** - Visual reference for all components

## Contact

- Website: [https://mobtranslate.com](https://mobtranslate.com)
- GitHub: [https://github.com/australia/mobtranslate.com](https://github.com/australia/mobtranslate.com)
- Email: contact@mobtranslate.com

---

<p align="center">
  Built with ❤️ by the global community for Indigenous language preservation
</p>