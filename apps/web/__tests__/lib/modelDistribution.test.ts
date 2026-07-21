// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { resolveModelApiOrigin } from '../../lib/models/apiResponse';
import {
  latestDownloadableRelease,
  isHostableModelArtifact,
  publicCatalog,
  publicInferenceEndpointLabel,
  publicRelease,
  resolvePublicRelease,
} from '../../lib/models/distribution';
import { findModel, loadModelRegistry } from '../../lib/models/registry';
import type { ModelEntry, ModelRegistry } from '../../lib/models/types';

function fixtureModel(): ModelEntry {
  return {
    id: 'test-model',
    name: 'Test model',
    family: 'NLLB + PEFT LoRA',
    task: 'translation',
    language: { name: 'Test', appCode: 'test', iso6393: 'tst', region: 'Test region' },
    summary: 'A test model.',
    releases: [
      {
        version: 'v2-unavailable',
        status: 'research-only',
        date: '2026-07-13',
        baseModel: 'base-v2',
        dataset: 'data-v2',
        directions: ['eng-tst'],
        rights: 'Research only.',
        metrics: null,
        notes: [],
        artifacts: [{
          label: 'Private merged model',
          kind: 'model',
          format: 'safetensors',
          url: null,
          available: false,
          localPath: '/mnt/private/model.safetensors',
        }],
      },
      {
        version: 'v1-downloadable',
        status: 'published',
        date: '2026-07-12',
        baseModel: 'base-v1',
        dataset: 'data-v1',
        directions: ['eng-tst'],
        rights: 'Research only.',
        metrics: { chrf: 42 },
        notes: ['Speaker review required.'],
        artifacts: [
          {
            label: 'Bundle',
            kind: 'bundle',
            format: 'tar.gz',
            url: '/model-artifacts/test/v1.tar.gz',
            available: true,
            localPath: '/mnt/private/v1.tar.gz',
            sha256: 'abc123',
          },
          {
            label: 'Training data',
            kind: 'dataset',
            format: 'tar.gz',
            url: '/datasets/test-v1.tar.gz',
            available: true,
          },
        ],
      },
    ],
  };
}

describe('public model distribution', () => {
  it('uses the configured public origin behind a reverse proxy', () => {
    const request = {
      headers: new Headers({
        'x-forwarded-host': 'mobtranslate.com',
        'x-forwarded-proto': 'https',
      }),
      nextUrl: {
        origin: 'http://localhost:3300',
        protocol: 'http:',
      },
    };

    expect(resolveModelApiOrigin(request, 'https://mobtranslate.com/docs')).toBe(
      'https://mobtranslate.com',
    );
    expect(resolveModelApiOrigin(request)).toBe('https://mobtranslate.com');
  });

  it('never exposes an inference upstream location', () => {
    expect(publicInferenceEndpointLabel('http://127.0.0.1:7955/translate')).toBe('configured');
    expect(publicInferenceEndpointLabel('http://10.0.0.8/internal')).toBe('configured');
  });

  it('resolves latest to the newest release that has a hostable download', () => {
    const model = fixtureModel();
    expect(latestDownloadableRelease(model)?.version).toBe('v1-downloadable');
    expect(resolvePublicRelease(model, 'latest')?.version).toBe('v1-downloadable');
    expect(resolvePublicRelease(model, 'v2-unavailable')?.version).toBe('v2-unavailable');
  });

  it('removes local paths and makes every public URL absolute', () => {
    const release = fixtureModel().releases[1];
    const result = publicRelease('test-model', release, 'https://mobtranslate.com');
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain('localPath');
    expect(serialized).not.toContain('/mnt/private');
    expect(result.artifacts[0].url).toBe('https://mobtranslate.com/model-artifacts/test/v1.tar.gz');
    expect(result.downloads.models).toHaveLength(1);
    expect(result.downloads.datasets).toHaveLength(1);
  });

  it('publishes version and discovery links without private fields', () => {
    const registry: ModelRegistry = {
      schemaVersion: 2,
      updatedAt: '2026-07-13T00:00:00Z',
      models: [fixtureModel()],
    };
    const catalog = publicCatalog(registry, 'https://mobtranslate.com');

    expect(catalog.models[0].latestVersion).toBe('v1-downloadable');
    expect(catalog.models[0].links.latest).toBe(
      'https://mobtranslate.com/api/v1/models/test-model/versions/latest',
    );
    expect(catalog.links.openapi).toBe('https://mobtranslate.com/api/v1/models/openapi.json');
    expect(JSON.stringify(catalog)).not.toContain('localPath');
  });

  it('publishes v24.3 while retaining v22 and v23 as non-downloadable negative results', () => {
    const model = findModel(loadModelRegistry(), 'kuku-yalanji-nllb-lora');
    expect(model).not.toBeNull();

    const current = resolvePublicRelease(model!, 'latest');
    expect(current?.version).toBe('v24.3-joint-lexeme-dose29-s3598-20260715');
    expect(current?.metrics?.adapter_sha256).toBe(
      'dd61583a60df2d538989e963e104cb626d78965d300e4e473e9a82ef59c04502',
    );
    expect(current?.artifacts.filter(isHostableModelArtifact)).toHaveLength(2);

    const failed = resolvePublicRelease(model!, 'v22.0-step-matched-replay-3120-failed');
    expect(failed?.status).toBe('negative-result');
    expect(failed?.metrics?.primary_checkpoint_gate).toBe('FAIL');
    expect(failed?.artifacts.filter(isHostableModelArtifact)).toHaveLength(0);

    const v23 = resolvePublicRelease(model!, 'v23.0-attested-narrative-adaptation-failed');
    expect(v23?.status).toBe('negative-result');
    expect(v23?.metrics?.research_promotion_gate).toBe('FAIL');
    expect(v23?.metrics?.model_sentence_generation_gate).toBe('FAIL');
    expect(v23?.artifacts.filter(isHostableModelArtifact)).toHaveLength(0);

    const publicCurrent = publicRelease(model!.id, current!, 'https://mobtranslate.com');
    expect(JSON.stringify(publicCurrent)).not.toMatch(/localPath|\/mnt\//);
  });
});
