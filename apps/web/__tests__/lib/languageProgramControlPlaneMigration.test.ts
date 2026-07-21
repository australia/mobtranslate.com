// @vitest-environment node

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  path.join(process.cwd(), 'db/migrations/20260720000000_language_program_control_plane.sql'),
  'utf8',
);
const playbook = readFileSync(
  '/mnt/donto-data/donto-resources/research/translation-training/LANGUAGE-KNOWLEDGE-AND-MODEL-PLAYBOOK.md',
);

describe('language program control-plane migration', () => {
  it('defines the normalized operational entities', () => {
    for (const table of [
      'language_program_playbooks',
      'language_program_stage_definitions',
      'language_program_checklist_definitions',
      'language_programs',
      'language_program_sources',
      'language_program_artifacts',
      'language_program_stage_runs',
      'language_program_checklist_runs',
      'language_program_corpus_requirements',
      'language_program_experiments',
      'language_program_models',
      'language_program_benchmark_suites',
      'language_program_benchmark_runs',
      'language_program_release_decisions',
      'language_program_events',
    ]) {
      expect(migration).toContain(`CREATE TABLE IF NOT EXISTS public.${table}`);
    }
  });

  it('installs all stages and a comprehensive unique checklist', () => {
    const stages = [...migration.matchAll(/'low-resource-language-v1', '([a-z_]+)', \d+,/g)].map(
      (match) => match[1],
    );
    expect(stages).toEqual([
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
    ]);

    const itemKeys = [...migration.matchAll(/'low-resource-language-v1','([a-z_]+\.[a-z0-9_.]+)'/g)].map(
      (match) => match[1],
    );
    expect(itemKeys.length).toBeGreaterThanOrEqual(120);
    expect(new Set(itemKeys).size).toBe(itemKeys.length);
    for (const stage of stages) {
      expect(itemKeys.some((key) => key.startsWith(`${stage}.`))).toBe(true);
    }
  });

  it('binds the database template to the exact playbook', () => {
    const actual = createHash('sha256').update(playbook).digest('hex');
    expect(migration).toContain(`'${actual}'`);
  });

  it('fails closed for paid compute, public release, and stage completion', () => {
    expect(migration).toContain('paid_gpu_authorized BOOLEAN NOT NULL DEFAULT FALSE');
    expect(migration).toContain('public_release_authorized BOOLEAN NOT NULL DEFAULT FALSE');
    expect(migration).toContain('paid GPU authorization blocked');
    expect(migration).toContain('public release authorization blocked');
    expect(migration).toContain('stage % cannot pass');
    expect(migration).toContain("status <> 'pass' OR btrim(COALESCE(evidence_note, '')) <> ''");
  });

  it('preserves transition and release-decision history', () => {
    expect(migration).toContain('language program events are append-only');
    expect(migration).toContain('language program release decisions are append-only');
    expect(migration).toContain('BEFORE UPDATE OR DELETE ON public.language_program_events');
    expect(migration).toContain('BEFORE UPDATE OR DELETE ON public.language_program_release_decisions');
  });

  it('contains no destructive data operation', () => {
    expect(migration).not.toMatch(/\b(?:DROP TABLE|TRUNCATE|DELETE FROM)\b/i);
  });
});
