# Coding Style Guide - MobTranslate.com

This document outlines the coding standards and best practices for our NextJS project. Following these guidelines ensures consistency, maintainability, and high-quality code across our codebase.

## Table of Contents

- [Project Structure](#project-structure)
- [Component Architecture](#component-architecture)
- [Styling with Tailwind CSS](#styling-with-tailwind-css)
- [State Management and Data Fetching](#state-management-and-data-fetching)
- [AI Integration](#ai-integration)
- [Type Safety and Validation](#type-safety-and-validation)
- [Performance Optimization](#performance-optimization)
- [Testing](#testing)
- [Git Workflow](#git-workflow)

## Project Structure

We use a Turborepo monorepo structure with the following organization:

```
/
├── apps/
│   └── web/            # Main NextJS application
├── ui/                 # Shared UI components
├── dictionaries/       # Shared language/text resources
├── packages/           # Shared utilities and libraries
```

### Key Principles:

- **Import Paths**: Always use absolute imports with our custom aliases:
  - `@ui/` for UI components
  - `@dictionaries/` for dictionary files
  - Avoid relative imports (../../) when possible

- **File Organization**:
  - Group related files by feature/module
  - Keep components and their tests together
  - Use consistent naming conventions (kebab-case for files, PascalCase for components)

## Component Architecture

### Component-First Approach

- **Everything is a Component**: Break UI into small, reusable components
- **Component Types**:
  - **UI Components**: Pure presentational components (in `/ui`)
  - **Feature Components**: Components with business logic
  - **Page Components**: Top-level components that compose features
  - **Layout Components**: Define page structure

### Component Guidelines:

- Keep components focused on a single responsibility
- Implement proper prop validation
- Use TypeScript interfaces for component props
- Prefer functional components with hooks over class components
- Extract complex logic into custom hooks

### File Structure for Components:

```
ComponentName/
├── index.ts           # Export file
├── ComponentName.tsx  # Main component
├── ComponentName.test.tsx  # Tests
└── useComponentLogic.ts    # Custom hooks (if needed)
```

## Styling with Tailwind CSS

- Use Tailwind CSS for styling components
- Follow utility-first approach
- Extract common patterns to components rather than creating custom CSS

### Best Practices:

- Group related Tailwind classes logically:
  ```jsx
  <div className="
    flex items-center justify-between  // Layout
    p-4 my-2                          // Spacing
    bg-white dark:bg-gray-800         // Colors
    rounded-lg shadow-sm              // Visual effects
  ">
  ```

- Use Tailwind's theme extension for custom values
- Leverage Tailwind's responsive modifiers consistently (sm:, md:, lg:)
- For complex, repeated styles, use Tailwind's @apply in component libraries

## State Management and Data Fetching

### SWR for Data Fetching

- Use SWR as the primary data fetching library
- Follow the stale-while-revalidate pattern
- Implement proper error handling and loading states

```jsx
import useSWR from 'swr';

function Profile() {
  const { data, error, isLoading } = useSWR('/api/user', fetcher);
  
  if (error) return <ErrorComponent />;
  if (isLoading) return <LoadingComponent />;
  
  return <UserProfile data={data} />;
}
```

### State Management Guidelines:

- Use React's built-in state management (useState, useReducer) for component-level state
- Use Context API for sharing state across related components
- Consider Zustand for global state when needed
- Avoid prop drilling by using composition or context

## AI Integration

### Vercel AI SDK

- Use Vercel AI SDK for AI feature integration
- Implement streaming responses when appropriate
- Handle AI-specific loading states and errors

```jsx
import { useCompletion } from 'ai/react';

function AIComponent() {
  const { completion, input, handleInputChange, handleSubmit } = useCompletion();
  
  return (
    <form onSubmit={handleSubmit}>
      <input value={input} onChange={handleInputChange} />
      <button type="submit">Generate</button>
      <div>{completion}</div>
    </form>
  );
}
```

### Generative UI Best Practices:

- Use AI-generated content responsibly with proper attribution
- Implement user feedback mechanisms for AI-generated content
- Cache AI responses when appropriate to reduce API calls
- Consider implementing fallbacks for when AI services are unavailable

## Type Safety and Validation

### TypeScript

- Use TypeScript for all new code
- Define explicit return types for functions
- Use interfaces for object shapes
- Avoid using `any` type; prefer `unknown` when type is uncertain

### Zod for Validation

- Use Zod for validating external data and form inputs
- Define schemas for API requests and responses
- Implement runtime validation for user inputs

```typescript
import { z } from 'zod';

const userSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  age: z.number().min(18).optional(),
});

type User = z.infer<typeof userSchema>;

function validateUserData(data: unknown): User {
  return userSchema.parse(data);
}
```

## Performance Optimization

- Use Next.js built-in optimizations:
  - Image optimization with `next/image`
  - Font optimization with `next/font`
  - Route prefetching
- Implement code splitting with dynamic imports
- Use React.memo for expensive components
- Optimize re-renders with proper key usage and dependency arrays
- Implement proper caching strategies for API responses

## Testing

- Write tests for all critical functionality
- Use Jest and React Testing Library
- Follow the testing trophy approach:
  - Unit tests for utilities and hooks
  - Integration tests for components
  - E2E tests for critical user flows
- Use mock service worker (MSW) for API mocking

## Git Workflow

- Use feature branches for all changes
- Write descriptive commit messages following conventional commits
- Create focused PRs with clear descriptions
- Require code reviews before merging
- Keep PRs small and focused on a single change

## Additional Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [SWR Documentation](https://swr.vercel.app/)
- [Zod Documentation](https://zod.dev/)
- [Vercel AI SDK Documentation](https://sdk.vercel.ai/docs)
