// @vitest-environment node

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadModelResultSamples, modelReleaseKey } from '../../lib/models/results';
import type { ModelRegistry } from '../../lib/models/types';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function registryWithArtifacts(artifacts: ModelRegistry['models'][number]['releases'][number]['artifacts']): ModelRegistry {
  return {
    schemaVersion: 1,
    updatedAt: '2026-07-13T00:00:00Z',
    models: [{
      id: 'test-model',
      name: 'Test model',
      family: 'test',
      task: 'translation',
      language: { name: 'Test', appCode: 'test', iso6393: 'tst', region: 'Test' },
      summary: 'Test registry entry.',
      releases: [{
        version: 'v1',
        status: 'research-only',
        date: '2026-07-13',
        baseModel: 'test',
        dataset: 'test',
        directions: ['eng-tst'],
        rights: 'test',
        metrics: null,
        notes: [],
        artifacts,
      }],
    }],
  };
}

describe('model result artifacts', () => {
  it('ignores human-readable evaluation reports and parses only JSON evaluations', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mobtranslate-model-results-'));
    temporaryDirectories.push(directory);
    const reportPath = path.join(directory, 'report.md');
    const resultPath = path.join(directory, 'results.json');
    fs.writeFileSync(reportPath, '# Human-readable report\n');
    fs.writeFileSync(resultPath, JSON.stringify({
      metrics: { bleu: 2.5, chrf: 31.25, rows: 1 },
      predictions: [{ id: 'row-1', input_text: 'Source', prediction: 'Draft', reference: 'Reference' }],
    }));

    const results = loadModelResultSamples(registryWithArtifacts([
      {
        label: 'HTML report', kind: 'evaluation', format: 'html', url: '/docs/report.html',
        available: true, localPath: reportPath,
      },
      {
        label: 'Machine results', kind: 'evaluation', format: 'JSON', url: null,
        available: false, localPath: resultPath,
      },
    ]));

    expect(results[modelReleaseKey('test-model', 'v1')]).toEqual(expect.objectContaining({
      artifactPath: resultPath,
      artifactPaths: [resultPath],
      metrics: { bleu: 2.5, chrf: 31.25, rows: 1 },
      samples: [expect.objectContaining({ id: 'row-1', input: 'Source', prediction: 'Draft' })],
    }));
  });

  it('returns no saved-result entry for a human-readable report alone', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mobtranslate-model-results-'));
    temporaryDirectories.push(directory);
    const reportPath = path.join(directory, 'report.md');
    fs.writeFileSync(reportPath, '# Human-readable report\n');

    const results = loadModelResultSamples(registryWithArtifacts([{
      label: 'HTML report', kind: 'evaluation', format: 'html', url: '/docs/report.html',
      available: true, localPath: reportPath,
    }]));

    expect(results).toEqual({});
  });
});
