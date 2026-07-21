// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  canonicalMikmaqOrthography,
  normalizeMikmaqText,
  parseMikmaqEntry,
  parseMikmaqIndex,
  parseMikmaqIndexAudioUrls,
} from '../../scripts/lib/mikmaq-online';

const ENTRY_URL = "https://mikmaqonline.org/entries/g/guntewi'ganmit/guntewi'ganmit.html";

describe('Mi\'kmaq Online parser', () => {
  it('extracts and deduplicates dictionary entry links from the index', () => {
    const html = `
      <li><a href="entries/a/ap/ap.html"><strong>ap</strong>: sits</a>
      <a href="derived/compressed-audio/abc/abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd.mp3">audio</a></li>
      <a href="entries/a/ap/ap.html">duplicate</a>
      <a href="https://example.org/entries/x/x.html">external</a>
    `;

    expect(parseMikmaqIndex(html)).toEqual([
      expect.objectContaining({
        externalEntryId: 'entries/a/ap/ap.html',
        sourceUrl: 'https://mikmaqonline.org/entries/a/ap/ap.html',
        indexLabel: 'ap: sits',
      }),
    ]);
    expect(parseMikmaqIndexAudioUrls(html)).toEqual([
      'https://mikmaqonline.org/derived/compressed-audio/abc/abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd.mp3',
    ]);
  });

  it('parses headword, linguistic fields, word audio, and sentence audio', () => {
    const html = `
      <div class="page-content">
        <h1 class="entry-scope">guntewi'ganmit</h1>
        <div class="entry-scope"><b>Recordings:</b><ul>
          <li><a href="../../../derived/compressed-audio/685/68565261f5d6c5fbe10b7e0e56ea96ce0d6327edd8ae3484a5579b863b181eb8.mp3">Recording by dmm</a></li>
          <li><a href="../../../derived/compressed-audio/c77/c77aadd8ed60e990459b6a162f4c88af88a49b3764db054d93c8858c5ef393db.mp3">Recording by ewm</a></li>
        </ul></div>
        <div class="entry-scope"><div><b>Translation: </b>He/she has a stone house</div></div>
        <div><b>Part of Speech: </b>verb animate intransitive</div>
        <div class="entry-scope"><b>Meanings:</b><ul><li>has a stone house</li><li>has a rock house</li></ul></div>
        <div class="entry-scope"><b>Example of word used in a sentence:</b><ul><li>
          <div><b>Text: </b>Mu gejiaqas guntewi'ganmit.</div>
          <div><b>Translation: </b><i>I didn't know he/she had a stone house.</i></div>
          <div><b>Recording: </b><a href="../../../derived/compressed-audio/bd0/bd03037a25254f7d4062141504ace21d61f410cbe0dae3db3b051c8fba8cf9cc.mp3">Recording by dmm 🔉</a></div>
        </li></ul></div>
        <div class="entry-scope"><b>Example of word used in a sentence:</b><ul><li>
          <div><b>Text: </b>Etug guntewi'ganmit.</div>
          <div><b>Translation: </b><i>Perhaps he/she has a stone house.</i></div>
          <div><b>Recording: </b><a href="../../../derived/compressed-audio/abc/abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd.mp3">Recording by jnw 🔉</a></div>
        </li></ul></div>
        <div class="entry-scope"><div><b>Pronunciation Guide: </b> gun·dew·ii·gan·mit</div></div>
        <div class="entry-scope"><b>Alternate Grammatical Forms:</b><ul><li>guntewi'ganmi -- I have a stone house</li></ul></div>
      </div>
    `;

    const entry = parseMikmaqEntry(html, ENTRY_URL, { fetchedAt: '2026-07-12T00:00:00.000Z' });

    expect(entry).toMatchObject({
      sourceHeadword: "guntewi'ganmit",
      normalizedHeadword: "guntewi'ganmit",
      translation: 'He/she has a stone house',
      partOfSpeech: 'verb animate intransitive',
      meanings: ['has a stone house', 'has a rock house'],
      pronunciationGuide: 'gun·dew·ii·gan·mit',
      alternateForms: ["guntewi'ganmi -- I have a stone house"],
      discoveredAudioCount: 4,
      unclassifiedAudioUrls: [],
    });
    expect(entry.wordRecordings).toHaveLength(2);
    expect(entry.wordRecordings[0]).toMatchObject({ kind: 'word', speakerCode: 'dmm' });
    expect(entry.examples).toEqual([
      expect.objectContaining({
        text: "Mu gejiaqas guntewi'ganmit.",
        translation: "I didn't know he/she had a stone house.",
        recordings: [expect.objectContaining({ kind: 'sentence', speakerCode: 'dmm', exampleIndex: 0 })],
      }),
      expect.objectContaining({
        text: "Etug guntewi'ganmit.",
        translation: 'Perhaps he/she has a stone house.',
        recordings: [expect.objectContaining({ kind: 'sentence', speakerCode: 'jnw', exampleIndex: 1 })],
      }),
    ]);
  });

  it('normalizes Unicode apostrophes and combining marks without changing Mi\'gmaq letters', () => {
    expect(normalizeMikmaqText("  A’p e\u0301g  ")).toBe("a'p eg");
    expect(canonicalMikmaqOrthography("  Winpegijuig  ")).toBe('Winpegijuig');
  });
});
