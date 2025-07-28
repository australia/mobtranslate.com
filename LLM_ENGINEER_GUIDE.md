# LLM Engineer Guide for MobTranslate.com

This guide provides best practices and technical guidelines for LLM engineers working on the MobTranslate.com project. It covers the modern tech stack, architecture patterns, and development standards used throughout the codebase.

## Tech Stack Overview

### Core Technologies
- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript (strict mode)
- **Styling**: Tailwind CSS
- **Database**: Supabase (PostgreSQL)
- **Deployment**: Vercel
- **AI Integration**: Vercel AI SDK with OpenAI
- **Monorepo**: Turborepo

### Key Libraries
- **UI Components**: Custom UI library (`@ui/components`)
- **Authentication**: Supabase Auth
- **State Management**: React hooks + Context API
- **Forms**: React Hook Form
- **Validation**: Zod
- **Date/Time**: date-fns
- **Icons**: Lucide React

## Project Structure

```
mobtranslate.com/
├── apps/
│   └── web/                 # Next.js application
│       ├── app/             # App router pages
│       ├── components/      # Shared components
│       ├── lib/            # Utilities and helpers
│       └── public/         # Static assets
├── packages/
│   ├── ui/                 # Shared UI component library
│   ├── dictionaries/       # Language dictionary data
│   └── database/           # Database types and schemas
└── supabase/              # Supabase configuration
```

## Development Guidelines

### 1. Component Architecture

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

#### Component Organization
- Place shared components in `/app/components/`
- Page-specific components in `[page]/components/`
- UI library components in `packages/ui/`

### 2. Data Fetching Patterns

#### Server-Side Data Fetching
```typescript
// app/dictionaries/[language]/page.tsx
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

### 3. Database Queries

#### Type-Safe Queries
```typescript
// lib/supabase/queries.ts
import { Database } from '@/types/database';
import { createClient } from '@/lib/supabase/server';

type Word = Database['public']['Tables']['words']['Row'];

export async function getWordsForLanguage(
  languageCode: string
): Promise<Word[]> {
  const supabase = createClient();
  
  const { data, error } = await supabase
    .from('words')
    .select(`
      *,
      word_class (
        id,
        name,
        abbreviation
      ),
      definitions (
        id,
        definition,
        example_sentence
      )
    `)
    .eq('language_code', languageCode);
    
  if (error) throw error;
  return data;
}
```

### 4. AI Integration

#### Using Vercel AI SDK
```typescript
// app/api/translate/route.ts
import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';

export async function POST(req: Request) {
  const { text, sourceLang, targetLang } = await req.json();

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

  return result.toAIStreamResponse();
}
```

#### Vector Embeddings for Search
```typescript
// lib/ai/embeddings.ts
export async function generateEmbedding(text: string) {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });
  
  return response.data[0].embedding;
}

// Search with embeddings
export async function semanticSearch(query: string, languageId: string) {
  const embedding = await generateEmbedding(query);
  
  const { data } = await supabase.rpc('search_words', {
    query_embedding: embedding,
    language_id: languageId,
    match_threshold: 0.7,
    match_count: 10
  });
  
  return data;
}
```

### 5. Authentication & Authorization

#### Protected Routes
```typescript
// app/dashboard/layout.tsx
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export default async function DashboardLayout({ children }) {
  const supabase = createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    redirect('/login');
  }
  
  return <>{children}</>;
}
```

#### Row Level Security (RLS)
```sql
-- Enable RLS on tables
ALTER TABLE user_progress ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own progress
CREATE POLICY "Users can view own progress" ON user_progress
  FOR SELECT USING (auth.uid() = user_id);
```

### 6. Performance Optimization

#### Static Generation with ISR
```typescript
// Revalidate every hour
export const revalidate = 3600;

export default async function DictionaryPage() {
  // This page will be statically generated and revalidated every hour
  const data = await fetchDictionaryData();
  return <Dictionary data={data} />;
}
```

#### Dynamic Imports
```typescript
// Lazy load heavy components
const DictionarySearch = dynamic(
  () => import('./components/DictionarySearch'),
  { 
    loading: () => <SearchSkeleton />,
    ssr: false 
  }
);
```

### 7. Error Handling

#### Error Boundaries
```typescript
// app/error.tsx
'use client';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px]">
      <h2 className="text-2xl font-bold mb-4">Something went wrong!</h2>
      <button
        onClick={reset}
        className="px-4 py-2 bg-primary text-white rounded"
      >
        Try again
      </button>
    </div>
  );
}
```

### 8. Testing Patterns

#### Component Testing
```typescript
// __tests__/WordCard.test.tsx
import { render, screen } from '@testing-library/react';
import { WordCard } from '@/components/WordCard';

describe('WordCard', () => {
  it('renders word information correctly', () => {
    const word = {
      word: 'nginda',
      definitions: [{ definition: 'you (singular)' }],
      word_class: { name: 'pronoun' }
    };
    
    render(<WordCard word={word} />);
    
    expect(screen.getByText('nginda')).toBeInTheDocument();
    expect(screen.getByText('you (singular)')).toBeInTheDocument();
    expect(screen.getByText('pronoun')).toBeInTheDocument();
  });
});
```

### 9. Accessibility

#### ARIA Labels and Semantic HTML
```typescript
export function SearchForm() {
  return (
    <form role="search" aria-label="Search dictionary">
      <label htmlFor="search-input" className="sr-only">
        Search for a word
      </label>
      <input
        id="search-input"
        type="search"
        aria-describedby="search-hint"
        placeholder="Search..."
      />
      <span id="search-hint" className="sr-only">
        Enter a word in English or the selected language
      </span>
    </form>
  );
}
```

### 10. Environment Variables

#### Required Environment Variables
```env
# .env.local
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_key
OPENAI_API_KEY=your_openai_key
```

#### Type-Safe Environment Variables
```typescript
// lib/env.ts
import { z } from 'zod';

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string(),
  SUPABASE_SERVICE_ROLE_KEY: z.string(),
  OPENAI_API_KEY: z.string(),
});

export const env = envSchema.parse(process.env);
```

## Common Patterns

### 1. Loading States
```typescript
export default function Loading() {
  return (
    <div className="grid gap-4">
      {Array.from({ length: 10 }).map((_, i) => (
        <Skeleton key={i} className="h-20 w-full" />
      ))}
    </div>
  );
}
```

### 2. Pagination
```typescript
interface PaginationParams {
  page: number;
  limit: number;
}

export async function getPaginatedWords({ page, limit }: PaginationParams) {
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  
  const { data, count } = await supabase
    .from('words')
    .select('*', { count: 'exact' })
    .range(from, to);
    
  return {
    words: data,
    totalPages: Math.ceil(count / limit),
    currentPage: page
  };
}
```

### 3. Search with Debounce
```typescript
'use client';

export function SearchInput() {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, 300);
  
  const { data } = useSWR(
    debouncedQuery ? `/api/search?q=${debouncedQuery}` : null,
    fetcher
  );
  
  return (
    <input
      value={query}
      onChange={(e) => setQuery(e.target.value)}
      placeholder="Search..."
    />
  );
}
```

## Deployment Checklist

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

## Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [Supabase Documentation](https://supabase.com/docs)
- [Vercel AI SDK](https://sdk.vercel.ai/docs)
- [Tailwind CSS](https://tailwindcss.com/docs)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)

## Contributing

When contributing to this project:

1. Follow the established patterns and conventions
2. Write clear, self-documenting code
3. Add TypeScript types for all new code
4. Include error handling for all async operations
5. Test your changes thoroughly
6. Update this guide if you introduce new patterns

Remember: The goal is to create maintainable, scalable code that preserves and promotes Indigenous languages worldwide.