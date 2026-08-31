import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import process from 'node:process';

type Contract = {
  schema_version: 1;
  acquisition_id: string;
  normalization_version?: 1 | 2;
  supersedes_acquisition_id?: string;
  retrieved_at_utc: string;
  language: { name: string; iso_639_3: string };
  api: {
    origin: string;
    search_path: string;
    full_record_path: string;
    search_body: Record<string, unknown>;
    expected_total: number;
    concurrency: number;
  };
  release_contract: Record<string, unknown>;
  output_directory: string;
};

type SearchRecord = Record<string, unknown> & {
  id: string;
  handle?: string | null;
  title?: string | null;
};
type SearchResponse = {
  success: boolean;
  total: number;
  results: SearchRecord[];
};
type FullRecord = Record<string, unknown> & {
  id: string;
  handle?: string | null;
  title?: string | null;
  metadata?: string | null;
  all?: Array<Record<string, unknown>>;
};
type FullResponse = {
  success: boolean;
  total: number;
  results: FullRecord[];
};

function flagValue(flag: string): string {
  const index = process.argv.indexOf(flag);
  if (index < 0 || !process.argv[index + 1]) {
    throw new Error(`missing required ${flag} PATH`);
  }
  return process.argv[index + 1];
}

function resolveWithin(root: string, relativePath: string): string {
  if (path.isAbsolute(relativePath)) throw new Error('path must be relative');
  const resolved = path.resolve(root, relativePath);
  const relative = path.relative(root, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`path escapes program root: ${relativePath}`);
  }
  return resolved;
}

function sha256(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex');
}

function writeImmutable(filePath: string, content: string): void {
  if (existsSync(filePath)) {
    if (readFileSync(filePath, 'utf8') !== content) {
      throw new Error(`refusing to rewrite immutable artifact: ${filePath}`);
    }
    return;
  }
  mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  writeFileSync(temporaryPath, content, { encoding: 'utf8', flag: 'wx' });
  renameSync(temporaryPath, filePath);
}

function parseSerializedStringList(value: string): string[] | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) return null;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (
      Array.isArray(parsed) &&
      parsed.every((item) => typeof item === 'string')
    ) {
      return parsed;
    }
  } catch {
    // Territory Stories currently serializes some string arrays with Python quotes.
  }
  const values: string[] = [];
  let remainder = trimmed.slice(1, -1).trim();
  while (remainder) {
    const match = /^'((?:\\.|[^'\\])*)'\s*(?:,\s*|$)/u.exec(remainder);
    if (!match) return null;
    values.push(match[1].replace(/\\'/gu, "'").replace(/\\\\/gu, '\\'));
    remainder = remainder.slice(match[0].length);
  }
  return values;
}

function normalizedArray(
  value: unknown,
  parseSerializedLists = false,
): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.normalize('NFC').trim())
      .filter(Boolean);
  }
  if (typeof value === 'string' && value.trim()) {
    if (parseSerializedLists) {
      const parsed = parseSerializedStringList(value);
      if (parsed) return normalizedArray(parsed);
    }
    return [value.normalize('NFC').trim()];
  }
  return [];
}

function parsedMetadata(record: FullRecord): Record<string, unknown> {
  if (typeof record.metadata !== 'string' || !record.metadata.trim()) return {};
  const value = JSON.parse(record.metadata) as unknown;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`metadata is not an object: ${record.handle ?? record.id}`);
  }
  return value as Record<string, unknown>;
}

async function fetchJson<T>(url: URL, init?: RequestInit): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        headers: {
          Accept: 'application/json',
          ...(init?.headers ?? {}),
        },
        signal: AbortSignal.timeout(30_000),
      });
    } catch (error) {
      lastError = error;
      if (attempt === 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
      continue;
    }
    if (response.ok) return (await response.json()) as T;
    const error = new Error(`${response.status} ${url}`);
    const retryable =
      response.status === 408 ||
      response.status === 425 ||
      response.status === 429 ||
      response.status >= 500;
    if (!retryable || attempt === 3) throw error;
    lastError = error;
    await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function concurrentMap<T, R>(
  values: T[],
  concurrency: number,
  operation: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  const output = new Array<R>(values.length);
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, values.length) },
    async () => {
      while (true) {
        const index = nextIndex;
        nextIndex += 1;
        if (index >= values.length) return;
        output[index] = await operation(values[index], index);
      }
    },
  );
  await Promise.all(workers);
  return output;
}

async function main(): Promise<void> {
  const programRoot = path.resolve(flagValue('--program-root'));
  const contractPath = resolveWithin(programRoot, flagValue('--contract'));
  const contractBytes = readFileSync(contractPath);
  const contract = JSON.parse(contractBytes.toString('utf8')) as Contract;
  if (contract.schema_version !== 1)
    throw new Error('unsupported contract schema');
  if (contract.api.concurrency < 1 || contract.api.concurrency > 16) {
    throw new Error('concurrency must be between 1 and 16');
  }

  const searchUrl = new URL(contract.api.search_path, contract.api.origin);
  const searchResponse = await fetchJson<SearchResponse>(searchUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(contract.api.search_body),
  });
  if (!searchResponse.success) throw new Error('search API reported failure');
  if (searchResponse.total !== contract.api.expected_total) {
    throw new Error(
      `catalog total drifted: ${searchResponse.total}, expected ${contract.api.expected_total}`,
    );
  }
  if (searchResponse.results.length !== searchResponse.total) {
    throw new Error('search API did not return the complete result set');
  }

  const searchRecords = [...searchResponse.results].sort((left, right) =>
    (left.handle ?? left.id).localeCompare(right.handle ?? right.id),
  );
  const fullRecords = await concurrentMap(
    searchRecords,
    contract.api.concurrency,
    async (searchRecord) => {
      if (!searchRecord.handle) return searchRecord as FullRecord;
      const url = new URL(contract.api.full_record_path, contract.api.origin);
      url.searchParams.set(
        'handle',
        searchRecord.handle.replace(/^https:\/\/hdl\.handle\.net\//u, ''),
      );
      url.searchParams.set('content', 'true');
      const response = await fetchJson<FullResponse>(url);
      if (!response.success || response.total !== 1) {
        throw new Error(`full record lookup failed: ${searchRecord.handle}`);
      }
      const exact = response.results.find(
        (record) => record.handle === searchRecord.handle,
      );
      if (!exact)
        throw new Error(`full record handle mismatch: ${searchRecord.handle}`);
      return exact;
    },
  );

  const catalogRecords = fullRecords
    .map((record) => {
      const metadata = parsedMetadata(record);
      const files = (record.all ?? [])
        .map((file) => ({
          id: typeof file.id === 'string' ? file.id : null,
          order: typeof file.order === 'number' ? file.order : null,
          link: typeof file.link === 'string' ? file.link : null,
          thumbnail: typeof file.thumbnail === 'string' ? file.thumbnail : null,
        }))
        .sort(
          (left, right) =>
            (left.order ?? Number.MAX_SAFE_INTEGER) -
            (right.order ?? Number.MAX_SAFE_INTEGER),
        );
      const normalizeSerializedRights =
        (contract.normalization_version ?? 1) >= 2;
      const rightsCodes = normalizedArray(
        record.dc_rights_code,
        normalizeSerializedRights,
      );
      const rightsLabels = normalizedArray(
        record.dc_rights,
        normalizeSerializedRights,
      );
      const licenseUrls = normalizedArray(
        record.dc_rights_license,
        normalizeSerializedRights,
      );
      return {
        schema_version: 1,
        catalog_record_id: record.id,
        handle: typeof record.handle === 'string' ? record.handle : null,
        external_url:
          typeof record.external_link === 'string'
            ? record.external_link
            : null,
        title: typeof record.title === 'string' ? record.title : null,
        identifier:
          typeof record.identifier === 'string' ? record.identifier : null,
        ntdl_type:
          typeof record.ntdl_type === 'string' ? record.ntdl_type : null,
        date_start:
          typeof record.start_date === 'string' ? record.start_date : null,
        date_end: typeof record.end_date === 'string' ? record.end_date : null,
        location_name:
          typeof record.location_name === 'string'
            ? record.location_name
            : null,
        language: typeof record.language === 'string' ? record.language : null,
        collection_list: normalizedArray(record.collection_list),
        contributors: normalizedArray(record.contributors),
        subjects: normalizedArray(record.subjects),
        metadata,
        rights: {
          codes: rightsCodes,
          labels: rightsLabels,
          license_urls: licenseUrls,
          provenance_and_withdrawal_notice: normalizedArray(
            metadata.Provenance,
          ),
          state:
            rightsCodes.length > 0
              ? 'catalog_license_recorded_cultural_and_model_use_review_required'
              : 'rights_review_required_no_machine_readable_code',
        },
        files: {
          has_pdf: record.haspdfdocument === true,
          pdf_path: typeof record.pdfpath === 'string' ? record.pdfpath : null,
          pdf_size: typeof record.pdfsize === 'string' ? record.pdfsize : null,
          has_audio: record.hasaudio === true,
          has_video: record.hasvideo === true,
          components: files,
        },
        acquisition_state: 'metadata_frozen_content_not_bulk_downloaded',
        training_exposed: false,
        training_eligible: false,
      };
    })
    .sort((left, right) =>
      (left.handle ?? left.catalog_record_id).localeCompare(
        right.handle ?? right.catalog_record_id,
      ),
    );

  const countValues = (values: Array<string | null>) =>
    [...new Set(values)]
      .map((value) => ({
        value,
        count: values.filter((candidate) => candidate === value).length,
      }))
      .sort(
        (left, right) =>
          right.count - left.count ||
          String(left.value).localeCompare(String(right.value)),
      );
  const rightsCodeValues = catalogRecords.map(
    (record) => record.rights.codes.join('|') || null,
  );
  const summary = {
    schema_version: 1,
    acquisition_id: contract.acquisition_id,
    retrieved_at_utc: contract.retrieved_at_utc,
    language: contract.language,
    contract: {
      path: path.relative(programRoot, contractPath),
      sha256: sha256(contractBytes),
      ...(contract.normalization_version
        ? {
            normalization_version: contract.normalization_version,
            supersedes_acquisition_id:
              contract.supersedes_acquisition_id ?? null,
          }
        : {}),
    },
    api: {
      origin: contract.api.origin,
      search_path: contract.api.search_path,
      full_record_path: contract.api.full_record_path,
      search_body: contract.api.search_body,
    },
    counts: {
      catalog_records: catalogRecords.length,
      pdf_records: catalogRecords.filter((record) => record.files.has_pdf)
        .length,
      audio_records: catalogRecords.filter((record) => record.files.has_audio)
        .length,
      video_records: catalogRecords.filter((record) => record.files.has_video)
        .length,
      component_files: catalogRecords.reduce(
        (sum, record) => sum + record.files.components.length,
        0,
      ),
      machine_readable_rights_code_records: catalogRecords.filter(
        (record) => record.rights.codes.length > 0,
      ).length,
      training_eligible_records: 0,
      training_exposed_records: 0,
    },
    record_types: countValues(catalogRecords.map((record) => record.ntdl_type)),
    locations: countValues(
      catalogRecords.map((record) => record.location_name),
    ),
    rights_codes: countValues(rightsCodeValues),
    release_contract: contract.release_contract,
    interpretation: {
      significance:
        'This is a large, independently catalogued Anindilyakwa text frontier that may support a future disjoint natural training corpus.',
      limitation:
        'Catalog availability and a Creative Commons label do not by themselves settle culturally appropriate model use, contributor authority, withdrawal handling, commercial scope, or row-level training eligibility.',
    },
  };

  const outputs = new Map<string, string>([
    [
      'catalog-records.jsonl',
      `${catalogRecords.map((row) => JSON.stringify(row)).join('\n')}\n`,
    ],
    ['summary.json', `${JSON.stringify(summary, null, 2)}\n`],
  ]);
  if (!process.argv.includes('--write')) {
    console.log(JSON.stringify(summary, null, 2));
    process.exit(0);
  }
  const outputRoot = resolveWithin(programRoot, contract.output_directory);
  for (const [name, content] of outputs) {
    writeImmutable(path.join(outputRoot, name), content);
  }
  const sums = [...outputs.entries()]
    .map(([name, content]) => `${sha256(content)}  ${name}`)
    .join('\n');
  writeImmutable(path.join(outputRoot, 'SHA256SUMS'), `${sums}\n`);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
