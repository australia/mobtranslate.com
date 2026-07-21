import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';

// waitFor/findBy* default to a 1s timeout, which this shared host regularly
// exceeds: it runs several production services plus sustained research I/O, and
// streaming-render assertions have been observed failing at ~1.1s purely from
// CPU contention. Same reasoning as the raised testTimeout in vitest.config.ts —
// a longer ceiling costs nothing when tests pass and stops load from being
// reported as a test failure.
configure({ asyncUtilTimeout: 10000 });

// Unmount any React trees rendered during a test before the next one runs.
// Without this, leftover DOM from a previous test can make queries match
// duplicate elements — a source of order-dependent, flaky failures when the
// suite runs files in parallel.
afterEach(() => {
  cleanup();
});
