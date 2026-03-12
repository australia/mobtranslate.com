import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const WEB_DIR = path.resolve(__dirname, '../..');
const MONOREPO_DIR = path.resolve(WEB_DIR, '../..');
const APP_DIR = path.join(WEB_DIR, 'app');

function pageExists(routePath: string): boolean {
  return fs.existsSync(path.join(APP_DIR, routePath, 'page.tsx'));
}

function apiRouteExists(routePath: string): boolean {
  return fs.existsSync(path.join(APP_DIR, 'api', routePath, 'route.ts'));
}

function componentExists(relativePath: string): boolean {
  return fs.existsSync(path.join(APP_DIR, relativePath));
}

function readWebFile(relativePath: string): string {
  return fs.readFileSync(path.join(WEB_DIR, relativePath), 'utf-8');
}

function readMonorepoFile(relativePath: string): string {
  return fs.readFileSync(path.join(MONOREPO_DIR, relativePath), 'utf-8');
}

describe('Project Structure - Page files', () => {
  const expectedPages = [
    '',                          // home page (app/page.tsx)
    'about',
    'chat',
    'dictionaries',
    'dictionaries/[language]',
    'learn',
    'learn/[dictionary]',
    'stats',
    'stats/[dictionary]',
    'leaderboard',
    'settings',
    'styleguide',
    'auth/signin',
    'auth/signup',
    'curator',
    'curator/pending',
    'curator/approved',
    'curator/rejected',
    'curator/comments',
    'admin',
    'admin/users',
    'admin/languages',
    'admin/analytics',
    'education',
    'education/[language]',
    'contribute',
    'dashboard',
  ];

  it.each(expectedPages)('page file exists for route: /%s', (route) => {
    expect(pageExists(route)).toBe(true);
  });
});

describe('Project Structure - API routes', () => {
  const expectedApiRoutes = [
    'auth/signin',
    'auth/signup',
    'auth/signout',
    'chat',
    'dictionaries',
    'v2/languages',
    'v2/words',
    'v2/search',
    'v2/stats',
    'v2/admin/users',
    'v2/admin/languages',
    'v2/curator/pending',
    'v2/public/dictionaries',
    'version',
  ];

  it.each(expectedApiRoutes)('API route exists: /api/%s', (route) => {
    expect(apiRouteExists(route)).toBe(true);
  });
});

describe('Project Structure - Education game components', () => {
  const expectedComponents = [
    'education/components/Flashcards.tsx',
    'education/components/MemoryGame.tsx',
    'education/components/WordQuiz.tsx',
    'education/components/WordScramble.tsx',
    'education/components/WritingPractice.tsx',
    'education/components/SpeedRound.tsx',
    'education/components/FillInTheBlank.tsx',
    'education/components/MatchingPairs.tsx',
    'education/components/WordBuilder.tsx',
    'education/components/ListeningChallenge.tsx',
  ];

  it.each(expectedComponents)('education component exists: %s', (comp) => {
    expect(componentExists(comp)).toBe(true);
  });
});

describe('Package configuration', () => {
  it('root package.json has required dependencies', () => {
    const pkg = JSON.parse(readMonorepoFile('package.json'));
    expect(pkg.devDependencies).toBeDefined();
  });

  it('web package.json has next dependency', () => {
    const pkg = JSON.parse(readWebFile('package.json'));
    expect(pkg.dependencies.next).toBeDefined();
  });

  it('web package.json has react dependency', () => {
    const pkg = JSON.parse(readWebFile('package.json'));
    expect(pkg.dependencies.react).toBeDefined();
  });

  it('web package.json has supabase dependency', () => {
    const pkg = JSON.parse(readWebFile('package.json'));
    expect(pkg.dependencies['@supabase/supabase-js']).toBeDefined();
  });

  it('web package.json has vitest devDependency', () => {
    const pkg = JSON.parse(readWebFile('package.json'));
    expect(pkg.devDependencies.vitest).toBeDefined();
  });

  it('web package.json has test script', () => {
    const pkg = JSON.parse(readWebFile('package.json'));
    expect(pkg.scripts.test).toBe('vitest run');
  });

  it('web package.json has @mobtranslate/ui workspace dependency', () => {
    const pkg = JSON.parse(readWebFile('package.json'));
    expect(pkg.dependencies['@mobtranslate/ui']).toBe('workspace:*');
  });
});

describe('TypeScript configuration', () => {
  it('tsconfig.json has @ path alias', () => {
    const tsconfig = JSON.parse(readWebFile('tsconfig.json'));
    expect(tsconfig.compilerOptions.paths['@/*']).toBeDefined();
  });

  it('tsconfig.json has @ui path alias', () => {
    const tsconfig = JSON.parse(readWebFile('tsconfig.json'));
    expect(tsconfig.compilerOptions.paths['@ui']).toBeDefined();
  });

  it('tsconfig.json has @dictionaries path alias', () => {
    const tsconfig = JSON.parse(readWebFile('tsconfig.json'));
    expect(tsconfig.compilerOptions.paths['@dictionaries']).toBeDefined();
  });

  it('tsconfig.json has strictNullChecks enabled', () => {
    const tsconfig = JSON.parse(readWebFile('tsconfig.json'));
    expect(tsconfig.compilerOptions.strictNullChecks).toBe(true);
  });
});

describe('Layout configuration', () => {
  it('layout.tsx exports a default function', () => {
    const content = readWebFile('app/layout.tsx');
    expect(content).toMatch(/export default function RootLayout/);
  });

  it('layout.tsx includes AuthProvider', () => {
    const content = readWebFile('app/layout.tsx');
    expect(content).toContain('AuthProvider');
  });

  it('layout.tsx includes metadata export', () => {
    const content = readWebFile('app/layout.tsx');
    expect(content).toMatch(/export const metadata/);
  });
});

describe('Tone check - no harmful language framing', () => {
  const pagesToCheck = [
    'app/page.tsx',
    'app/about/page.tsx',
    'app/dictionaries/page.tsx',
    'app/education/page.tsx',
  ];

  it.each(pagesToCheck)('no "preserving" language in %s', (pagePath) => {
    const fullPath = path.join(WEB_DIR, pagePath);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf-8').toLowerCase();
      expect(content).not.toContain('preserving');
    }
  });

  it.each(pagesToCheck)('no "endangered" language in %s', (pagePath) => {
    const fullPath = path.join(WEB_DIR, pagePath);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf-8').toLowerCase();
      expect(content).not.toContain('endangered');
    }
  });
});
