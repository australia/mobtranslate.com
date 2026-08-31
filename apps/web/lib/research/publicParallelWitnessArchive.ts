import { load } from 'cheerio';

export interface EvidenceMarker {
  markerId: string;
  text: string;
  expectedCount: number;
}

export interface LocatedEvidenceMarker extends EvidenceMarker {
  normalizedText: string;
  observedCount: number;
  lineNumbers: number[];
  matchingLines: string[];
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/gu, ' ').trim();
}

export function normalizeExtractedText(value: string): string {
  return value
    .replace(/\r\n?/gu, '\n')
    .split('\n')
    .map(collapseWhitespace)
    .filter(Boolean)
    .join('\n')
    .concat('\n');
}

export function extractVisibleHtmlText(html: string): string {
  const $ = load(html);
  $('script, style, noscript, svg, template').remove();
  $('br').replaceWith('\n');
  $('p, li, h1, h2, h3, h4, h5, h6, blockquote, article, section').each(
    (_index, element) => {
      $(element).append('\n');
    },
  );
  return normalizeExtractedText($.root().text());
}

export function locateEvidenceMarkers(
  text: string,
  markers: EvidenceMarker[],
): LocatedEvidenceMarker[] {
  const lines = normalizeExtractedText(text).trimEnd().split('\n');
  const duplicateIds = markers
    .map((marker) => marker.markerId)
    .filter((id, index, all) => all.indexOf(id) !== index);
  if (duplicateIds.length)
    throw new Error(`duplicate marker IDs: ${[...new Set(duplicateIds)].join(', ')}`);

  return markers.map((marker) => {
    const normalizedText = collapseWhitespace(marker.text);
    if (!normalizedText) throw new Error(`empty marker ${marker.markerId}`);
    const matching = lines
      .map((line, index) => ({ line, lineNumber: index + 1 }))
      .filter(({ line }) => line.includes(normalizedText));
    if (matching.length !== marker.expectedCount) {
      throw new Error(
        `marker ${marker.markerId} expected ${marker.expectedCount} line matches, observed ${matching.length}`,
      );
    }
    return {
      ...marker,
      normalizedText,
      observedCount: matching.length,
      lineNumbers: matching.map(({ lineNumber }) => lineNumber),
      matchingLines: matching.map(({ line }) => line),
    };
  });
}
