import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import {
  recordingImportEntries,
  recordingSources,
} from '@/lib/db/schema';
import {
  buildPublicWordSources,
  type ImportedWordSourceRow,
  type PublicWordSource,
} from '@/lib/word-provenance';

export async function getPublicWordSources(input: {
  wordId: string;
  languageCode?: string | null;
  entrySource?: string | null;
}): Promise<PublicWordSource[]> {
  const rows = await db
    .select({
      sourceId: recordingSources.id,
      sourceName: recordingSources.name,
      sourceUrl: recordingSources.sourceUrl,
      sourceEntryUrl: recordingImportEntries.sourceEntryUrl,
      attributionText: recordingSources.attributionText,
      licenseName: recordingSources.licenseName,
      licenseUrl: recordingSources.licenseUrl,
      mappingStatus: recordingImportEntries.mappingStatus,
    })
    .from(recordingImportEntries)
    .innerJoin(recordingSources, eq(recordingImportEntries.sourceId, recordingSources.id))
    .where(eq(recordingImportEntries.wordId, input.wordId));

  return buildPublicWordSources({
    languageCode: input.languageCode,
    entrySource: input.entrySource,
    importedSources: rows as ImportedWordSourceRow[],
  });
}
