import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['**/__tests__/**/*.test.{ts,tsx}'],
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
