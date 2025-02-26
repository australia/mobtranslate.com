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
   - Exports the main `getDictionary` function
   - Provides TypeScript interfaces for dictionary data
   - Exports language code type definition

2. **App Dictionary Module** (`/apps/web/app/lib/dictionary.ts`):
   - Provides application-specific dictionary utilities
   - Imports the core dictionary functionality from @dictionaries
   - Adds application-specific interfaces and helper functions

When working with dictionaries:

1. Always use typed interfaces for dictionary data
2. Use the `getDictionary` function to retrieve dictionary data
3. For frontend components, use the app-level dictionary utilities

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