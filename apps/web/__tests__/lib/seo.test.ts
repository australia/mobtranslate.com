import { describe, expect, it } from 'vitest';
import { pageMetadata, privatePage, SHARE_IMAGE, X_HANDLE } from '@/lib/seo';
import { pickHeadword } from '@/lib/dictionary-headword';
import type { Word } from '@/lib/supabase/types';

describe('page metadata', () => {
  const meta = pageMetadata({ title: 'Kuku Yalanji Dictionary', description: 'Words of Kuku Yalanji.', path: '/dictionaries/kuku_yalanji' });

  it('points the canonical and og:url at the page itself', () => {
    expect(meta.alternates?.canonical).toBe('/dictionaries/kuku_yalanji');
    expect(meta.openGraph?.url).toBe('/dictionaries/kuku_yalanji');
  });

  it('gives X and Open Graph the same title, description and card', () => {
    expect(meta.title).toBe('Kuku Yalanji Dictionary');
    expect(meta.openGraph?.title).toBe('Kuku Yalanji Dictionary | Mob Translate');
    expect(meta.twitter).toMatchObject({
      card: 'summary_large_image',
      site: X_HANDLE,
      title: 'Kuku Yalanji Dictionary | Mob Translate',
      description: 'Words of Kuku Yalanji.',
    });
    expect(meta.openGraph?.images).toEqual([SHARE_IMAGE]);
  });

  it('keeps the homepage title whole', () => {
    const home = pageMetadata({ title: 'Mob Translate', description: 'x', path: '/', absoluteTitle: true });
    expect(home.title).toEqual({ absolute: 'Mob Translate' });
    expect(home.openGraph?.title).toBe('Mob Translate');
  });

  it('keeps private pages out of search', () => {
    expect(privatePage('Sign in').robots).toEqual({ index: false, follow: false });
    expect(pageMetadata({ title: 't', description: 'd', path: '/labs/v2', noindex: true }).robots).toEqual({ index: false, follow: false });
    expect(meta.robots).toBeUndefined();
  });
});

describe('the entry a word URL names', () => {
  const word = (id: string, spelling: string, extra: Partial<Word> = {}) =>
    ({ id, word: spelling, language_id: 'l', created_at: '2026-01-01', ...extra }) as Word;

  it('prefers the exact spelling, then ignores case', () => {
    const words = [word('a', 'Bama'), word('b', 'bama')];
    expect(pickHeadword(words, 'bama')?.id).toBe('b');
    expect(pickHeadword([word('a', 'Bama')], 'bama')?.id).toBe('a');
    expect(pickHeadword(words, 'jalbu')).toBeUndefined();
  });

  it('treats curly and straight apostrophes alike, and picks the fullest duplicate', () => {
    const words = [word('thin', "gmu'j"), word('full', 'gmu’j', { gloss: 'tree', notes: 'n' })];
    expect(pickHeadword(words, "gmu'j")?.id).toBe('full');
  });
});
