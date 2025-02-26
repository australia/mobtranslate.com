# MobTranslate Codebase Guide

This guide provides detailed information about the architecture, coding patterns, and best practices for the MobTranslate project, a modern Aboriginal language translation platform.

## Project Structure

The project uses a monorepo structure with Turborepo:

```
mobtranslate.com/
├── apps/                   # Application code
│   └── web/                # Main web application (Next.js)
│       ├── app/            # Next.js App Router structure
│       │   ├── components/ # React components
│       │   │   └── ...     # Other component categories
│       │   ├── lib/        # Utility functions and helpers
│       │   └── ...         # App routes
│       ├── public/         # Static assets
│       └── ...
├── ui/                     # Shared UI components
│   ├── components/         # React components library
│   │   ├── Button.tsx      # Button component
│   │   ├── Card.tsx        # Card component
│   │   ├── card/           # Shadcn-style Card components
│   │   ├── input/          # Input components
│   │   └── ...
│   └── lib/                # UI utilities
├── dictionaries/           # Dictionary data & utilities
│   ├── kuku_yalanji/       # Kuku Yalanji language data
│   ├── migmaq/             # Mi'gmaq language data
│   ├── anindilyakwa/       # Anindilyakwa language data
│   └── ...
└── ...
```

## Technology Stack

- **Framework**: Next.js with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **UI Components**: Custom components built with Radix UI primitives
- **Package Management**: pnpm
- **Build Tool**: Turborepo

## Coding Standards

### TypeScript

- All new code should be written in TypeScript
- Use explicit type definitions instead of `any` or `unknown` when possible
- Leverage interfaces for component props
- Extend existing types when appropriate

### Component Structure

- UI components should be placed in the `ui/components` directory
- Domain-specific components should be organized by feature
- Use React.forwardRef for components that need to expose a ref
- Add displayName to all components

### CSS and Styling

- Use Tailwind CSS for styling
- Leverage the `cn` utility function for conditional class merging
- Follow the color scheme defined in `tailwind.config.js`
- Use CSS variables for theme values to support dark mode

### Adding New Packages

Since this is a Turborepo monorepo, add packages to the specific workspace:

```bash
# For adding packages to the web app
cd apps/web && pnpm add package-name

# For adding dev dependencies
cd apps/web && pnpm add -D package-name
```

### Code Organization Best Practices

1. **Keep components small and focused**
   - Each component should do one thing well
   - Split large components into smaller, reusable pieces

2. **Use TypeScript properly**
   - Define interfaces for all component props
   - Use appropriate types for state variables
   - Avoid using `any` types

3. **Directory structure**
   - Group related components and functionality together
   - Keep code that changes together in the same directory

4. **Import paths**
   - Use the following import conventions:

     1. **UI Components**: Import from @ui namespace:
       ```tsx
       import { Button } from '@ui/components/Button';
       import { Card, CardHeader, CardContent } from '@ui/components/card';
       import { Input } from '@ui/components/input';
       ```

     2. **Dictionary Functionality**: Import from @dictionaries namespace:
       ```tsx
       import getDictionary from '@dictionaries/index';
       // or for specific types
       import { Dictionary, DictionaryWord } from '@dictionaries/index';
       ```

     3. **Local Components and Utils**: Use relative imports:
       ```tsx
       import { SharedLayout } from '../components/SharedLayout';
       ```

### Dictionary Data Handling

The dictionary functionality is centralized in the following files:

1. **Root Dictionary Module** (`/dictionaries/index.ts`):
   - Exports the main `getDictionary` function as an async function
   - Defines TypeScript interfaces for dictionary data: `Dictionary`, `DictionaryWord`, and `DictionaryMeta`
   - Exports the `LanguageCode` type for supported languages
   - Handles YAML parsing using js-yaml
   - Provides helper functions like `getSupportedLanguages()`
   - Contains metadata for all languages in a centralized `dictionaryMeta` object

2. **Dictionary Data Files** (`/dictionaries/{language}/dictionary.js`):
   - Contains YAML strings with dictionary data
   - Includes words and their associated metadata
   - Follows a consistent structure across all languages

When working with dictionaries:

1. Always use typed interfaces for dictionary data
2. Remember that `getDictionary` returns a Promise and must be properly awaited
3. Use proper async/await patterns within useEffect hooks when fetching dictionary data
4. Access dictionary metadata through the `dictionary.meta` property, not directly on the dictionary object

### Dictionary Data Loading

The dictionary data loading strategy varies based on the dictionary size:

1. For dictionaries with fewer than 3000 words:
   - Return all words at once to optimize user experience
   - Eliminate pagination for smoother browsing

2. For larger dictionaries:
   - Implement pagination with customizable page size
   - Maintain search and filtering capabilities

This approach balances performance and user experience for dictionaries of different sizes.

### Data Display

Dictionary data is displayed using modern UI patterns:

- Table-based view for word listings to maximize readability and information density
- Responsive design that works across device sizes
- Consistent navigation between dictionary sections

### TypeScript and Dictionary Data

The dictionary system uses several key TypeScript features:

1. **Type Definitions**:
   ```typescript
   export type LanguageCode = 'kuku_yalanji' | 'migmaq' | 'anindilyakwa';
   
   export interface DictionaryWord {
     word: string;
     type?: string;
     definition?: string;
     definitions?: string[];
     translations?: string[];
     synonyms?: string[];
     example?: string;
     cultural_context?: string;
   }
   
   export interface DictionaryMeta {
     name: string;
     description?: string;
     source?: string;
     region?: string;
     contributors?: string[];
     lastUpdated?: string;
   }
   
   export interface Dictionary {
     meta: DictionaryMeta;
     words: DictionaryWord[];
   }
   ```

2. **Module Declaration**:
   A module declaration is added in `dictionary.d.ts` to support importing JavaScript files containing YAML strings:
   ```typescript
   declare module '*/dictionary.js' {
     const content: string;
     export default content;
   }
   ```

3. **TypeScript Configuration**:
   The `tsconfig.json` is configured to allow JavaScript imports with:
   ```json
   {
     "compilerOptions": {
       "allowJs": true,
       "checkJs": false
     },
     "include": [
       "**/*.ts",
       "**/*.tsx",
       "**/*.js",
       "**/*.jsx"
     ]
   }
   ```

## API Best Practices

- **URL Construction**: When constructing URLs with query parameters, always check if query params exist before appending the `?` character:

  ```typescript
  // Good - handles empty query parameters properly
  const queryString = searchParams.toString();
  const url = `/api/endpoint${queryString ? `?${queryString}` : ''}`;
  
  // Bad - can lead to invalid URLs with trailing question marks
  const url = `/api/endpoint?${searchParams.toString()}`;
  ```

- **Server Component URL handling**: In Next.js server components, always use the URL constructor to ensure valid absolute URLs for fetch:

  ```typescript
  // Good - ensures a valid absolute URL for fetch in server components
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || 
    (typeof window === 'undefined' ? 'http://localhost:3000' : window.location.origin);
  
  const url = new URL('/api/endpoint', baseUrl);
  
  const response = await fetch(url.toString(), { cache: 'no-store' });
  
  // Bad - may result in invalid URLs in server components
  const response = await fetch(`/api/endpoint`, { cache: 'no-store' });
  ```

- **Response Format**: All API responses should follow a consistent structure:

  ```typescript
  {
    success: boolean;
    meta: {
      // request metadata
    };
    data: any; // the requested data
    pagination?: {
      total: number;
      page: number;
      limit: number;
      pages: number;
    };
  }
  ```

- **Error Handling**: Use appropriate HTTP status codes and include error messages in responses:

  ```typescript
  // 404 Not Found
  if (!data) {
    return Response.json(
      { success: false, error: 'Dictionary not found' },
      { status: 404 }
    );
  }
  ```

- **Query Parameters**: Support common query parameters consistently across endpoints:
  - `search`: For filtering results by search term
  - `page` and `limit`: For pagination
  - `letter`: For filtering alphabetically (where applicable)

## Dictionary API

The project now includes a fully-featured RESTful API for accessing dictionary data. The API is built using Next.js API Routes with the App Router and follows modern best practices:

```
mobtranslate.com/
├── apps/
│   └── web/
│       ├── app/
│       │   ├── api/                          # API directory
│       │   │   ├── dictionaries/             # Dictionary API endpoints
│       │   │   │   ├── route.ts              # GET /api/dictionaries - List all dictionaries
│       │   │   │   ├── [language]/           # Language-specific endpoints
│       │   │   │   │   ├── route.ts          # GET /api/dictionaries/[language] - Get dictionary with search & pagination
│       │   │   │   │   ├── words/            # Words endpoints
│       │   │   │   │   │   ├── route.ts      # GET /api/dictionaries/[language]/words - List words with filtering & pagination
│       │   │   │   │   │   └── [word]/       # Word-specific endpoint
│       │   │   │   │   │       └── route.ts  # GET /api/dictionaries/[language]/words/[word] - Get word details
│       │   └── ...
└── ...
```

### API Design Principles

1. **RESTful Structure**: The API follows RESTful conventions with appropriate HTTP methods and resource-based URLs.
2. **Consistent Responses**: All API responses follow a consistent structure:
   ```typescript
   {
     success: boolean;       // Indicates if the request was successful
     data?: any;             // The primary response data (present on success)
     error?: string;         // Error message (present on failure)
     meta?: any;             // Dictionary metadata (when relevant)
     pagination?: {          // Pagination information (when paginated)
       total: number;        // Total number of items
       page: number;         // Current page number
       limit: number;        // Items per page
       totalPages: number;   // Total number of pages
       hasNext: boolean;     // Whether there are more pages
       hasPrev: boolean;     // Whether there are previous pages
     };
     filters?: {             // Filter information (when filtered)
       search?: string;      // Search term
       sortBy?: string;      // Sort field
       sortOrder?: string;   // Sort direction
       letter?: string;      // Filter by letter
     };
   }
   ```
3. **Pagination Support**: All list endpoints support pagination with customizable page size.
4. **Search and Filtering**: The API supports flexible search and filtering options.
5. **Error Handling**: Consistent error responses with appropriate HTTP status codes.
6. **Environment Configuration**: API URL can be configured via environment variables.

### API Endpoints

#### 1. List All Dictionaries
- **URL**: `/api/dictionaries`
- **Method**: `GET`
- **Description**: Returns a list of all available dictionaries with their metadata.

#### 2. Get Dictionary
- **URL**: `/api/dictionaries/[language]`
- **Method**: `GET`
- **Query Parameters**:
  - `search`: Filter words by search term
  - `page`: Page number (default: 1)
  - `limit`: Items per page (default: 50)
  - `sortBy`: Field to sort by (default: 'word')
  - `sortOrder`: Sort direction ('asc' or 'desc', default: 'asc')
- **Description**: Returns dictionary information and words with pagination and search.

#### 3. List Dictionary Words
- **URL**: `/api/dictionaries/[language]/words`
- **Method**: `GET`
- **Query Parameters**:
  - `letter`: Filter words by starting letter
  - `page`: Page number (default: 1)
  - `limit`: Items per page (default: 100)
  - `sortOrder`: Sort direction ('asc' or 'desc', default: 'asc')
- **Description**: Returns words from a dictionary with alphabetical grouping and pagination.

#### 4. Get Word Details
- **URL**: `/api/dictionaries/[language]/words/[word]`
- **Method**: `GET`
- **Description**: Returns detailed information about a specific word, including related words.

### Using the API

The API can be consumed by both server and client components:

```typescript
// Server Component example
async function DictionaryPage({ params }) {
  const { language } = params;
  const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/dictionaries/${language}`);
  const data = await response.json();
  
  // Use data in your component
}

// Client Component example
'use client';

import { useEffect, useState } from 'react';

function DictionarySearch() {
  const [results, setResults] = useState([]);
  
  async function searchDictionary(searchTerm) {
    const response = await fetch(`/api/dictionaries/kuku_yalanji?search=${encodeURIComponent(searchTerm)}`);
    const data = await response.json();
    setResults(data.data);
  }
  
  // Component implementation
}
```

## Dictionary Pages Structure

The project includes SEO-optimized pages for Aboriginal language dictionaries with a dynamic routing structure:

```
mobtranslate.com/
├── apps/
│   └── web/
│       ├── app/
│       │   ├── dictionaries/                    # Main dictionaries directory
│       │   │   ├── page.tsx                     # Lists all available dictionaries
│       │   │   ├── [language]/                  # Dynamic route for each language
│       │   │   │   ├── page.tsx                 # Dictionary page for specific language
│       │   │   │   ├── all-words/               # Complete listing of all words
│       │   │   │   │   └── page.tsx             # SEO-friendly index of all words
│       │   │   │   └── words/                   # Words directory
│       │   │   │       └── [word]/              # Dynamic route for each word
│       │   │   │           └── page.tsx         # Individual word page
│       │   └── ...
└── ...
```

### Dictionary Pages Implementation:

1. **Main Dictionaries Page (`/dictionaries/page.tsx`)**:
   - Displays a grid of available Aboriginal language dictionaries
   - Provides information about each language
   - Links to individual dictionary pages
   - Includes a call-to-action for community contributions

2. **Language Dictionary Pages (`/dictionaries/[language]/page.tsx`)**:
   - Presents a searchable table of words in the specific Aboriginal language
   - Includes translations, grammatical information, and usage examples
   - Provides cultural context and educational information
   - Links to individual word pages for SEO and detailed information

3. **All Words Page (`/dictionaries/[language]/all-words/page.tsx`)**:
   - Lists all words in a language dictionary alphabetically 
   - Designed specifically for SEO to ensure all words are indexed by search engines
   - Provides a comprehensive view of the language vocabulary
   - Each word links to its dedicated page

4. **Individual Word Pages (`/dictionaries/[language]/words/[word]/page.tsx`)**:
   - Dedicated page for each word with detailed information
   - Includes pronunciation, cultural context, examples, and related words
   - Optimized for search engines with proper metadata
   - Helps preserve language by making words discoverable through search

### Dynamic Dictionary Design:

The system is designed to handle any number of languages dynamically:

- No hard-coded language-specific files
- All dictionary pages use dynamic routes (`[language]` and `[word]` parameters)
- Content is populated based on the language and word parameters
- Can easily add new languages without modifying the codebase structure
- SEO-friendly URLs for better discoverability

All dictionary pages utilize the `SharedLayout` component to maintain consistent navigation, theming, and responsive design across the application.

## Aboriginal Cultural Sensitivity

When working on this codebase, please be mindful of:

1. The importance of language preservation and accuracy
2. Cultural sensitivity in terminology and representations
3. Involving Aboriginal community members when possible
4. Acknowledging the traditional owners of the languages

## Performance Considerations

- Use Next.js features like Server Components where appropriate
- Implement proper code-splitting and lazy loading
- Optimize image loading with Next.js Image component
- Minimize JavaScript bundle size

## Contribution Workflow

1. Create a feature branch from main
2. Make changes following the coding standards
3. Write or update tests if applicable
4. Submit a pull request with a clear description
5. Wait for review and approval

## Testing Standards

- Write unit tests for utility functions
- Create component tests for UI components
- Use React Testing Library for component testing
- Follow a test-driven development approach when possible

## Accessibility Standards

All components should follow WCAG 2.1 AA standards:

- Use semantic HTML elements
- Ensure proper keyboard navigation
- Provide appropriate aria attributes
- Maintain sufficient color contrast
- Support screen readers

## Server-Side Rendering

All dictionary pages now support Server-Side Rendering (SSR) for improved performance and SEO:

### SSR Implementation

1. **Page Structure**:
   - Dictionary pages are now implemented as async server components
   - They fetch data directly on the server during rendering
   - This eliminates the need for client-side data fetching and loading states

2. **Benefits**:
   - **SEO Optimization**: Search engines can fully index content
   - **Performance**: Faster initial page load and Time to First Contentful Paint (TFCP)
   - **Accessibility**: Content is available immediately without JavaScript
   - **Reduced Client-Side JS**: Less JavaScript sent to the browser

3. **Implementation Pattern**:
   ```tsx
   // Server Component pattern for dictionary pages
   export default async function DictionaryPage({ 
     params, 
     searchParams 
   }: { 
     params: { language: string };
     searchParams: { search?: string };
   }) {
     // Fetch data server-side
     const data = await getDictionaryData(params.language, searchParams.search);
     
     // Return rendered component with data
     return (
       <PageLayout>
         {/* Component content */}
       </PageLayout>
     );
   }
   ```

4. **Data Fetching**:
   - Uses the dictionary API endpoints for consistent data access
   - Fetches data server-side with appropriate caching strategies
   - Passes fetched data directly to components without client-side state

5. **Form Handling**:
   - Uses native HTML forms with action attributes for search functionality
   - Submits forms with GET method to maintain URL parameters for pagination and filtering
   - Enables bookmark-friendly URLs for specific searches or filters

### SSR Best Practices

1. **Cache Control**:
   - Set appropriate cache headers for static and dynamic content
   - Use `cache: 'no-store'` for data that must be fresh
   - Use Next.js caching mechanisms for optimization

2. **Error Handling**:
   - Implement graceful error states with the `notFound()` function
   - Provide helpful error messages when data cannot be loaded

3. **Progressive Enhancement**:
   - Ensure basic functionality works without JavaScript
   - Add client-side enhancements for improved user experience

4. **Streaming and Suspense**:
   - Use React Suspense for progressive loading of page sections
   - Implement streaming responses for large data sets

This approach significantly improves the user experience and search engine optimization for the dictionary pages, making Aboriginal language content more accessible and discoverable.