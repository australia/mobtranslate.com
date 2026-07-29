// @vitest-environment node

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseSuggestedLocation } from '@/lib/words/location';

const readWebFile = (relativePath: string) => readFileSync(path.join(process.cwd(), relativePath), 'utf8');

const productionSurfaces = [
  'app/curator/pending/page.tsx',
  'app/curator/improvements/page.tsx',
  'app/curator/approved/page.tsx',
  'app/curator/rejected/page.tsx',
  'app/curator/comments/page.tsx',
  'app/admin/documents/page.tsx',
];

describe('curator and document surface integrity', () => {
  it.each(productionSurfaces)('%s never substitutes demonstration records', (file) => {
    const source = readWebFile(file);
    expect(source).not.toMatch(/mock(?:Pending|Approved|Rejected|Improvements|Comments|Documents)|Mock data|for demonstration/i);
    expect(source).not.toContain('Kuku Yalanji Dictionary PDF');
  });

  it('uses the implemented review and moderation endpoints', () => {
    expect(readWebFile('app/curator/pending/page.tsx')).toContain("fetch('/api/v2/curator/pending'");
    expect(readWebFile('app/curator/improvements/page.tsx')).toContain("fetch('/api/v2/curator/pending'");
    expect(readWebFile('app/curator/comments/page.tsx')).toContain('/api/v2/curator/comments/moderate');
    expect(readWebFile('app/curator/comments/page.tsx')).not.toContain('/api/v2/curator/comments/${');
  });

  it('cannot record simulated document extraction as completed', () => {
    const route = readWebFile('app/api/v2/admin/documents/[id]/process/route.ts');
    expect(route).toContain('DOCUMENT_PIPELINE_NOT_CONFIGURED');
    expect(route).toContain('{ status: 501 }');
    expect(route).not.toMatch(/Sample extracted text|extractedWords|processingStatus: 'completed'/);
  });

  it('keeps language-scoped data and cultural notes separate from moderation metadata', () => {
    const pendingRoute = readWebFile('app/api/v2/curator/pending/route.ts');
    const commentsRoute = readWebFile('app/api/v2/curator/comments/moderate/route.ts');
    const documentsRoute = readWebFile('app/api/v2/admin/documents/route.ts');
    expect(pendingRoute).not.toMatch(/communityNotes:\s*reason/);
    expect(pendingRoute).toContain('curatorLanguages.includes(languageId)');
    expect(commentsRoute).toContain('curatorLanguages.includes(languageId)');
    expect(documentsRoute).toContain('curatorLanguageIds.includes(languageId)');
  });
});

describe('location suggestion validation', () => {
  it('accepts valid numeric and string coordinates', () => {
    expect(parseSuggestedLocation({ latitude: -16.25, longitude: '145.5' })).toEqual({
      latitude: -16.25,
      longitude: 145.5,
    });
  });

  it.each([
    null,
    {},
    { latitude: -91, longitude: 145 },
    { latitude: -16, longitude: 181 },
    { latitude: 'not-a-number', longitude: 145 },
  ])('rejects invalid coordinates: %j', (value) => {
    expect(() => parseSuggestedLocation(value)).toThrow(/valid latitude and longitude/);
  });
});
