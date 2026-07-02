import * as fs from 'fs';
import * as path from 'path';
import type { ModelEntry, ModelRegistry, ModelRelease } from './types';

export function registryPath(): string {
  return path.join(process.cwd(), 'public', 'models', 'registry.json');
}

export function loadModelRegistry(): ModelRegistry {
  return JSON.parse(fs.readFileSync(registryPath(), 'utf8')) as ModelRegistry;
}

export function findModel(registry: ModelRegistry, modelId: string): ModelEntry | null {
  return registry.models.find((model) => model.id === modelId) ?? null;
}

export function findRelease(model: ModelEntry, version: string): ModelRelease | null {
  return model.releases.find((release) => release.version === version) ?? null;
}

export function latestTestableRelease(model: ModelEntry): ModelRelease | null {
  return (
    model.releases.find((release) => release.status === 'internal-proof') ??
    model.releases.find((release) => release.status === 'published') ??
    model.releases[0] ??
    null
  );
}
