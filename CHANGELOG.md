# Changelog

All notable changes to the MobTranslate project will be documented in this file.

## [Unreleased]

### Added
- Centralized dictionary data management system in `/app/lib/dictionary.ts`
- Mock data support for three languages: Kuku Yalanji, Mi'gmaq, and Anindilyakwa
- Functions for retrieving language data and supported languages
- Improved error handling and loading states
- Type safety improvements with proper TypeScript typing for language codes

### Changed
- Migrated dictionary data handling from separate packages to a central module
- Updated all dictionary components to use the new data model
- Improved user experience with better loading and error states
- Enhanced dictionary word pages with better layout
- Refactored dictionary.ts with proper TypeScript type checking
- Refactored UI components to use standard functional components instead of forwardRef
- Added 'use client' directive to all UI components for Next.js App Router compatibility

### Fixed
- Import issues with dictionary data across components
- Inconsistent types between dictionary components
- Error handling in word detail pages
- TypeScript compilation errors in dictionary module
- Build process failures due to TypeScript errors
- Fixed monorepo path aliasing for @ui/components imports
- Resolved component compatibility issues with Next.js App Router

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
