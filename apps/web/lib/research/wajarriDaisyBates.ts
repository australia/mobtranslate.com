import { createHash } from 'node:crypto';
import { load } from 'cheerio';
import { z } from 'zod';

const BatesImagePathSchema = z
  .string()
  .regex(/^\/images\/54\/54-\d+[a-z]?[MT]\.jpg$/u);

export const WajarriDictionarySourceRecordSchema = z.object({
  Wajarri: z.string().trim().min(1),
  English: z.string().trim().min(1),
  description: z.string().trim().min(1),
  sound: z.string().trim().min(1),
  image: z.string().trim().min(1).optional(),
});

export interface DaisyBatesCurrentDictionaryMatch {
  sourceRecordId: string;
  sourceOrdinal: number;
  headwordSource: string;
  englishSource: string;
  descriptionSource: string;
  soundSource: string;
}

export interface DaisyBatesSourceRow {
  schemaVersion: 1;
  inventoryId: 'wajarri-digital-daisy-bates-wajida-54-200t-v0.1.0';
  sourceId: 'src-wbv-digital-daisy-bates-wajida-54-200t-20260723';
  sourceRowId: string;
  sourceOrdinal: number;
  termSource: string;
  glossSource: string;
  glossFragmentsSource: string[];
  termTitleAttributeSource: string | null;
  termTokenCount: number;
  glossTokenCount: number;
  glossStatus: 'present' | 'empty_source_gloss_preserved';
  sourceShape: 'single_token_source_form' | 'multi_token_source_form';
  typescriptImagePath: string;
  manuscriptImagePath: string | null;
  sourceAttestationStatus: 'historical_transcription_linked_to_page_images';
  sourceDateStatus: 'project_level_early_1900s_exact_recording_date_unresolved';
  orthographyStatus: 'historical_source_transcription_unmapped';
  lexicalSenseStatus: 'unadjudicated';
  taskClassificationStatus: 'unadjudicated';
  currentDictionaryRelation:
    | 'no_exact_current_headword'
    | 'unique_exact_current_headword'
    | 'multiple_exact_current_headwords';
  currentDictionaryMatches: DaisyBatesCurrentDictionaryMatch[];
  directSupervisionEligibility: 'blocked_pending_source_row_review';
  splitAssignment: 'unassigned';
  trainingEligibility: 'not_eligible';
  benchmarkEligibility: 'not_eligible';
  syntheticEligibility: 'not_eligible';
  synthetic: false;
  claimLimit: string;
}

export interface DaisyBatesPageImage {
  schemaVersion: 1;
  assetId: string;
  sourceId: 'src-wbv-digital-daisy-bates-wajida-54-200t-20260723';
  role: 'typescript_page' | 'manuscript_page';
  remotePath: string;
  remoteUrl: string;
  archiveRelativePath: string;
}

export interface DaisyBatesInventory {
  sourceRows: DaisyBatesSourceRow[];
  pageImages: DaisyBatesPageImage[];
  report: {
    inventoryId: DaisyBatesSourceRow['inventoryId'];
    sourceId: DaisyBatesSourceRow['sourceId'];
    documentTitleSource: string;
    languageLabelSource: 'Watjarri';
    sourceRows: number;
    singleTokenSourceRows: number;
    multiTokenSourceRows: number;
    emptyGlossSourceRows: number;
    typescriptImages: number;
    manuscriptImages: number;
    exactCurrentHeadwordRows: number;
    rowsWithoutExactCurrentHeadword: number;
    directSupervisionRows: 0;
    benchmarkRows: 0;
    trainingRows: 0;
    syntheticRows: 0;
    productiveGrammarRules: 0;
  };
}

function canonicalText(value: string): string {
  return value.normalize('NFC').trim().toLocaleLowerCase('en');
}

function compactText(value: string): string {
  return value.normalize('NFC').replace(/\s+/gu, ' ').trim();
}

function tokenCount(value: string): number {
  return compactText(value).split(/\s+/u).filter(Boolean).length;
}

function shortHash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 24);
}

function imageRole(path: string): DaisyBatesPageImage['role'] {
  return path.endsWith('T.jpg') ? 'typescript_page' : 'manuscript_page';
}

function metadataValue(
  $: ReturnType<typeof load>,
  label: 'Title' | 'Language',
): string {
  let result = '';
  $('#about-text p').each((_index, element) => {
    const row = $(element);
    const heading = compactText(row.find('.heading').text()).replace(/:$/u, '');
    if (heading !== label) return;
    const copy = row.clone();
    copy.find('.heading').remove();
    result = compactText(copy.text());
  });
  if (!result) throw new Error(`missing document metadata: ${label}`);
  return result;
}

function ensureUnique<T>(
  rows: T[],
  key: (_row: T) => string,
  label: string,
): void {
  const seen = new Set<string>();
  for (const row of rows) {
    const value = key(row);
    if (seen.has(value)) throw new Error(`duplicate ${label}: ${value}`);
    seen.add(value);
  }
}

export function buildDaisyBatesWajidaInventory(input: {
  html: string;
  currentDictionaryValue: unknown;
}): DaisyBatesInventory {
  const dictionary = z
    .array(WajarriDictionarySourceRecordSchema)
    .parse(input.currentDictionaryValue);
  const $ = load(input.html);
  const title = metadataValue($, 'Title');
  const language = metadataValue($, 'Language');
  if (!title.startsWith('Vocabulary of Wajida'))
    throw new Error(`unexpected document title: ${title}`);
  if (language !== 'Watjarri')
    throw new Error(`unexpected source language label: ${language}`);

  const currentByHeadword = new Map<
    string,
    Array<{
      row: z.infer<typeof WajarriDictionarySourceRecordSchema>;
      ordinal: number;
    }>
  >();
  for (const [offset, row] of dictionary.entries()) {
    const key = canonicalText(row.Wajarri);
    const matches = currentByHeadword.get(key) ?? [];
    matches.push({ row, ordinal: offset + 1 });
    currentByHeadword.set(key, matches);
  }

  const sourceRows: DaisyBatesSourceRow[] = [];
  $('tr:has(span.term)').each((_offset, element) => {
    const row = $(element);
    const termElement = row.find('span.term').first();
    const term = compactText(termElement.text());
    const cells = row.find('td');
    if (cells.length < 2)
      throw new Error(`source term has fewer than two cells: ${term}`);
    const glossCell = cells.eq(1);
    const gloss = compactText(glossCell.text());
    if (!term)
      throw new Error(
        `empty source term at source row ${sourceRows.length + 1}`,
      );

    const typescriptImagePath = BatesImagePathSchema.parse(
      row.attr('data-ts-image'),
    );
    const manuscriptValue = row.attr('data-ms-image');
    const manuscriptImagePath = manuscriptValue
      ? BatesImagePathSchema.parse(manuscriptValue)
      : null;
    if (!typescriptImagePath.endsWith('T.jpg'))
      throw new Error(`invalid typescript image role: ${typescriptImagePath}`);
    if (manuscriptImagePath && !manuscriptImagePath.endsWith('M.jpg'))
      throw new Error(`invalid manuscript image role: ${manuscriptImagePath}`);

    const currentMatches = (
      currentByHeadword.get(canonicalText(term)) ?? []
    ).map(
      ({ row: match, ordinal }): DaisyBatesCurrentDictionaryMatch => ({
        sourceRecordId: `wbv-src-local-${String(ordinal).padStart(6, '0')}`,
        sourceOrdinal: ordinal,
        headwordSource: match.Wajarri,
        englishSource: match.English,
        descriptionSource: match.description,
        soundSource: match.sound,
      }),
    );
    const sourceOrdinal = sourceRows.length + 1;
    const sourceRowId = `wbv-bates-54-200t-row-${shortHash(
      `${sourceOrdinal}\u0000${term}\u0000${gloss}\u0000${typescriptImagePath}\u0000${manuscriptImagePath ?? ''}`,
    )}`;
    sourceRows.push({
      schemaVersion: 1,
      inventoryId: 'wajarri-digital-daisy-bates-wajida-54-200t-v0.1.0',
      sourceId: 'src-wbv-digital-daisy-bates-wajida-54-200t-20260723',
      sourceRowId,
      sourceOrdinal,
      termSource: term,
      glossSource: gloss,
      glossFragmentsSource: glossCell
        .find('.gloss')
        .toArray()
        .map((fragment) => compactText($(fragment).text()))
        .filter(Boolean),
      termTitleAttributeSource: termElement.attr('title') ?? null,
      termTokenCount: tokenCount(term),
      glossTokenCount: tokenCount(gloss),
      glossStatus: gloss ? 'present' : 'empty_source_gloss_preserved',
      sourceShape:
        tokenCount(term) === 1
          ? 'single_token_source_form'
          : 'multi_token_source_form',
      typescriptImagePath,
      manuscriptImagePath,
      sourceAttestationStatus: 'historical_transcription_linked_to_page_images',
      sourceDateStatus:
        'project_level_early_1900s_exact_recording_date_unresolved',
      orthographyStatus: 'historical_source_transcription_unmapped',
      lexicalSenseStatus: 'unadjudicated',
      taskClassificationStatus: 'unadjudicated',
      currentDictionaryRelation:
        currentMatches.length === 0
          ? 'no_exact_current_headword'
          : currentMatches.length === 1
            ? 'unique_exact_current_headword'
            : 'multiple_exact_current_headwords',
      currentDictionaryMatches: currentMatches,
      directSupervisionEligibility: 'blocked_pending_source_row_review',
      splitAssignment: 'unassigned',
      trainingEligibility: 'not_eligible',
      benchmarkEligibility: 'not_eligible',
      syntheticEligibility: 'not_eligible',
      synthetic: false,
      claimLimit:
        'This row preserves a historical source transcription and gloss linked to page images. It does not establish a modern Wajarri spelling, lexical identity, sense equivalence, morphology, productive grammar, independent benchmark reference, training row, or controlled synthetic sentence pair.',
    });
  });
  ensureUnique(sourceRows, (row) => row.sourceRowId, 'source row ID');

  const imagePaths = new Set<string>();
  $('[data-ts-image], [data-ms-image], a[href^="/images/54/"]').each(
    (_index, element) => {
      for (const attribute of ['data-ts-image', 'data-ms-image', 'href']) {
        const value = $(element).attr(attribute);
        if (value && BatesImagePathSchema.safeParse(value).success)
          imagePaths.add(value);
      }
    },
  );
  const pageImages = [...imagePaths]
    .sort((left, right) => left.localeCompare(right, 'en'))
    .map((remotePath): DaisyBatesPageImage => {
      const role = imageRole(remotePath);
      return {
        schemaVersion: 1,
        assetId: `wbv-bates-54-200t-image-${shortHash(remotePath)}`,
        sourceId: 'src-wbv-digital-daisy-bates-wajida-54-200t-20260723',
        role,
        remotePath,
        remoteUrl: `https://bates.org.au${remotePath}`,
        archiveRelativePath: `${role === 'typescript_page' ? 'images/typescript' : 'images/manuscript'}/${remotePath.split('/').at(-1)}`,
      };
    });
  ensureUnique(pageImages, (row) => row.assetId, 'page image asset ID');

  const exactRows = sourceRows.filter(
    (row) => row.currentDictionaryMatches.length > 0,
  ).length;
  return {
    sourceRows,
    pageImages,
    report: {
      inventoryId: 'wajarri-digital-daisy-bates-wajida-54-200t-v0.1.0',
      sourceId: 'src-wbv-digital-daisy-bates-wajida-54-200t-20260723',
      documentTitleSource: title,
      languageLabelSource: 'Watjarri',
      sourceRows: sourceRows.length,
      singleTokenSourceRows: sourceRows.filter(
        (row) => row.sourceShape === 'single_token_source_form',
      ).length,
      multiTokenSourceRows: sourceRows.filter(
        (row) => row.sourceShape === 'multi_token_source_form',
      ).length,
      emptyGlossSourceRows: sourceRows.filter(
        (row) => row.glossStatus === 'empty_source_gloss_preserved',
      ).length,
      typescriptImages: pageImages.filter(
        (row) => row.role === 'typescript_page',
      ).length,
      manuscriptImages: pageImages.filter(
        (row) => row.role === 'manuscript_page',
      ).length,
      exactCurrentHeadwordRows: exactRows,
      rowsWithoutExactCurrentHeadword: sourceRows.length - exactRows,
      directSupervisionRows: 0,
      benchmarkRows: 0,
      trainingRows: 0,
      syntheticRows: 0,
      productiveGrammarRules: 0,
    },
  };
}
