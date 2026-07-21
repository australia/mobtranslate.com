import type {
  ModelArtifact,
  ModelEntry,
  ModelRegistry,
  ModelRelease,
} from './types';

export type PublicModelArtifact = Omit<ModelArtifact, 'localPath'>;

const HOSTABLE_MODEL_KINDS = new Set(['adapter', 'bundle', 'model']);

export function publicInferenceEndpointLabel(_endpoint: string): string {
  // Upstreams may be loopback or private-network services. Their locations are
  // operational metadata and must never be reflected into public responses.
  return 'configured';
}

function endpoint(origin: string, path: string): string {
  return new URL(path, `${origin.replace(/\/$/, '')}/`).toString();
}

export function publicArtifact(artifact: ModelArtifact, origin: string): PublicModelArtifact {
  const { localPath, ...publicFields } = artifact;
  void localPath;
  return {
    ...publicFields,
    url: publicFields.url ? endpoint(origin, publicFields.url) : null,
  };
}

export function isHostableModelArtifact(artifact: ModelArtifact): boolean {
  return artifact.available && Boolean(artifact.url) && HOSTABLE_MODEL_KINDS.has(artifact.kind);
}

export function latestDownloadableRelease(model: ModelEntry): ModelRelease | null {
  return model.releases.find((release) => release.artifacts.some(isHostableModelArtifact)) ?? null;
}

export function resolvePublicRelease(model: ModelEntry, version: string): ModelRelease | null {
  if (version === 'latest') return latestDownloadableRelease(model);
  return model.releases.find((release) => release.version === version) ?? null;
}

function releaseLinks(origin: string, modelId: string, version: string) {
  const modelPath = `/api/v1/models/${encodeURIComponent(modelId)}`;
  const versionPath = `${modelPath}/versions/${encodeURIComponent(version)}`;
  return {
    self: endpoint(origin, versionPath),
    model: endpoint(origin, modelPath),
    catalog: endpoint(origin, '/api/v1/models'),
  };
}

export function releaseSummary(modelId: string, release: ModelRelease, origin: string) {
  const availableArtifacts = release.artifacts.filter((artifact) => artifact.available && artifact.url);
  const modelDownloads = availableArtifacts.filter(isHostableModelArtifact);
  const documentation = availableArtifacts.find((artifact) => artifact.kind === 'documentation');

  return {
    version: release.version,
    status: release.status,
    date: release.date,
    role: release.role ?? null,
    directions: release.directions,
    baseModel: release.baseModel,
    downloadable: modelDownloads.length > 0,
    modelDownloadCount: modelDownloads.length,
    availableArtifactCount: availableArtifacts.length,
    documentationUrl: documentation?.url ? endpoint(origin, documentation.url) : null,
    links: releaseLinks(origin, modelId, release.version),
  };
}

export function publicRelease(modelId: string, release: ModelRelease, origin: string) {
  const artifacts = release.artifacts.map((artifact) => publicArtifact(artifact, origin));
  const available = artifacts.filter((artifact) => artifact.available && artifact.url);

  return {
    ...release,
    artifacts,
    downloads: {
      models: available.filter((artifact) => HOSTABLE_MODEL_KINDS.has(artifact.kind)),
      datasets: available.filter((artifact) => artifact.kind === 'dataset'),
      documentation: available.filter((artifact) => artifact.kind === 'documentation'),
      supporting: available.filter((artifact) => (
        !HOSTABLE_MODEL_KINDS.has(artifact.kind)
        && artifact.kind !== 'dataset'
        && artifact.kind !== 'documentation'
      )),
    },
    links: releaseLinks(origin, modelId, release.version),
  };
}

export function modelSummary(model: ModelEntry, origin: string) {
  const latest = latestDownloadableRelease(model);
  const modelPath = `/api/v1/models/${encodeURIComponent(model.id)}`;
  return {
    id: model.id,
    name: model.name,
    family: model.family,
    task: model.task,
    labUrl: model.labUrl ? endpoint(origin, model.labUrl) : null,
    language: model.language,
    summary: model.summary,
    latestVersion: latest?.version ?? null,
    latestRelease: latest ? releaseSummary(model.id, latest, origin) : null,
    versions: model.releases.map((release) => releaseSummary(model.id, release, origin)),
    links: {
      self: endpoint(origin, modelPath),
      latest: latest ? endpoint(origin, `${modelPath}/versions/latest`) : null,
      web: endpoint(origin, '/models'),
    },
  };
}

export function publicCatalog(registry: ModelRegistry, origin: string) {
  return {
    apiVersion: 'v1',
    schemaVersion: registry.schemaVersion,
    updatedAt: registry.updatedAt,
    modelCount: registry.models.length,
    models: registry.models.map((model) => modelSummary(model, origin)),
    links: {
      self: endpoint(origin, '/api/v1/models'),
      openapi: endpoint(origin, '/api/v1/models/openapi.json'),
      web: endpoint(origin, '/models'),
      documentation: endpoint(origin, '/docs/kuku-v21-2-model-guide.html'),
    },
  };
}

export function publicModel(model: ModelEntry, origin: string) {
  const summary = modelSummary(model, origin);
  return {
    ...summary,
    releases: model.releases.map((release) => releaseSummary(model.id, release, origin)),
  };
}
