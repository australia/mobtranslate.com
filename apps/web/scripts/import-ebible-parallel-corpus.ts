import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import postgres from 'postgres';

type VerseSegment = {
  bookCode: string;
  chapter: number;
  verseLabel: string;
  verseStart: number;
  verseEnd: number;
  verseStartSuffix: string | null;
  verseEndSuffix: string | null;
  canonicalRef: string;
  sequenceKey: string;
  segmentIndex?: number;
  segmentKind: 'verse' | 'verse_range' | 'sentence';
  text: string;
  textNormalized: string;
  sourceFormat: string;
  sourceFile: string;
  sourceHash: string;
  metadata: Record<string, unknown>;
};

type Db = ReturnType<typeof postgres>;

type EditionSpec = {
  ebibleId: string;
  dbLanguageCode?: string;
  title: string;
  shortTitle: string;
  languageCode: string;
  languageName: string;
  iso6393?: string;
  sourceUrl: string;
  detailsUrl: string;
  copyrightNotice: string;
  licenseName: string;
  licenseUrl: string;
  rightsStatement: string;
  rightsStatus: string;
  canonicalNote: string;
};

type SegmentRow = {
  id: string;
  canonical_ref: string;
  segment_kind: string;
  text: string;
  verse_start: number | null;
  verse_end: number | null;
  verse_start_suffix: string | null;
  verse_end_suffix: string | null;
};

type VersificationException = {
  sourceRef: string;
  targetRef: string;
  sourceKind?: 'verse' | 'verse_range';
  targetKind?: 'verse' | 'verse_range';
  pairKind?: string;
  confidence?: number;
  note: string;
};

const DEFAULT_ROOT =
  '/mnt/donto-data/donto-resources/research/translation-corpora/ebible/gvn-2026-06-30';

function argValue(name: string, fallback?: string): string | undefined {
  const flag = `--${name}`;
  const i = process.argv.indexOf(flag);
  if (i >= 0) return process.argv[i + 1];
  const inline = process.argv.find((v) => v.startsWith(`${flag}=`));
  if (inline) return inline.slice(flag.length + 1);
  return fallback;
}

function boolArg(name: string, fallback: boolean): boolean {
  const raw = argValue(name);
  if (raw == null) return fallback;
  return !['0', 'false', 'no', 'off'].includes(raw.toLowerCase());
}

function loadEnv() {
  dotenv.config({ path: path.resolve(process.cwd(), '.env') });
  dotenv.config({ path: '/opt/mobtranslate/db.env', override: false });
}

function snapshotFromRoot(root: string): string {
  const match = root.match(/(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? new Date().toISOString().slice(0, 10);
}

function sha256File(file: string): string {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(file));
  return hash.digest('hex');
}

function decodeXml(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function stripHtml(html: string): string {
  return decodeXml(html.replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim());
}

function cleanText(text: string): string {
  return decodeXml(text).replace(/\s+/g, ' ').trim();
}

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([A-Za-z_:-]+)="([^"]*)"/g;
  for (const match of raw.matchAll(re)) {
    attrs[match[1]] = decodeXml(match[2]);
  }
  return attrs;
}

function parseVerseSide(side: string): { number: number; suffix: string | null } {
  const match = side.trim().match(/^(\d+)([A-Za-z]*)$/);
  if (!match) throw new Error(`Unsupported verse side: ${side}`);
  return { number: Number(match[1]), suffix: match[2] || null };
}

function parseVerseLabel(label: string) {
  const parts = label.split('-', 2);
  const start = parseVerseSide(parts[0]);
  const end = parts[1] ? parseVerseSide(parts[1]) : start;
  return {
    verseStart: start.number,
    verseEnd: end.number,
    verseStartSuffix: start.suffix,
    verseEndSuffix: end.suffix,
  };
}

function parseVplXml(file: string): VerseSegment[] {
  const xml = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  const sourceHash = sha256File(file);
  const segments: VerseSegment[] = [];
  const re = /<v\b([^>]*)>([\s\S]*?)<\/v>/g;
  let ordinal = 0;

  for (const match of xml.matchAll(re)) {
    ordinal += 1;
    const attrs = parseAttrs(match[1]);
    const bookCode = attrs.b;
    const chapter = Number(attrs.c);
    const verseLabel = attrs.v;
    const parsed = parseVerseLabel(verseLabel);
    const text = cleanText(match[2]);
    if (!bookCode || !chapter || !verseLabel || !text) continue;
    const isRange =
      parsed.verseStart !== parsed.verseEnd ||
      Boolean(parsed.verseStartSuffix) ||
      Boolean(parsed.verseEndSuffix);
    const canonicalRef = `${bookCode}.${chapter}.${verseLabel}`;
    segments.push({
      bookCode,
      chapter,
      verseLabel,
      ...parsed,
      canonicalRef,
      sequenceKey: String(ordinal).padStart(8, '0'),
      segmentKind: isRange ? 'verse_range' : 'verse',
      text,
      textNormalized: normalizeText(text),
      sourceFormat: 'ebible_vpl_xml',
      sourceFile: file,
      sourceHash,
      metadata: { ebibleVplAttributes: attrs },
    });
  }

  return segments;
}

function detailsText(root: string, ebibleId: string): string {
  const file = path.join(root, 'raw', `${ebibleId}_details.html`);
  return fs.existsSync(file) ? stripHtml(fs.readFileSync(file, 'utf8')) : '';
}

function editionSpec(root: string, ebibleId: string, dbLanguageCode?: string): EditionSpec {
  const text = detailsText(root, ebibleId);
  if (ebibleId === 'gvn') {
    return {
      ebibleId,
      dbLanguageCode,
      title: 'Godumu Kuku',
      shortTitle: 'Kuku-Yalanji Bible',
      languageCode: 'gvn',
      languageName: 'Kuku Yalanji',
      iso6393: 'gvn',
      sourceUrl: 'https://ebible.org/Scriptures/gvn_vpl.zip',
      detailsUrl: 'https://ebible.org/details.php?id=gvn',
      copyrightNotice: 'Copyright © 1984 Wycliffe Bible Translators, Inc.',
      licenseName: 'Creative Commons Attribution-Noncommercial-No Derivatives 4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by-nc-nd/4.0/',
      rightsStatement:
        'Downloaded from eBible.org. Details page describes this as Portions of the Holy Bible in the Kuku-Yalanji language of Australia and lists CC BY-NC-ND 4.0 terms. Out-of-band rights grant attested by project owner on 2026-06-30: approved for MobTranslate Kuku Yalanji model training use from this eBible snapshot.',
      rightsStatus: 'rights_granted',
      canonicalNote: 'eBible Kuku-Yalanji portions; VPL XML canon text used for alignment.',
    };
  }

  if (ebibleId === 'engwebp') {
    return {
      ebibleId,
      dbLanguageCode,
      title: 'World English Bible',
      shortTitle: 'WEB',
      languageCode: 'eng',
      languageName: 'English',
      iso6393: 'eng',
      sourceUrl: 'https://ebible.org/Scriptures/engwebp_vpl.zip',
      detailsUrl: 'https://ebible.org/details.php?id=engwebp',
      copyrightNotice: 'World English Bible is in the Public Domain.',
      licenseName: 'Public Domain',
      licenseUrl: 'https://ebible.org/web/',
      rightsStatement:
        'Downloaded from eBible.org. The included about/details text states the World English Bible is public domain, with World English Bible as a trademark of eBible.org.',
      rightsStatus: 'public_domain',
      canonicalNote: 'eBible World English Bible VPL XML used as English reference text.',
    };
  }

  if (ebibleId === 'engwebster') {
    return {
      ebibleId,
      dbLanguageCode,
      title: 'Noah Webster Bible',
      shortTitle: 'Webster Bible',
      languageCode: 'eng',
      languageName: 'English',
      iso6393: 'eng',
      sourceUrl: 'https://ebible.org/Scriptures/engwebster_vpl.zip',
      detailsUrl: 'https://ebible.org/details.php?id=engwebster',
      copyrightNotice: 'Public Domain',
      licenseName: 'Public Domain',
      licenseUrl: 'https://ebible.org/details.php?id=engwebster',
      rightsStatement:
        'Downloaded from eBible.org. The details page identifies Noah Webster Bible / Webster Bible as public domain.',
      rightsStatus: 'public_domain',
      canonicalNote:
        'eBible Noah Webster Bible VPL XML used as supplemental traditional-verse English reference text.',
    };
  }

  return {
    ebibleId,
    dbLanguageCode,
    title: ebibleId,
    shortTitle: ebibleId,
    languageCode: ebibleId,
    languageName: ebibleId,
    sourceUrl: `https://ebible.org/Scriptures/${ebibleId}_vpl.zip`,
    detailsUrl: `https://ebible.org/details.php?id=${ebibleId}`,
    copyrightNotice: '',
    licenseName: '',
    licenseUrl: '',
    rightsStatement: text || 'Rights metadata not extracted. Review source details before training use.',
    rightsStatus: 'rights_review_needed',
    canonicalNote: 'eBible VPL XML used for alignment.',
  };
}

async function languageId(sql: Db, code?: string): Promise<string | null> {
  if (!code) return null;
  const rows = await sql<{ id: string }[]>`
    select id from public.languages where code = ${code} limit 1
  `;
  return rows[0]?.id ?? null;
}

async function upsertEdition(
  sql: Db,
  spec: EditionSpec,
  sourceCode: string,
  snapshot: string,
): Promise<{ id: string; languageId: string | null }> {
  const langId = await languageId(sql, spec.dbLanguageCode);
  const rows = await sql<{ id: string; language_id: string | null }[]>`
    insert into public.parallel_corpus_editions (
      language_id, source_family, source_code, title, short_title,
      language_code, language_name, iso_639_3, source_url, details_url,
      copyright_notice, license_name, license_url, rights_statement,
      rights_status, canonical_note, metadata
    )
    values (
      ${langId}, 'ebible', ${sourceCode}, ${spec.title}, ${spec.shortTitle},
      ${spec.languageCode}, ${spec.languageName}, ${spec.iso6393 ?? null},
      ${spec.sourceUrl}, ${spec.detailsUrl}, ${spec.copyrightNotice},
      ${spec.licenseName}, ${spec.licenseUrl}, ${spec.rightsStatement},
      ${spec.rightsStatus}, ${spec.canonicalNote},
      ${sql.json({ ebibleId: spec.ebibleId, snapshot })}
    )
    on conflict (source_family, source_code) do update set
      language_id = excluded.language_id,
      title = excluded.title,
      short_title = excluded.short_title,
      language_code = excluded.language_code,
      language_name = excluded.language_name,
      iso_639_3 = excluded.iso_639_3,
      source_url = excluded.source_url,
      details_url = excluded.details_url,
      copyright_notice = excluded.copyright_notice,
      license_name = excluded.license_name,
      license_url = excluded.license_url,
      rights_statement = excluded.rights_statement,
      rights_status = excluded.rights_status,
      canonical_note = excluded.canonical_note,
      metadata = excluded.metadata,
      updated_at = now()
    returning id, language_id
  `;
  return { id: rows[0].id, languageId: rows[0].language_id };
}

async function upsertArtifacts(
  sql: Db,
  root: string,
  editionId: string,
  ebibleId: string,
) {
  const raw = path.join(root, 'raw');
  const files = fs.existsSync(raw)
    ? fs.readdirSync(raw).filter((name) => name.startsWith(`${ebibleId}_`))
    : [];

  for (const name of files) {
    if (name.endsWith('.headers')) continue;
    const file = path.join(raw, name);
    const headers = `${file}.headers`;
    const stat = fs.statSync(file);
    const ext = path.extname(name).replace('.', '') || 'html';
    const type = name.replace(`${ebibleId}_`, '').replace(/\.[^.]+$/, '');
    await sql`
      insert into public.parallel_corpus_artifacts (
        edition_id, artifact_type, format, source_url, local_path, sha256,
        byte_size, http_headers, metadata
      )
      values (
        ${editionId}, ${type}, ${ext}, ${null}, ${file}, ${sha256File(file)},
        ${stat.size}, ${sql.json({ raw: fs.existsSync(headers) ? fs.readFileSync(headers, 'utf8') : '' })},
        ${sql.json({ importedBy: 'import-ebible-parallel-corpus.ts' })}
      )
      on conflict (edition_id, artifact_type, local_path) do update set
        sha256 = excluded.sha256,
        byte_size = excluded.byte_size,
        http_headers = excluded.http_headers,
        metadata = excluded.metadata
    `;
  }
}

async function upsertSegments(
  sql: Db,
  editionId: string,
  segments: VerseSegment[],
) {
  const batchSize = 500;
  for (let i = 0; i < segments.length; i += batchSize) {
    const batch = segments.slice(i, i + batchSize).map((s) => ({
      edition_id: editionId,
      segment_kind: s.segmentKind,
      canonical_ref: s.canonicalRef,
      sequence_key: s.sequenceKey,
      book_code: s.bookCode,
      book_name: null,
      chapter: s.chapter,
      verse_label: s.verseLabel,
      verse_start: s.verseStart,
      verse_end: s.verseEnd,
      verse_start_suffix: s.verseStartSuffix,
      verse_end_suffix: s.verseEndSuffix,
      segment_index: s.segmentIndex ?? 0,
      text: s.text,
      text_normalized: s.textNormalized,
      source_format: s.sourceFormat,
      source_file: s.sourceFile,
      source_hash: s.sourceHash,
      metadata: sql.json(s.metadata),
    }));

    await sql`
      insert into public.parallel_corpus_segments ${sql(batch)}
      on conflict (edition_id, segment_kind, canonical_ref, segment_index) do update set
        sequence_key = excluded.sequence_key,
        text = excluded.text,
        text_normalized = excluded.text_normalized,
        source_format = excluded.source_format,
        source_file = excluded.source_file,
        source_hash = excluded.source_hash,
        metadata = excluded.metadata
    `;
  }
}

async function segmentRows(sql: Db, editionId: string): Promise<SegmentRow[]> {
  return sql<SegmentRow[]>`
    select id, canonical_ref, segment_kind, text, verse_start, verse_end,
           verse_start_suffix, verse_end_suffix
    from public.parallel_corpus_segments
    where edition_id = ${editionId}
  `;
}

function byRef(rows: SegmentRow[]): Map<string, SegmentRow> {
  const map = new Map<string, SegmentRow>();
  for (const row of rows) map.set(`${row.segment_kind}|${row.canonical_ref}`, row);
  return map;
}

function sentenceSplit(text: string): string[] {
  const Segmenter = (Intl as unknown as {
    Segmenter?: new (locale: string, opts: { granularity: 'sentence' }) => {
      segment(value: string): Iterable<{ segment: string }>;
    };
  }).Segmenter;
  if (Segmenter) {
    const seg = new Segmenter('und', { granularity: 'sentence' });
    return [...seg.segment(text)].map((s) => cleanText(s.segment)).filter(Boolean);
  }
  return text
    .split(/(?<=[.!?。！？])\s+/u)
    .map(cleanText)
    .filter(Boolean);
}

function readVersificationExceptions(
  root: string,
  sourceId: string,
  targetId: string,
  snapshot: string,
): VersificationException[] {
  const file = path.join(root, 'work', `versification-exceptions-${sourceId}-${targetId}-${snapshot}.json`);
  if (!fs.existsSync(file)) return [];
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as VersificationException[];
  if (!Array.isArray(parsed)) throw new Error(`Expected exception array in ${file}`);
  return parsed;
}

async function createEnglishComposite(
  sql: Db,
  targetEditionId: string,
  targetSegments: VerseSegment[],
  source: VerseSegment,
): Promise<SegmentRow | null> {
  const parts = targetSegments.filter(
    (s) =>
      s.bookCode === source.bookCode &&
      s.chapter === source.chapter &&
      s.verseStart >= source.verseStart &&
      s.verseEnd <= source.verseEnd,
  );
  if (parts.length === 0) return null;

  const text = parts.map((p) => p.text).join(' ');
  const composite: VerseSegment = {
    ...source,
    text,
    textNormalized: normalizeText(text),
    sourceFormat: 'ebible_vpl_xml_composite_range',
    sourceFile: parts[0].sourceFile,
    sourceHash: crypto.createHash('sha256').update(parts.map((p) => p.sourceHash + p.canonicalRef).join('|')).digest('hex'),
    metadata: {
      compositeFrom: parts.map((p) => p.canonicalRef),
      note: 'Reference-range composite created from English single-verse VPL records.',
    },
  };

  await upsertSegments(sql, targetEditionId, [composite]);
  const rows = await sql<SegmentRow[]>`
    select id, canonical_ref, segment_kind, text, verse_start, verse_end,
           verse_start_suffix, verse_end_suffix
    from public.parallel_corpus_segments
    where edition_id = ${targetEditionId}
      and segment_kind = ${source.segmentKind}
      and canonical_ref = ${source.canonicalRef}
      and segment_index = 0
    limit 1
  `;
  return rows[0] ?? null;
}

async function insertPair(
  sql: Db,
  params: {
    source: SegmentRow;
    target: SegmentRow;
    sourceEditionId: string;
    targetEditionId: string;
    sourceLanguageId: string | null;
    targetLanguageId: string | null;
    pairKind: string;
    canonicalRef: string;
    confidence: number;
    status: string;
    rightsStatus: string;
    alignmentMethod?: string;
    metadata: Record<string, unknown>;
  },
): Promise<string> {
  const rows = await sql<{ id: string }[]>`
    insert into public.parallel_corpus_pairs (
      source_segment_id, target_segment_id, source_edition_id, target_edition_id,
      source_language_id, target_language_id, pair_kind, canonical_ref,
      source_text, target_text, alignment_method, alignment_confidence,
      alignment_status, rights_status, approved_for_training, train_split, metadata
    )
    values (
      ${params.source.id}, ${params.target.id}, ${params.sourceEditionId}, ${params.targetEditionId},
      ${params.sourceLanguageId}, ${params.targetLanguageId}, ${params.pairKind}, ${params.canonicalRef},
      ${params.source.text}, ${params.target.text}, ${params.alignmentMethod ?? 'ebible_vpl_reference_range'},
      ${params.confidence}, ${params.status}, ${params.rightsStatus}, ${params.rightsStatus === 'rights_granted'}, 'unassigned',
      ${sql.json(params.metadata)}
    )
    on conflict (source_segment_id, target_segment_id, pair_kind, alignment_method) do update set
      source_text = excluded.source_text,
      target_text = excluded.target_text,
      alignment_confidence = excluded.alignment_confidence,
      alignment_status = excluded.alignment_status,
      rights_status = excluded.rights_status,
      approved_for_training = excluded.approved_for_training,
      metadata = excluded.metadata
    returning id
  `;
  return rows[0].id;
}

async function writeExports(
  sql: Db,
  root: string,
  sourceEditionId: string,
  targetEditionId: string,
  exportPrefix: string,
) {
  const outDir = path.join(root, 'exports');
  fs.mkdirSync(outDir, { recursive: true });
  const rows = await sql<{
    id: string;
    pair_kind: string;
    canonical_ref: string;
    source_text: string;
    target_text: string;
    alignment_confidence: string;
    alignment_status: string;
    rights_status: string;
  }[]>`
    select id, pair_kind, canonical_ref, source_text, target_text,
           alignment_confidence::text, alignment_status, rights_status
    from public.parallel_corpus_pairs
    where source_edition_id = ${sourceEditionId}
      and target_edition_id = ${targetEditionId}
    order by pair_kind, canonical_ref
  `;

  const groups = new Map<string, typeof rows>();
  for (const row of rows) groups.set(row.pair_kind, [...(groups.get(row.pair_kind) ?? []), row]);

  for (const [kind, group] of groups) {
    const tsv = [
      ['id', 'canonical_ref', 'source_text', 'target_text', 'alignment_confidence', 'alignment_status', 'rights_status'].join('\t'),
      ...group.map((r) =>
        [r.id, r.canonical_ref, r.source_text, r.target_text, r.alignment_confidence, r.alignment_status, r.rights_status]
          .map((v) => String(v).replace(/\t/g, ' ').replace(/\n/g, ' '))
          .join('\t'),
      ),
    ].join('\n') + '\n';
    fs.writeFileSync(path.join(outDir, `${exportPrefix}-${kind}.tsv`), tsv);
    fs.writeFileSync(
      path.join(outDir, `${exportPrefix}-${kind}.jsonl`),
      group.map((r) => JSON.stringify(r)).join('\n') + '\n',
    );
  }

  const stats = Object.fromEntries([...groups.entries()].map(([kind, group]) => [kind, group.length]));
  fs.writeFileSync(
    path.join(outDir, `${exportPrefix}-import-summary.json`),
    JSON.stringify({ sourceEditionId, targetEditionId, stats, exportedAt: new Date().toISOString() }, null, 2) + '\n',
  );
  return stats;
}

async function main() {
  loadEnv();
  const root = argValue('root', DEFAULT_ROOT)!;
  const sourceId = argValue('source-id', 'gvn')!;
  const targetId = argValue('target-id', 'engwebp')!;
  const sourceDbLanguageCode = argValue('source-db-language-code', 'kuku_yalanji');
  const targetDbLanguageCode = argValue('target-db-language-code');
  const makeSentenceCandidates = boolArg('sentence-candidates', true);
  const snapshot = snapshotFromRoot(root);
  const sourceCode = `${sourceId}-${snapshot}`;
  const targetCode = `${targetId}-${snapshot}`;
  const runSlug = argValue('run-slug', `ebible-${sourceId}-${targetId}-${snapshot}`)!;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');
  const sql = postgres(connectionString, { max: 1 });

  const sourceSpec = editionSpec(root, sourceId, sourceDbLanguageCode);
  const targetSpec = editionSpec(root, targetId, targetDbLanguageCode);
  const sourceXml = path.join(root, 'extracted', `${sourceId}_vpl`, `${sourceId}_vpl.xml`);
  const targetXml = path.join(root, 'extracted', `${targetId}_vpl`, `${targetId}_vpl.xml`);
  const sourceSegments = parseVplXml(sourceXml);
  const targetSegments = parseVplXml(targetXml);

  const sourceEdition = await upsertEdition(sql, sourceSpec, sourceCode, snapshot);
  const targetEdition = await upsertEdition(sql, targetSpec, targetCode, snapshot);
  await upsertArtifacts(sql, root, sourceEdition.id, sourceId);
  await upsertArtifacts(sql, root, targetEdition.id, targetId);

  const runRows = await sql<{ id: string }[]>`
    insert into public.parallel_corpus_import_runs (
      source_family, run_slug, corpus_root, source_edition_id, target_edition_id, status, notes
    )
    values (
      'ebible', ${runSlug}, ${root}, ${sourceEdition.id}, ${targetEdition.id},
      'running', 'eBible VPL XML import and reference-range alignment'
    )
    on conflict (source_family, run_slug) do update set
      status = 'running',
      started_at = now(),
      finished_at = null,
      source_edition_id = excluded.source_edition_id,
      target_edition_id = excluded.target_edition_id
    returning id
  `;
  const runId = runRows[0].id;

  await upsertSegments(sql, sourceEdition.id, sourceSegments);
  await upsertSegments(sql, targetEdition.id, targetSegments);

  let targetByRef = byRef(await segmentRows(sql, targetEdition.id));
  const sourceByRef = byRef(await segmentRows(sql, sourceEdition.id));
  let versePairs = 0;
  let missingTargets = 0;
  let suffixBoundaryPairs = 0;

  for (const source of sourceSegments) {
    const sourceRow = sourceByRef.get(`${source.segmentKind}|${source.canonicalRef}`);
    if (!sourceRow) throw new Error(`Source segment not found after insert: ${source.canonicalRef}`);

    let targetRow = targetByRef.get(`${source.segmentKind}|${source.canonicalRef}`);
    if (!targetRow && source.segmentKind === 'verse') {
      targetRow = targetByRef.get(`verse|${source.canonicalRef}`);
    }
    if (!targetRow) {
      targetRow = await createEnglishComposite(sql, targetEdition.id, targetSegments, source);
      if (targetRow) targetByRef.set(`${source.segmentKind}|${source.canonicalRef}`, targetRow);
    }
    if (!targetRow) {
      missingTargets += 1;
      continue;
    }

    const hasSuffix = Boolean(source.verseStartSuffix || source.verseEndSuffix);
    if (hasSuffix) suffixBoundaryPairs += 1;
    await insertPair(sql, {
      source: sourceRow,
      target: targetRow,
      sourceEditionId: sourceEdition.id,
      targetEditionId: targetEdition.id,
      sourceLanguageId: sourceEdition.languageId,
      targetLanguageId: targetEdition.languageId,
      pairKind: source.segmentKind,
      canonicalRef: source.canonicalRef,
      confidence: hasSuffix ? 0.86 : 1,
      status: hasSuffix ? 'auto_aligned_range_with_partial_verse_boundary' : 'auto_aligned_reference_exact',
      rightsStatus: sourceSpec.rightsStatus,
      metadata: {
        importRunId: runId,
        ebibleSourceId: sourceId,
        ebibleTargetId: targetId,
        verseLabel: source.verseLabel,
        note: hasSuffix
          ? 'Kuku source starts or ends on a partial verse label; English target is the containing whole-verse range.'
          : 'Aligned by eBible canonical book/chapter/verse range.',
      },
    });
    versePairs += 1;

    if (makeSentenceCandidates) {
      const sourceSentences = sentenceSplit(sourceRow.text);
      const targetSentences = sentenceSplit(targetRow.text);
      if (sourceSentences.length > 0 && sourceSentences.length === targetSentences.length) {
        for (let i = 0; i < sourceSentences.length; i += 1) {
          const sref = `${source.canonicalRef}#s${i + 1}`;
          const sseg: VerseSegment = {
            ...source,
            canonicalRef: sref,
            segmentKind: 'sentence',
            segmentIndex: i,
            text: sourceSentences[i],
            textNormalized: normalizeText(sourceSentences[i]),
            metadata: {
              parentCanonicalRef: source.canonicalRef,
              sentenceIndex: i + 1,
              sentenceCount: sourceSentences.length,
              method: 'Intl.Segmenter equal-count sentence candidate',
            },
          };
          const tseg: VerseSegment = {
            ...sseg,
            text: targetSentences[i],
            textNormalized: normalizeText(targetSentences[i]),
          };
          await upsertSegments(sql, sourceEdition.id, [sseg]);
          await upsertSegments(sql, targetEdition.id, [tseg]);
          const [srow] = await sql<SegmentRow[]>`
            select id, canonical_ref, segment_kind, text, verse_start, verse_end, verse_start_suffix, verse_end_suffix
            from public.parallel_corpus_segments
            where edition_id = ${sourceEdition.id} and segment_kind = 'sentence'
              and canonical_ref = ${sref} and segment_index = ${i}
            limit 1
          `;
          const [trow] = await sql<SegmentRow[]>`
            select id, canonical_ref, segment_kind, text, verse_start, verse_end, verse_start_suffix, verse_end_suffix
            from public.parallel_corpus_segments
            where edition_id = ${targetEdition.id} and segment_kind = 'sentence'
              and canonical_ref = ${sref} and segment_index = ${i}
            limit 1
          `;
          await insertPair(sql, {
            source: srow,
            target: trow,
            sourceEditionId: sourceEdition.id,
            targetEditionId: targetEdition.id,
            sourceLanguageId: sourceEdition.languageId,
            targetLanguageId: targetEdition.languageId,
            pairKind: 'sentence_candidate',
            canonicalRef: sref,
            confidence: hasSuffix ? 0.76 : 0.88,
            status: 'auto_sentence_candidate_equal_count',
            rightsStatus: sourceSpec.rightsStatus,
            metadata: {
              importRunId: runId,
              parentCanonicalRef: source.canonicalRef,
              sentenceIndex: i + 1,
              sentenceCount: sourceSentences.length,
              note: 'Sentence candidate emitted only where source and target punctuation segmentation produced equal counts within the same verse/range pair.',
            },
          });
        }
      }
    }
  }

  let versificationExceptionPairs = 0;
  let missingVersificationExceptions = 0;
  const exceptions = readVersificationExceptions(root, sourceId, targetId, snapshot);
  for (const exception of exceptions) {
    const sourceKind = exception.sourceKind ?? 'verse';
    const targetKind = exception.targetKind ?? 'verse';
    const sourceRow = sourceByRef.get(`${sourceKind}|${exception.sourceRef}`);
    const targetRow = targetByRef.get(`${targetKind}|${exception.targetRef}`);
    if (!sourceRow || !targetRow) {
      missingVersificationExceptions += 1;
      continue;
    }

    await insertPair(sql, {
      source: sourceRow,
      target: targetRow,
      sourceEditionId: sourceEdition.id,
      targetEditionId: targetEdition.id,
      sourceLanguageId: sourceEdition.languageId,
      targetLanguageId: targetEdition.languageId,
      pairKind: exception.pairKind ?? sourceKind,
      canonicalRef: exception.sourceRef,
      confidence: exception.confidence ?? 0.72,
      status: 'needs_human_review_versification_exception',
      rightsStatus: sourceSpec.rightsStatus,
      alignmentMethod: 'ebible_vpl_versification_exception',
      metadata: {
        importRunId: runId,
        sourceRef: exception.sourceRef,
        targetRef: exception.targetRef,
        note: exception.note,
      },
    });
    versificationExceptionPairs += 1;
  }

  const exportStats = await writeExports(sql, root, sourceEdition.id, targetEdition.id, `${sourceId}-${targetId}`);
  const stats = {
    sourceSegments: sourceSegments.length,
    targetSegments: targetSegments.length,
    versePairs,
    missingTargets,
    suffixBoundaryPairs,
    versificationExceptionPairs,
    missingVersificationExceptions,
    exports: exportStats,
  };

  await sql`
    update public.parallel_corpus_import_runs
    set status = 'done', finished_at = now(), stats = ${sql.json(stats)}
    where id = ${runId}
  `;
  fs.appendFileSync(
    path.join(root, 'logs', 'steps.log'),
    `${new Date().toISOString()} Imported eBible parallel corpus ${JSON.stringify(stats)}\n`,
  );
  console.log(JSON.stringify({ runId, sourceEditionId: sourceEdition.id, targetEditionId: targetEdition.id, stats }, null, 2));
  await sql.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
