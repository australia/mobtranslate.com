import { createHash } from 'node:crypto';
import { z } from 'zod';

const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/u);
const KeySchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u);
const ComponentKeySchema = z.string().regex(/^[A-Za-z][A-Za-z0-9]*$/u);

const FileReferenceSchema = z.object({
  path: z.string().min(1),
  sha256: Sha256Schema,
});

const PageReferenceSchema = FileReferenceSchema.extend({
  page_key: KeySchema,
  physical_page: z.number().int().positive(),
  rendered_path: z.string().min(1).optional(),
  rendered_sha256: Sha256Schema.optional(),
});

const EvidenceSpanContractSchema = z.object({
  page_key: KeySchema,
  line_start: z.number().int().positive(),
  line_end: z.number().int().positive(),
  required_substrings: z.array(z.string().min(1)).min(1),
});

const ClosedEvidenceSchema = z.object({
  acceptanceStatus: z.literal('not_accepted'),
  trainingEligibility: z.literal('not_allowed'),
  benchmarkEligibility: z.literal('not_allowed'),
  syntheticEligibility: z.literal('not_allowed'),
});

const ObservationSchema = ClosedEvidenceSchema.extend({
  recordId: KeySchema,
  sourceId: KeySchema,
  evidenceSpans: z.array(EvidenceSpanContractSchema).min(1),
}).passthrough();

const DictionaryEvidenceLinkSchema = ObservationSchema.extend({
  targetEntryCandidateIds: z.array(KeySchema).min(1),
  targetSenseCandidateIds: z.array(KeySchema).default([]),
  targetFormCandidateIds: z.array(KeySchema).default([]),
});

const CitationChainSchema = ClosedEvidenceSchema.extend({
  recordId: KeySchema,
  sourceId: KeySchema,
  citedWork: z.string().min(1),
  accessStatus: z.string().min(1),
  epistemicRole: z.string().min(1),
}).passthrough();

const ScholarlySourceSchema = z
  .object({
    source_id: KeySchema,
    pdf: FileReferenceSchema.optional(),
    primary_artifact: FileReferenceSchema.optional(),
    extracted_text: FileReferenceSchema,
    landing_page: FileReferenceSchema.optional(),
    response_headers: z.array(FileReferenceSchema).default([]),
    pages: z.array(PageReferenceSchema).min(1),
    evidence_profile: z.enum(['publisher_snippet']).optional(),
    license: z.string().min(1),
    training_use: z.literal('not_allowed'),
    redistribution: z.enum(['allowed', 'not_allowed', 'needs_review']),
    derived_weights: z.literal('not_allowed'),
    hosted_transfer: z.literal('not_allowed'),
  })
  .superRefine((source, context) => {
    if (Boolean(source.pdf) === Boolean(source.primary_artifact))
      context.addIssue({
        code: 'custom',
        message: 'declare exactly one of pdf or primary_artifact',
      });
  });

export const ScholarlyLanguageEvidenceContractSchema = z.object({
  schema_version: z.literal(1),
  inventory_id: KeySchema,
  created_at_utc: z.string().datetime(),
  status: z.literal('scholarly_source_evidence_inventory'),
  scope: z.object({
    language: z.string().min(1),
    iso_639_3: z.string().length(3),
    variety: z.string().min(1),
    orthography: z.string().min(1),
  }),
  source: ScholarlySourceSchema,
  source_ledger: FileReferenceSchema,
  dictionary_context: z.object({
    edition_id: KeySchema,
    manifest: FileReferenceSchema,
    entry_component_key: ComponentKeySchema,
    sense_component_key: ComponentKeySchema,
    form_component_key: ComponentKeySchema,
  }),
  observations: z.object({
    grammar_assertions: z.array(ObservationSchema),
    grammar_examples: z.array(ObservationSchema),
    grammar_conflicts: z.array(ObservationSchema),
    dictionary_evidence_links: z.array(DictionaryEvidenceLinkSchema),
    citation_chain: z.array(CitationChainSchema),
  }),
  expected_counts: z.object({
    grammar_assertions: z.number().int().nonnegative(),
    grammar_examples: z.number().int().nonnegative(),
    grammar_conflicts: z.number().int().nonnegative(),
    dictionary_evidence_links: z.number().int().nonnegative(),
    citation_chain: z.number().int().nonnegative(),
  }),
  claim_limit: z.string().min(1),
});

export type ScholarlyLanguageEvidenceContract = z.infer<
  typeof ScholarlyLanguageEvidenceContractSchema
>;

interface ComponentReference {
  path: string;
  sha256: string;
  rows: number;
}

interface BuildInput {
  contractValue: unknown;
  pageTexts: Map<string, string>;
  sourceLedgerRows: Array<Record<string, unknown>>;
  dictionaryManifestValue: unknown;
  dictionaryEntries: Array<Record<string, unknown>>;
  dictionarySenses: Array<Record<string, unknown>>;
  dictionaryForms: Array<Record<string, unknown>>;
}

export interface ScholarlyLanguageEvidenceResult {
  components: {
    grammarAssertions: Array<Record<string, unknown>>;
    grammarExamples: Array<Record<string, unknown>>;
    grammarConflicts: Array<Record<string, unknown>>;
    dictionaryEvidenceLinks: Array<Record<string, unknown>>;
    citationChain: Array<Record<string, unknown>>;
  };
  evidenceSpans: Array<Record<string, unknown>>;
  validation: {
    grammarAssertions: number;
    grammarExamples: number;
    grammarConflicts: number;
    dictionaryEvidenceLinks: number;
    citationChain: number;
    evidenceSpans: number;
    acceptedRows: 0;
    trainingEligibleRows: 0;
  };
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function assertUnique(values: string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw new Error(`duplicate ${label}: ${value}`);
    seen.add(value);
  }
}

function componentReference(
  manifest: Record<string, unknown>,
  key: string,
): ComponentReference {
  const components = object(manifest.components, 'dictionary components');
  return z
    .object({
      path: z.string().min(1),
      sha256: Sha256Schema,
      rows: z.number().int().nonnegative(),
    })
    .parse(components[key]);
}

export function scholarlyPrimarySourceReference(
  source: z.infer<typeof ScholarlySourceSchema>,
): z.infer<typeof FileReferenceSchema> {
  const reference = source.pdf ?? source.primary_artifact;
  if (!reference) throw new Error('scholarly source lacks a primary artifact');
  return reference;
}

function lineSpan(text: string, start: number, end: number): string {
  const lines = text.replace(/\r\n/gu, '\n').split('\n');
  if (start > end) throw new Error(`invalid line span ${start}-${end}`);
  if (end > lines.length)
    throw new Error(`line span ${start}-${end} exceeds ${lines.length} lines`);
  return lines.slice(start - 1, end).join('\n');
}

function enrichObservations(
  rows: Array<z.infer<typeof ObservationSchema>>,
  pages: Map<
    string,
    z.infer<typeof PageReferenceSchema> & { text: string }
  >,
): {
  rows: Array<Record<string, unknown>>;
  spans: Array<Record<string, unknown>>;
} {
  const spans: Array<Record<string, unknown>> = [];
  const enriched = rows.map((row) => {
    const evidenceAnchors = row.evidenceSpans.map((span, index) => {
      const page = pages.get(span.page_key);
      if (!page) throw new Error(`unknown evidence page: ${span.page_key}`);
      const sourceSpan = lineSpan(page.text, span.line_start, span.line_end);
      for (const required of span.required_substrings)
        if (!sourceSpan.includes(required))
          throw new Error(
            `${row.recordId} span ${span.page_key}:${span.line_start}-${span.line_end} lacks required text: ${required}`,
          );
      const anchor = {
        anchorId: `${row.recordId}:span:${String(index + 1).padStart(2, '0')}`,
        pageKey: page.page_key,
        physicalPage: page.physical_page,
        pageTextPath: page.path,
        pageTextSha256: page.sha256,
        lineStart: span.line_start,
        lineEnd: span.line_end,
        sourceSpan,
        sourceSpanSha256: sha256(sourceSpan),
        ...(page.rendered_path
          ? {
              renderedPath: page.rendered_path,
              renderedSha256: page.rendered_sha256,
            }
          : {}),
      };
      spans.push({
        schemaVersion: 1,
        sourceId: row.sourceId,
        observationRecordId: row.recordId,
        ...anchor,
      });
      return anchor;
    });
    const { evidenceSpans: _discarded, ...rest } = row;
    return { schemaVersion: 1, ...rest, evidenceAnchors };
  });
  return { rows: enriched, spans };
}

export function buildScholarlyLanguageEvidence({
  contractValue,
  pageTexts,
  sourceLedgerRows,
  dictionaryManifestValue,
  dictionaryEntries,
  dictionarySenses,
  dictionaryForms,
}: BuildInput): ScholarlyLanguageEvidenceResult {
  const contract = ScholarlyLanguageEvidenceContractSchema.parse(contractValue);
  const dictionaryManifest = object(
    dictionaryManifestValue,
    'dictionary manifest',
  );
  if (dictionaryManifest.edition_id !== contract.dictionary_context.edition_id)
    throw new Error('dictionary context edition ID does not match manifest');
  const expectedComponents = [
    ['entry', contract.dictionary_context.entry_component_key, dictionaryEntries],
    ['sense', contract.dictionary_context.sense_component_key, dictionarySenses],
    ['form', contract.dictionary_context.form_component_key, dictionaryForms],
  ] as const;
  for (const [label, key, rows] of expectedComponents) {
    const reference = componentReference(dictionaryManifest, key);
    if (reference.rows !== rows.length)
      throw new Error(`${label} component row count does not match manifest`);
  }

  const sourceRows = sourceLedgerRows.filter(
    (row) => row.source_id === contract.source.source_id,
  );
  if (sourceRows.length !== 1)
    throw new Error('scholarly source is absent or duplicated in source ledger');
  const sourceRow = sourceRows[0];
  if (sourceRow.sha256 !== scholarlyPrimarySourceReference(contract.source).sha256)
    throw new Error('source-ledger hash does not match scholarly primary artifact');
  for (const key of [
    'training_use',
    'redistribution',
    'derived_weights',
    'hosted_transfer',
  ] as const)
    if (sourceRow[key] !== contract.source[key])
      throw new Error(`source-ledger ${key} does not match contract`);

  const pages = new Map<
    string,
    z.infer<typeof PageReferenceSchema> & { text: string }
  >();
  for (const page of contract.source.pages) {
    if (pages.has(page.page_key))
      throw new Error(`duplicate page key: ${page.page_key}`);
    const text = pageTexts.get(page.page_key);
    if (text === undefined) throw new Error(`missing page text: ${page.page_key}`);
    pages.set(page.page_key, { ...page, text });
  }

  const allObservations = [
    ...contract.observations.grammar_assertions,
    ...contract.observations.grammar_examples,
    ...contract.observations.grammar_conflicts,
    ...contract.observations.dictionary_evidence_links,
  ];
  assertUnique(
    allObservations.map((row) => row.recordId),
    'observation record ID',
  );
  for (const row of allObservations)
    if (row.sourceId !== contract.source.source_id)
      throw new Error(`observation source mismatch: ${row.recordId}`);

  const entryIds = new Set(
    dictionaryEntries.map((row) => z.string().parse(row.entryCandidateId)),
  );
  const senseIds = new Set(
    dictionarySenses.map((row) => z.string().parse(row.senseCandidateId)),
  );
  const formIds = new Set(
    dictionaryForms.map((row) => z.string().parse(row.formCandidateId)),
  );
  for (const link of contract.observations.dictionary_evidence_links) {
    for (const id of link.targetEntryCandidateIds)
      if (!entryIds.has(id)) throw new Error(`unknown target entry: ${id}`);
    for (const id of link.targetSenseCandidateIds)
      if (!senseIds.has(id)) throw new Error(`unknown target sense: ${id}`);
    for (const id of link.targetFormCandidateIds)
      if (!formIds.has(id)) throw new Error(`unknown target form: ${id}`);
  }

  const assertionResult = enrichObservations(
    contract.observations.grammar_assertions,
    pages,
  );
  const exampleResult = enrichObservations(
    contract.observations.grammar_examples,
    pages,
  );
  const conflictResult = enrichObservations(
    contract.observations.grammar_conflicts,
    pages,
  );
  const dictionaryResult = enrichObservations(
    contract.observations.dictionary_evidence_links,
    pages,
  );
  const citationChain = contract.observations.citation_chain.map((row) => ({
    schemaVersion: 1,
    ...row,
  }));
  assertUnique(
    citationChain.map((row) => row.recordId),
    'citation-chain record ID',
  );
  for (const row of citationChain)
    if (row.sourceId !== contract.source.source_id)
      throw new Error(`citation-chain source mismatch: ${row.recordId}`);

  const components = {
    grammarAssertions: assertionResult.rows,
    grammarExamples: exampleResult.rows,
    grammarConflicts: conflictResult.rows,
    dictionaryEvidenceLinks: dictionaryResult.rows,
    citationChain,
  };
  const actualCounts = {
    grammar_assertions: components.grammarAssertions.length,
    grammar_examples: components.grammarExamples.length,
    grammar_conflicts: components.grammarConflicts.length,
    dictionary_evidence_links: components.dictionaryEvidenceLinks.length,
    citation_chain: components.citationChain.length,
  };
  for (const [key, expected] of Object.entries(contract.expected_counts))
    if (actualCounts[key as keyof typeof actualCounts] !== expected)
      throw new Error(`expected count mismatch for ${key}`);

  const evidenceSpans = [
    ...assertionResult.spans,
    ...exampleResult.spans,
    ...conflictResult.spans,
    ...dictionaryResult.spans,
  ];
  assertUnique(
    evidenceSpans.map((row) => z.string().parse(row.anchorId)),
    'evidence anchor ID',
  );
  return {
    components,
    evidenceSpans,
    validation: {
      grammarAssertions: components.grammarAssertions.length,
      grammarExamples: components.grammarExamples.length,
      grammarConflicts: components.grammarConflicts.length,
      dictionaryEvidenceLinks: components.dictionaryEvidenceLinks.length,
      citationChain: components.citationChain.length,
      evidenceSpans: evidenceSpans.length,
      acceptedRows: 0,
      trainingEligibleRows: 0,
    },
  };
}
