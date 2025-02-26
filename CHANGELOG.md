# Changelog

All notable changes to the MobTranslate project will be documented in this file.

## [Unreleased]

### Added
- Centralized dictionary data management system in `/app/lib/dictionary.ts`
- Mock data support for three languages: Kuku Yalanji, Mi'gmaq, and Anindilyakwa
- Functions for retrieving language data and supported languages
- Improved error handling and loading states
- Type safety improvements with proper TypeScript typing for language codes
- Added module declaration to support importing JS files with YAML content
- Added RESTful API for dictionaries with the following endpoints:
  - `/api/dictionaries` - List all dictionaries
  - `/api/dictionaries/[language]` - Get a specific dictionary with search & pagination
  - `/api/dictionaries/[language]/words` - Get all words from a dictionary with filtering by letter & pagination
  - `/api/dictionaries/[language]/words/[word]` - Get details for a specific word with related words
- Added pagination support for API endpoints with customizable page size
- Added search and filtering capabilities to API endpoints
- Added Server-Side Rendering (SSR) support for all dictionary pages
- Added environment variables for API configuration
- Added API response standardization with consistent structure and error handling

### Changed
- Migrated dictionary data handling from separate packages to a central module
- Updated all dictionary components to use the new data model
- Improved user experience with better loading and error states
- Enhanced dictionary word pages with better layout
- Refactored dictionary.ts with proper TypeScript type checking
- Refactored UI components to use standard functional components instead of forwardRef
- Added 'use client' directive to all UI components for Next.js App Router compatibility
- Refactored dictionary loading to properly handle async/await patterns
- Updated tsconfig.json to include JavaScript files in the build
- Converted client-side dictionary pages to Server-Side Rendered pages
- Updated dictionary pages to fetch data from the new API endpoints
- Reorganized components to leverage the API for improved performance
- Improved loading states and error handling for better UX
- Enhanced filtering and search capabilities across all dictionary pages
- Converted dictionary word listing from card view to table view for better readability
- Updated API to return all words when dictionary contains fewer than 3000 entries

### Fixed
- Import issues with dictionary data across components
- Inconsistent types between dictionary components
- Error handling in word detail pages
- TypeScript compilation errors in dictionary module
- Build process failures due to TypeScript errors
- Fixed monorepo path aliasing for @ui/components imports
- Resolved component compatibility issues with Next.js App Router
- Fixed async/await issues in dictionary loading functions
- Corrected TypeScript type errors in React components
- Resolved dictionary metadata access patterns across components
- Fixed client-side navigation issues across dictionary pages
- Fixed search functionality to work properly with the server-side API
- Fixed pagination to maintain filters and search parameters across page changes
- Fixed data loading race conditions in dictionary components
- Fixed inconsistent UI behavior between client-side and server-side rendering
- Fixed URL construction in API requests to properly handle empty query parameters
- Enhanced URL handling in server components to ensure valid absolute URLs for fetch requests

## [0.2.0] - 2025-02-26

### Added
- TypeScript conversion for the entire codebase
- Tailwind CSS styling replacing styled-components
- SEO-optimized dictionary pages with dynamic routing
- Individual word pages for better search engine indexing
- Responsive UI improvements across all components
- Dark mode support throughout the application
- Documentation in codebase.md and project-blogpost.md
- Aboriginal cultural acknowledgment in footer

### Changed
- Migrated from JavaScript to TypeScript
- Updated app structure to Next.js 14 standards
- Improved dictionary browsing experience with searchable tables
- Enhanced layout with consistent SharedLayout component
- Optimized routing for better SEO and discoverability
- Implemented proper Next.js dynamic routes for dictionaries and words

### Fixed
- Import path issues across components
- Type checking errors in shared components
- Mobile responsiveness in dictionary pages
- Dark mode toggle functionality
- Navigation links and routing

## [0.1.0] - Initial Release

### Added
- Basic dictionary functionality
- Simple translation interface
- Support for Kuku Yalanji language
- Basic styled-components styling
- Core Next.js structure
