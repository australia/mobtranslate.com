import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      '__tests__/lib/anindilyakwaTrainingCorpus.test.ts',
      '__tests__/lib/releaseAdmission.test.ts',
      '__tests__/lib/translationReleasePolicy.test.ts',
    ],
    fileParallelism: false,
    isolate: true,
    minWorkers: 1,
    maxWorkers: 1,
    testTimeout: 10_000,
  },
});
