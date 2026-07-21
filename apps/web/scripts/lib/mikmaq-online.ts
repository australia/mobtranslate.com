import { createHash } from 'node:crypto';
import * as cheerio from 'cheerio';

export const MIKMAQ_ONLINE_BASE_URL = 'https://mikmaqonline.org/';
export const MIKMAQ_ONLINE_INDEX_URL = new URL('all-words.html', MIKMAQ_ONLINE_BASE_URL).href;
export const MIKMAQ_ONLINE_SOURCE_SLUG = 'mikmaq-online-talking-dictionary';
export const MIKMAQ_RESEARCH_ROOT =
  process.env.MIKMAQ_RESEARCH_ROOT ??
  '/mnt/donto-data/donto-resources/research/migmaq-online-talking-dictionary-2026-07-12';

export interface MikmaqIndexEntry {
  externalEntryId: string;
  sourceUrl: string;
  indexLabel: string;
  rawHtmlPath: string;
}

export interface MikmaqAudioReference {
  externalRecordingId: string;
  kind: 'word' | 'sentence';
  speakerCode: string | null;
  sourceAudioUrl: string;
  sourceEntryUrl: string;
  sourceHeadword: string;
  exampleIndex: number | null;
  audioFileName: string;
  archiveRelativePath: string;
}

export interface MikmaqExample {
  text: string;
  translation: string | null;
  recordings: MikmaqAudioReference[];
}

export interface MikmaqEntry {
  externalEntryId: string;
  sourceUrl: string;
  sourceHeadword: string;
  normalizedHeadword: string;
  translation: string | null;
  partOfSpeech: string | null;
  meanings: string[];
  pronunciationGuide: string | null;
  alternateForms: string[];
  wordRecordings: MikmaqAudioReference[];
  examples: MikmaqExample[];
  discoveredAudioCount: number;
  unclassifiedAudioUrls: string[];
  rawHtmlPath: string;
  rawHtmlSha256: string;
  fetchedAt: string;
}

export function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

export function canonicalMikmaqOrthography(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeMikmaqText(value: string): string {
  return canonicalMikmaqOrthography(value)
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('en-CA');
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function canonicalSourceUrl(href: string, baseUrl: string): string | null {
  try {
    const url = new URL(href, baseUrl);
    if (url.origin !== new URL(MIKMAQ_ONLINE_BASE_URL).origin) return null;
    url.hash = '';
    return url.href;
  } catch {
    return null;
  }
}

export function sourceEntryId(sourceUrl: string): string {
  const url = new URL(sourceUrl);
  return decodeURIComponent(url.pathname.replace(/^\//, ''));
}

export function rawEntryRelativePath(sourceUrl: string): string {
  return `raw/entries/${sha256(sourceUrl)}.html`;
}

export function parseMikmaqIndex(html: string, indexUrl = MIKMAQ_ONLINE_INDEX_URL): MikmaqIndexEntry[] {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const entries: MikmaqIndexEntry[] = [];

  $('a[href]').each((_index, element) => {
    const href = $(element).attr('href');
    if (!href) return;
    const sourceUrl = canonicalSourceUrl(href, indexUrl);
    if (!sourceUrl) return;
    const pathname = new URL(sourceUrl).pathname;
    if (!pathname.startsWith('/entries/') || !pathname.endsWith('.html') || seen.has(sourceUrl)) return;

    seen.add(sourceUrl);
    entries.push({
      externalEntryId: sourceEntryId(sourceUrl),
      sourceUrl,
      indexLabel: cleanText($(element).text()),
      rawHtmlPath: rawEntryRelativePath(sourceUrl),
    });
  });

  return entries;
}

export function parseMikmaqIndexAudioUrls(
  html: string,
  indexUrl = MIKMAQ_ONLINE_INDEX_URL,
): string[] {
  const $ = cheerio.load(html);
  return [
    ...new Set(
      $('a[href*="derived/compressed-audio/"]')
        .map((_index, element) => {
          const href = $(element).attr('href');
          return href ? canonicalSourceUrl(href, indexUrl) : null;
        })
        .get()
        .filter((url): url is string => url !== null),
    ),
  ];
}

function sectionsByLabel($: cheerio.CheerioAPI, label: string) {
  const matches: Array<ReturnType<typeof $>> = [];
  $('.page-content .entry-scope').each((_index, element) => {
    const firstBold = cleanText($(element).find('b').first().text()).replace(/:\s*$/, '');
    if (firstBold === label) matches.push($(element));
  });
  return matches;
}

function sectionByLabel($: cheerio.CheerioAPI, label: string) {
  return sectionsByLabel($, label)[0] ?? null;
}

function valueByLabel($: cheerio.CheerioAPI, label: string): string | null {
  let value: string | null = null;
  $('.page-content b').each((_index, element) => {
    if (value !== null) return;
    // Entry-level values precede the document material, but the same labels
    // also occur inside example <li>s and source-reference tables.
    if ($(element).closest('li, table').length > 0) return;
    const candidate = cleanText($(element).text()).replace(/:\s*$/, '');
    if (candidate !== label) return;
    const parent = $(element).parent().clone();
    parent.find('b').first().remove();
    const text = cleanText(parent.text());
    value = text || null;
  });
  return value;
}

function speakerCode(anchorText: string): string | null {
  const value = cleanText(anchorText)
    .replace(/^Recording by\s+/i, '')
    .replace(/[🔉🔊]\s*$/u, '')
    .trim();
  return value || null;
}

function audioFileName(sourceAudioUrl: string): string {
  const basename = decodeURIComponent(new URL(sourceAudioUrl).pathname.split('/').pop() ?? '');
  if (/^[a-f0-9]{64}\.mp3$/i.test(basename)) return basename.toLowerCase();
  return `${sha256(sourceAudioUrl)}.mp3`;
}

function parseAudioAnchor(
  $: cheerio.CheerioAPI,
  element: Parameters<cheerio.CheerioAPI>[0],
  options: {
    kind: 'word' | 'sentence';
    entryUrl: string;
    headword: string;
    exampleIndex: number | null;
  },
): MikmaqAudioReference | null {
  const href = $(element).attr('href');
  if (!href) return null;
  const sourceAudioUrl = canonicalSourceUrl(href, options.entryUrl);
  if (!sourceAudioUrl || !new URL(sourceAudioUrl).pathname.includes('/derived/compressed-audio/')) return null;
  const fileName = audioFileName(sourceAudioUrl);
  const identity = [options.entryUrl, options.kind, options.exampleIndex ?? 'word', sourceAudioUrl].join('\n');

  return {
    externalRecordingId: sha256(identity),
    kind: options.kind,
    speakerCode: speakerCode($(element).text()),
    sourceAudioUrl,
    sourceEntryUrl: options.entryUrl,
    sourceHeadword: options.headword,
    exampleIndex: options.exampleIndex,
    audioFileName: fileName,
    archiveRelativePath: `raw/audio/${fileName.slice(0, 3)}/${fileName}`,
  };
}

export function parseMikmaqEntry(
  html: string,
  sourceUrl: string,
  options: { rawHtmlPath?: string; fetchedAt?: string } = {},
): MikmaqEntry {
  const $ = cheerio.load(html);
  const sourceHeadword = cleanText($('h1.entry-scope').first().text());
  if (!sourceHeadword) throw new Error(`No headword found at ${sourceUrl}`);

  const recordingsSection = sectionByLabel($, 'Recordings');
  const wordRecordings = recordingsSection
    ? recordingsSection
        .find('a[href]')
        .map((_index, element) =>
          parseAudioAnchor($, element, {
            kind: 'word',
            entryUrl: sourceUrl,
            headword: sourceHeadword,
            exampleIndex: null,
          }),
        )
        .get()
        .filter((recording): recording is MikmaqAudioReference => recording !== null)
    : [];

  const meaningsSection = sectionByLabel($, 'Meanings');
  const meanings = meaningsSection
    ? meaningsSection
        .find('ul')
        .first()
        .children('li')
        .map((_index, element) => cleanText($(element).text()))
        .get()
        .filter(Boolean)
    : [];

  const alternateSection = sectionByLabel($, 'Alternate Grammatical Forms');
  const alternateForms = alternateSection
    ? alternateSection
        .find('ul')
        .first()
        .children('li')
        .map((_index, element) => cleanText($(element).text()))
        .get()
        .filter(Boolean)
    : [];

  const examples: MikmaqExample[] = [];
  for (const examplesSection of sectionsByLabel($, 'Example of word used in a sentence')) {
    examplesSection.find('ul').first().children('li').each((_sectionExampleIndex, element) => {
      const exampleIndex = examples.length;
      const item = $(element);
      let text: string | null = null;
      let translation: string | null = null;
      item.children('div').each((_index, child) => {
        const label = cleanText($(child).find('b').first().text()).replace(/:\s*$/, '');
        const value = $(child).clone();
        value.find('b').first().remove();
        if (label === 'Text') text = cleanText(value.text()) || null;
        if (label === 'Translation') translation = cleanText(value.text()) || null;
      });
      if (!text) return;
      const recordings = item
        .find('a[href]')
        .map((_index, anchor) =>
          parseAudioAnchor($, anchor, {
            kind: 'sentence',
            entryUrl: sourceUrl,
            headword: sourceHeadword,
            exampleIndex,
          }),
        )
        .get()
        .filter((recording): recording is MikmaqAudioReference => recording !== null);
      examples.push({ text, translation, recordings });
    });
  }

  const discoveredAudioUrls = [
    ...new Set(
      $('.page-content a[href]')
        .map((_index, element) => {
          const href = $(element).attr('href');
          if (!href) return null;
          const url = canonicalSourceUrl(href, sourceUrl);
          return url && new URL(url).pathname.includes('/derived/compressed-audio/') ? url : null;
        })
        .get()
        .filter((url): url is string => url !== null),
    ),
  ];
  const classifiedAudioUrls = new Set([
    ...wordRecordings.map((recording) => recording.sourceAudioUrl),
    ...examples.flatMap((example) => example.recordings.map((recording) => recording.sourceAudioUrl)),
  ]);

  return {
    externalEntryId: sourceEntryId(sourceUrl),
    sourceUrl,
    sourceHeadword,
    normalizedHeadword: normalizeMikmaqText(sourceHeadword),
    translation: valueByLabel($, 'Translation'),
    partOfSpeech: valueByLabel($, 'Part of Speech'),
    meanings,
    pronunciationGuide: valueByLabel($, 'Pronunciation Guide'),
    alternateForms,
    wordRecordings,
    examples,
    discoveredAudioCount: discoveredAudioUrls.length,
    unclassifiedAudioUrls: discoveredAudioUrls.filter((url) => !classifiedAudioUrls.has(url)),
    rawHtmlPath: options.rawHtmlPath ?? rawEntryRelativePath(sourceUrl),
    rawHtmlSha256: sha256(html),
    fetchedAt: options.fetchedAt ?? new Date().toISOString(),
  };
}

export function entryAudio(entry: MikmaqEntry): MikmaqAudioReference[] {
  return [...entry.wordRecordings, ...entry.examples.flatMap((example) => example.recordings)];
}
