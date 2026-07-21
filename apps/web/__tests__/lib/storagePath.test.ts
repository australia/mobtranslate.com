// @vitest-environment node

import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveStoragePath, STORAGE_ROOT } from '@/lib/storage';

describe('recording storage path containment', () => {
  it('resolves ordinary recording keys under the configured root', () => {
    expect(resolveStoragePath('sentences/speaker/clip.wav')).toBe(
      path.resolve(STORAGE_ROOT, 'sentences/speaker/clip.wav'),
    );
  });

  it('rejects traversal into a sibling whose name merely shares the root prefix', () => {
    const sibling = `${path.basename(STORAGE_ROOT)}-outside`;
    expect(() => resolveStoragePath(`../${sibling}/clip.wav`)).toThrow(
      'Invalid storage path',
    );
  });

  it('rejects ordinary parent traversal', () => {
    expect(() => resolveStoragePath('../../etc/passwd')).toThrow('Invalid storage path');
  });
});
