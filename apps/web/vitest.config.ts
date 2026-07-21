import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['**/__tests__/**/*.test.{ts,tsx}'],
    exclude: [...configDefaults.exclude, '**/.next*/**'],
    // This shared host runs several production services and sustained research
    // downloads. One long-lived thread avoids the fork pool's fixed worker
    // startup timeout when the mounted drive is under sustained I/O pressure.
    pool: 'threads',
    fileParallelism: false,
    isolate: false,
    minWorkers: 1,
    maxWorkers: 1,
    // Render/interaction tests use userEvent + waitFor; under parallel CPU
    // contention the default 5s can be exceeded, causing flaky timeouts.
    testTimeout: 20000,
    hookTimeout: 20000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: [
        'lib/**/*.ts',
        'app/components/**/*.tsx',
        'app/education/components/**/*.tsx',
        'app/api/**/*.ts',
      ],
      exclude: [
        'lib/supabase/client.ts',
        'lib/supabase/server.ts',
        'lib/supabase/admin.ts',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      '@mobtranslate/ui': path.resolve(__dirname, '../../packages/ui/src'),
    },
  },
});
