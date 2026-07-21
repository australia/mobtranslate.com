// @vitest-environment node

import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  assertArtifactUpdateAllowed,
  loadProgramBundle,
} from '../../scripts/lib/language-program-registry';

const temporaryRoots: string[] = [];

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function fixtureRoot(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'language-program-registry-'));
  temporaryRoots.push(root);
  mkdirSync(path.join(root, 'sources'), { recursive: true });
  const artifact = '{"row":1}\n';
  writeFileSync(path.join(root, 'data.jsonl'), artifact);
  writeFileSync(
    path.join(root, 'LANGUAGE-CHARTER.yaml'),
    `
schema_version: 1
program_id: fixture-v1
program_version: 1
language:
  primary_name: Fixture
  mobtranslate_code: fixture
  endonyms: []
  aliases: []
  iso_639_3: fix
  glottocode: fixt1234
  family: null
scope:
  included_varieties:
    - id: primary
      role: primary_written_target
orthographies:
  - id: primary-v1
    status: primary
directions:
  translation:
    - id: eng-to-fix
      status: primary
model_claim_target: research_only
model_contract:
  source_language_token: eng_Latn
  target_language_token: fix_Latn
`,
  );
  const stages = Object.fromEntries(
    [
      'identity',
      'source_archive',
      'dictionary',
      'grammar',
      'natural_corpus',
      'benchmarks',
      'gap_analysis',
      'synthetic_corpus',
      'translation_model',
      'asr',
      'tts',
      'release',
    ].map((key) => [key, key === 'identity' ? 'in_progress' : 'not_started']),
  );
  writeFileSync(
    path.join(root, 'PROGRAM-STATE.json'),
    JSON.stringify({
      schema_version: 1,
      program_id: 'fixture-v1',
      language_slug: 'fixture-v1',
      updated_at_utc: '2026-07-20T00:00:00Z',
      stages,
      stage_evidence: {},
      current_stage: 'identity',
      next_action: 'Verify fixture',
      blocking_conditions: [],
      paid_gpu_authorized: false,
      public_release_authorized: false,
    }),
  );
  writeFileSync(
    path.join(root, 'sources/SOURCE-LEDGER.jsonl'),
    `${JSON.stringify({
      source_id: 'source-1',
      title: 'Source',
      source_type: 'dictionary',
      url: null,
      catalog_id: null,
      local_path: null,
      sha256: null,
      license: 'unknown',
      training_use: 'unknown',
      redistribution: 'unknown',
      derived_weights: 'unknown',
      hosted_transfer: 'unknown',
      varieties: [],
      orthographies: [],
      contains_translation: true,
      contains_igt: false,
      contains_audio: false,
      quality_notes: [],
      acquisition_notes: [],
      retrieved_at_utc: null,
    })}\n`,
  );
  writeFileSync(
    path.join(root, 'ARTIFACT-LEDGER.jsonl'),
    `${JSON.stringify({
      artifact_key: 'data',
      stage_key: 'dictionary',
      source_key: 'source-1',
      artifact_kind: 'fixture',
      path: 'data.jsonl',
      media_type: 'application/x-ndjson',
      sha256: sha256(artifact),
      row_count: 1,
      status: 'verified',
      immutable: true,
      generated_by: 'test',
      metadata: {},
    })}\n`,
  );
  writeFileSync(
    path.join(root, 'CHECKLIST-STATE.json'),
    JSON.stringify({
      schema_version: 1,
      program_id: 'fixture-v1',
      updated_at_utc: '2026-07-20T00:00:00Z',
      items: [
        {
          item_key: 'dictionary.entries',
          status: 'pass',
          evidence_note: 'fixture',
          evidence_artifact_keys: ['data'],
        },
      ],
    }),
  );
  return root;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

describe('language program registry loader', () => {
  it('validates identities, evidence links, hashes, and JSONL row counts', () => {
    const bundle = loadProgramBundle(fixtureRoot());
    expect(bundle.charter.program_id).toBe('fixture-v1');
    expect(bundle.artifacts).toHaveLength(1);
    expect(bundle.artifacts[0].row_count).toBe(1);
    expect(bundle.artifacts[0].byteCount).toBeGreaterThan(0);
  });

  it('fails closed when an artifact changes after freezing', () => {
    const root = fixtureRoot();
    writeFileSync(path.join(root, 'data.jsonl'), '{"changed":true}\n');
    expect(() => loadProgramBundle(root)).toThrow(/artifact hash mismatch/);
  });
});

describe('language program artifact identity policy', () => {
  const fixedLocation = { relativePath: 'RUN-LOG.md', externalUri: null };

  it('permits content revisions for an explicitly mutable control artifact', () => {
    expect(() =>
      assertArtifactUpdateAllowed(
        'run-log',
        { ...fixedLocation, sha256: 'a'.repeat(64), immutable: false },
        { ...fixedLocation, sha256: 'b'.repeat(64), immutable: false },
      ),
    ).not.toThrow();
  });

  it('rejects content revisions for immutable evidence', () => {
    expect(() =>
      assertArtifactUpdateAllowed(
        'frozen-benchmark',
        { ...fixedLocation, sha256: 'a'.repeat(64), immutable: true },
        { ...fixedLocation, sha256: 'b'.repeat(64), immutable: true },
      ),
    ).toThrow(/immutable artifact identity changed/);
  });

  it('rejects silent location or mutability changes', () => {
    expect(() =>
      assertArtifactUpdateAllowed(
        'run-log',
        { ...fixedLocation, sha256: 'a'.repeat(64), immutable: false },
        {
          relativePath: 'moved.md',
          externalUri: null,
          sha256: 'a'.repeat(64),
          immutable: false,
        },
      ),
    ).toThrow(/artifact location changed/);
    expect(() =>
      assertArtifactUpdateAllowed(
        'run-log',
        { ...fixedLocation, sha256: 'a'.repeat(64), immutable: false },
        { ...fixedLocation, sha256: 'a'.repeat(64), immutable: true },
      ),
    ).toThrow(/artifact mutability changed/);
  });
});
