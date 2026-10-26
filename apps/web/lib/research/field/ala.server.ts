import 'server-only';

import type { Bounds } from './types';
import type { PublicRecord } from './store.server';

const ALA_SEARCH = 'https://biocache-ws.ala.org.au/ws/occurrences/search';
// ALA answers 503 to larger pages, so page through 100 at a time.
const PAGE_SIZE = 100;
const MAX_RECORDS = 20_000;

type AlaOccurrence = {
  uuid?: string;
  scientificName?: string;
  decimalLatitude?: number;
  decimalLongitude?: number;
  coordinateUncertaintyInMeters?: number;
  eventDate?: number | string;
  basisOfRecord?: string;
  dataResourceName?: string;
};

async function fetchPage(params: URLSearchParams): Promise<{ total: number; occurrences: AlaOccurrence[] }> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const response = await fetch(`${ALA_SEARCH}?${params}`, {
        headers: { 'user-agent': 'mobtranslate-field-models/0.1' },
        cache: 'no-store',
        signal: AbortSignal.timeout(60_000),
      });
      if (response.ok) {
        const body = (await response.json()) as { totalRecords?: number; occurrences?: AlaOccurrence[] };
        return { total: body.totalRecords ?? 0, occurrences: body.occurrences ?? [] };
      }
      lastError = new Error(`ALA answered ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000 * (attempt + 1)));
  }
  throw lastError instanceof Error ? lastError : new Error('ALA request failed');
}

/**
 * Download public occurrence records for the given names (each matched with
 * its varieties and subspecies) inside `bounds`. Queries carry taxon names
 * and the box only, never the operator's own finds.
 */
export async function fetchAlaRecords(scientificNames: string[], bounds: Bounds): Promise<PublicRecord[]> {
  const records = new Map<string, PublicRecord>();
  for (const name of scientificNames) {
    let start = 0;
    for (;;) {
      const params = new URLSearchParams({ q: `taxa:"${name.replaceAll('"', '')}"`, pageSize: String(PAGE_SIZE), startIndex: String(start) });
      params.append('fq', `decimalLatitude:[${bounds.south} TO ${bounds.north}]`);
      params.append('fq', `decimalLongitude:[${bounds.west} TO ${bounds.east}]`);
      const { total, occurrences } = await fetchPage(params);
      for (const o of occurrences) {
        if (!o.uuid || typeof o.decimalLatitude !== 'number' || typeof o.decimalLongitude !== 'number') continue;
        records.set(o.uuid, {
          recordId: o.uuid,
          scientificName: o.scientificName ?? null,
          latitude: o.decimalLatitude,
          longitude: o.decimalLongitude,
          uncertaintyM: typeof o.coordinateUncertaintyInMeters === 'number' ? o.coordinateUncertaintyInMeters : null,
          eventDate: o.eventDate === undefined ? null : typeof o.eventDate === 'number' ? new Date(o.eventDate).toISOString().slice(0, 10) : String(o.eventDate),
          basisOfRecord: o.basisOfRecord ?? null,
          dataset: o.dataResourceName ?? null,
        });
      }
      start += occurrences.length;
      if (occurrences.length === 0 || start >= total || records.size >= MAX_RECORDS) break;
    }
  }
  return [...records.values()];
}
