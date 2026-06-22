import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Unmount any React trees rendered during a test before the next one runs.
// Without this, leftover DOM from a previous test can make queries match
// duplicate elements — a source of order-dependent, flaky failures when the
// suite runs files in parallel.
afterEach(() => {
  cleanup();
});
