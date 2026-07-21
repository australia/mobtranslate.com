'use client';

import { useMemo, useState } from 'react';
import {
  Cpu,
  Database,
  Download,
  ExternalLink,
  Gauge,
  GitBranch,
  Info,
  Layers3,
  Route,
  ShieldCheck,
} from 'lucide-react';
import { cn } from '@mobtranslate/ui';
import type { ModelEntry, ModelRegistry, ModelRelease, ModelReleaseResults, ModelResultMap } from '@/lib/models/types';

type ReleaseOption = {
  model: ModelEntry;
  release: ModelRelease;
};

type TranslateV2ClientProps = {
  registry: ModelRegistry;
  results: ModelResultMap;
  initialModelId: string;
  initialVersion: string;
};

const routeDecisions = [
  {
    label: 'Exact known text',
    value: 'lookup-first',
    detail: 'Bible references, DB usage examples, and elder-shared sentence pairs should come from the approved source table, not generation.',
  },
  {
    label: 'Bible draft',
    value: 'v12.0',
    detail: 'Best current Bible-draft fallback by heldout Bible chrF; still not faithful canonical reproduction.',
  },
  {
    label: 'Usage draft',
    value: 'v10.0',
    detail: 'Best current heldout DB/general usage signal. Newer balanced runs have not beaten it.',
  },
  {
    label: 'Latest research',
    value: 'v20.0',
    detail: 'Full-candidate-corpus diagnostic; length compression is fixed, but faithful generalization is still unresolved.',
  },
];

function flattenReleases(registry: ModelRegistry): ReleaseOption[] {
  return registry.models.flatMap((model) => model.releases.map((release) => ({ model, release })));
}

function modelReleaseKey(modelId: string, version: string): string {
  return `${modelId}::${version}`;
}

function versionLabPath(modelId: string, version: string): string {
  return `/translate/v2/${encodeURIComponent(modelId)}/${encodeURIComponent(version)}`;
}

function statusClass(status: string): string {
  if (status === 'published') return 'bg-[var(--color-success)]/10 text-[var(--color-success)]';
  if (status === 'internal-proof') return 'bg-[var(--color-info)]/10 text-[var(--color-info)]';
  if (status === 'training-ready') return 'bg-[var(--color-warning)]/10 text-[var(--color-warning)]';
  return 'bg-muted text-muted-foreground';
}

function formatStatus(status: string): string {
  return status.replace(/-/g, ' ');
}

function metricValue(value: number | string | null | undefined): string {
  if (typeof value === 'number') {
    if (Math.abs(value) < 1) return value.toFixed(4);
    if (Math.abs(value) < 10) return value.toFixed(3);
    return value.toFixed(1);
  }
  return value == null ? 'n/a' : String(value);
}

function artifactSummary(release: ModelRelease, kind: string): string {
  const artifact = release.artifacts.find((item) => item.kind === kind);
  if (!artifact) return 'n/a';
  if (artifact.available) return 'public';
  if (artifact.localPath) return 'local';
  return 'pending';
}

function firstArtifactUrl(release: ModelRelease, kind: string): string | null {
  return release.artifacts.find((item) => item.kind === kind && item.available && item.url)?.url ?? null;
}

function scoreValue(value: number | string | null | undefined): string {
  if (typeof value === 'number') return value.toFixed(2);
  return value == null ? 'n/a' : String(value);
}

function shortVersion(version: string): string {
  const match = version.match(/^v\\d+(?:\\.\\d+)?/);
  return match?.[0] ?? version;
}

export default function TranslateV2Client({ registry, results, initialModelId, initialVersion }: TranslateV2ClientProps) {
  const releases = useMemo(() => flattenReleases(registry), [registry]);
  const [selectedKey, setSelectedKey] = useState(modelReleaseKey(initialModelId, initialVersion));
  const selected = releases.find(({ model, release }) => modelReleaseKey(model.id, release.version) === selectedKey) ?? releases[0];
  const [direction, setDirection] = useState(selected?.release.directions[0] ?? 'eng-gvn');

  const model = selected?.model;
  const release = selected?.release;
  const selectedResults = results[selectedKey];

  if (!model || !release) {
    return (
      <main className="container-custom py-10">
        <div className="rounded-lg border border-border bg-card p-6">
          <h1 className="text-2xl font-semibold">No model releases registered</h1>
          <p className="mt-2 text-sm text-muted-foreground">Add a release to public/models/registry.json.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="container-custom py-8 md:py-10">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="max-w-3xl">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight">Translate v2</h1>
            <span className={cn('rounded-full px-2.5 py-1 text-xs font-medium', statusClass(release.status))}>
              {formatStatus(release.status)}
            </span>
          </div>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground md:text-base">
            Model evaluation bench for the Kuku Yalanji training run. This page tracks the full v8-v20 diagnostic ladder, saved outputs, downloads, and resource profiles from each RunPod run.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={versionLabPath(model.id, release.version)}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted"
          >
            Version lab
          </a>
          <a
            href="/models"
            className="inline-flex h-10 items-center justify-center rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted"
          >
            Model registry
          </a>
        </div>
      </div>

      <section className="mt-7 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]" aria-label="48 hour model status">
        <div className="rounded-lg border border-border bg-card p-4 md:p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-base font-semibold">Where the model is after 48 hours</h2>
              <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                The training pipeline works. v20 trained the full candidate corpus and fixed the length-compression failure, but it also proved that scale alone is not enough. The hard problem is now product routing, mixture control, and faithful generalization, not GPU plumbing.
              </p>
            </div>
            <span className="inline-flex w-fit items-center gap-2 rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
              Saved evals only
            </span>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            {routeDecisions.map((item) => (
              <div key={item.label} className="rounded-lg border border-border bg-background p-3">
                <p className="text-xs font-medium text-muted-foreground">{item.label}</p>
                <p className="mt-1 text-sm font-semibold">{item.value}</p>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{item.detail}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4 md:p-5">
          <h2 className="text-base font-semibold">Latest run</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <ResourceRow label="Run" value="v20 full candidate corpus" />
            <ResourceRow label="Rows" value="35,394 train / 4,433 validation / 4,397 test" />
            <ResourceRow label="Corpus shape" value="20,911 source pairs expanded into tagged tasks" />
            <ResourceRow label="Training" value="1h52m48s trainer time, 0.98 steps/s" />
            <ResourceRow label="RunPod cost" value="about $3.51" />
          </dl>
        </div>
      </section>

      <div className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
        <section className="rounded-lg border border-border bg-card">
          <div className="border-b border-border p-4 md:p-5">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_180px]">
              <label className="grid gap-1.5 text-sm font-medium">
                Model release
                <select
                  value={selectedKey}
                  onChange={(event) => {
                    const nextKey = event.target.value;
                    const next = releases.find(({ model: itemModel, release: itemRelease }) => modelReleaseKey(itemModel.id, itemRelease.version) === nextKey);
                    setSelectedKey(nextKey);
                    setDirection(next?.release.directions[0] ?? 'eng-gvn');
                  }}
                  className="h-11 rounded-lg border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {releases.map(({ model: itemModel, release: itemRelease }) => (
                    <option key={modelReleaseKey(itemModel.id, itemRelease.version)} value={modelReleaseKey(itemModel.id, itemRelease.version)}>
                      {itemModel.name} - {itemRelease.version}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                Direction
                <select
                  value={direction}
                  onChange={(event) => setDirection(event.target.value)}
                  className="h-11 rounded-lg border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {release.directions.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="p-4 md:p-5">
            <h2 className="text-base font-semibold">Evaluation release</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Live inference is intentionally off. Each release is reviewed through saved evaluation artifacts, exact-match counts, chrF/BLEU scores, resource usage, and downloadable model files.
            </p>
            <dl className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg bg-muted p-3">
                <dt className="text-xs text-muted-foreground">Selected release</dt>
                <dd className="mt-1 break-words text-sm font-semibold">{release.version}</dd>
              </div>
              <div className="rounded-lg bg-muted p-3">
                <dt className="text-xs text-muted-foreground">Direction</dt>
                <dd className="mt-1 text-sm font-semibold">{direction}</dd>
              </div>
              <div className="rounded-lg bg-muted p-3">
                <dt className="text-xs text-muted-foreground">Saved eval rows</dt>
                <dd className="mt-1 text-sm font-semibold">{selectedResults?.metrics?.rows?.toLocaleString() ?? 'see artifacts'}</dd>
              </div>
              <div className="rounded-lg bg-muted p-3">
                <dt className="text-xs text-muted-foreground">Release role</dt>
                <dd className="mt-1 text-sm font-semibold">{release.role ?? release.dataset}</dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border p-4 md:p-5">
            <div>
              <h2 className="text-base font-semibold">Current eval summary</h2>
              <p className="text-sm text-muted-foreground">{model.language.name} · {release.version}</p>
            </div>
            <Route className="h-5 w-5 text-primary" />
          </div>

          <div className="p-4 md:p-5">
            {selectedResults?.metrics ? (
              <dl className="grid grid-cols-3 gap-3 text-sm">
                <ResultMetric label="BLEU" value={selectedResults.metrics.bleu} />
                <ResultMetric label="chrF" value={selectedResults.metrics.chrf} />
                <ResultMetric label="Rows" value={selectedResults.metrics.rows} />
              </dl>
            ) : (
              <p className="text-sm leading-relaxed text-muted-foreground">No compact saved-output preview is attached to this release yet. Use the artifacts and metrics sections below.</p>
            )}

            <p className="mt-5 border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">
              This page shows reproducible eval artifacts only. Approved Bible text, database examples, and elder-shared sentence pairs should remain lookup-first in the product.
            </p>
          </div>
        </section>
      </div>

      <section className="mt-6 grid gap-4 lg:grid-cols-4" aria-label="Selected release details">
        <ReleaseFact icon={Database} label="Dataset" value={release.dataset} />
        <ReleaseFact
          icon={Gauge}
          label="Training rows"
          value={release.training?.trainRows ? release.training.trainRows.toLocaleString() : 'planned'}
        />
        <ReleaseFact
          icon={Cpu}
          label="GPU"
          value={release.resources?.gpu ?? 'not allocated'}
        />
        <ReleaseFact
          icon={ShieldCheck}
          label="Artifacts"
          value={`model ${artifactSummary(release, 'model')} · adapter ${artifactSummary(release, 'adapter')}`}
        />
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <div className="rounded-lg border border-border bg-card p-4 md:p-5">
          <h2 className="text-base font-semibold">Release verdict</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{release.verdict ?? 'No verdict recorded yet.'}</p>
          {release.notes.length > 0 && (
            <ul className="mt-4 space-y-2 text-sm leading-relaxed text-muted-foreground">
              {release.notes.map((note) => (
                <li key={note} className="flex gap-2">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>{note}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <ArtifactLinks release={release} />
      </section>

      {selectedResults && (
        <SavedOutputs results={selectedResults} />
      )}

      <section className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.7fr)]">
        <div className="rounded-lg border border-border bg-card p-4 md:p-5">
          <h2 className="text-base font-semibold">Metrics</h2>
          {release.metrics ? (
            <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {Object.entries(release.metrics).map(([key, value]) => (
                <div key={key} className="rounded-lg bg-muted p-3">
                  <dt className="text-xs text-muted-foreground">{key.replace(/_/g, ' ')}</dt>
                  <dd className="mt-1 text-sm font-semibold">{metricValue(value)}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">No metrics yet for this release.</p>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card p-4 md:p-5">
          <h2 className="text-base font-semibold">Resource profile</h2>
          {release.resources ? (
            <dl className="mt-4 space-y-3 text-sm">
              <ResourceRow label="Average GPU" value={release.resources.avgGpuUtilPct != null ? `${release.resources.avgGpuUtilPct}%` : 'n/a'} />
              <ResourceRow label="Max GPU" value={release.resources.maxGpuUtilPct != null ? `${release.resources.maxGpuUtilPct}%` : 'n/a'} />
              <ResourceRow label="Mean VRAM" value={release.resources.meanVramMiB ? `${release.resources.meanVramMiB.toLocaleString()} MiB` : 'n/a'} />
              <ResourceRow label="Max VRAM" value={release.resources.maxVramMiB ? `${release.resources.maxVramMiB.toLocaleString()} MiB` : 'n/a'} />
              <ResourceRow label="Max power" value={release.resources.maxPowerW ? `${release.resources.maxPowerW} W` : 'n/a'} />
              <ResourceRow label="Cost class" value={release.resources.costPerHourUsd ? `$${release.resources.costPerHourUsd}/hr` : 'n/a'} />
              <ResourceRow label="Estimated run cost" value={release.resources.estimatedCostUsd ? `$${release.resources.estimatedCostUsd}` : 'n/a'} />
            </dl>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">No resource samples yet.</p>
          )}
        </div>
      </section>

      <ModelLadder releases={releases} selectedKey={selectedKey} />
    </main>
  );
}

function ArtifactLinks({ release }: { release: ModelRelease }) {
  const publicArtifacts = release.artifacts.filter((artifact) => artifact.available && artifact.url);

  return (
    <div className="rounded-lg border border-border bg-card p-4 md:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Downloads and artifacts</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Public links resolve through the model-artifact file server. Merged models are large safetensor directories.
          </p>
        </div>
        <Download className="h-5 w-5 text-primary" />
      </div>
      {publicArtifacts.length > 0 ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {publicArtifacts.map((artifact) => (
            <a
              key={`${artifact.kind}:${artifact.label}:${artifact.url}`}
              href={artifact.url ?? '#'}
              className="flex min-h-16 items-start justify-between gap-3 rounded-lg border border-border bg-background p-3 text-sm hover:bg-muted"
            >
              <span>
                <span className="block font-medium">{artifact.label}</span>
                <span className="mt-1 block text-xs text-muted-foreground">{artifact.kind} · {artifact.format}</span>
              </span>
              <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            </a>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">No public downloads are attached to this release.</p>
      )}
    </div>
  );
}

function SavedOutputs({ results }: { results: ModelReleaseResults }) {
  return (
    <section className="mt-4 rounded-lg border border-border bg-card p-4 md:p-5" aria-label="Saved evaluation outputs">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-base font-semibold">Saved test outputs</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Held-out examples from the saved evaluation artifacts for this model release.
          </p>
          {results.sourceLabels && results.sourceLabels.length > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              Sources: {results.sourceLabels.map((label) => label.replace(/_/g, ' ')).join(', ')}
            </p>
          )}
        </div>
        {results.metrics && (
          <dl className="grid grid-cols-3 gap-2 text-sm">
            <ResultMetric label="BLEU" value={results.metrics.bleu} />
            <ResultMetric label="chrF" value={results.metrics.chrf} />
            <ResultMetric label="Rows" value={results.metrics.rows} />
          </dl>
        )}
      </div>

      {results.samples.length > 0 ? (
        <div className="mt-4 overflow-hidden rounded-lg border border-border">
          <div className="grid gap-3 bg-muted px-4 py-2 text-xs font-semibold text-muted-foreground lg:grid-cols-[1fr_1fr_1fr]">
            <span>Source</span>
            <span>Model output</span>
            <span>Reference</span>
          </div>
          <div className="divide-y divide-border">
            {results.samples.map((sample) => (
              <div key={sample.id} className="grid gap-3 px-4 py-4 text-sm lg:grid-cols-[1fr_1fr_1fr]">
                <div>
                  {sample.sourceFamily && (
                    <p className="mb-1 text-xs font-medium text-primary">
                      {sample.sourceFamily.replace(/_/g, ' ')}
                    </p>
                  )}
                  {sample.canonicalRef && (
                    <p className="mb-2 text-xs font-medium text-muted-foreground">{sample.canonicalRef}</p>
                  )}
                  <p className="leading-relaxed">{sample.input}</p>
                </div>
                <p className="leading-relaxed text-foreground" lang="gvn">{sample.prediction}</p>
                <p className="leading-relaxed text-muted-foreground" lang="gvn">{sample.reference}</p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">No saved prediction rows were found for this release.</p>
      )}
    </section>
  );
}

function ResultMetric({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div className="rounded-lg bg-muted px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold">{value == null ? 'n/a' : metricValue(value)}</dd>
    </div>
  );
}

function ModelLadder({ releases, selectedKey }: { releases: ReleaseOption[]; selectedKey: string }) {
  return (
    <section className="mt-4 rounded-lg border border-border bg-card p-4 md:p-5" aria-label="Model version ladder">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-base font-semibold">Version ladder</h2>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            Every material training branch from the last two days is listed here so the model line is auditable. chrF is useful for comparison, but exact approved known resources stay lookup-first.
          </p>
        </div>
        <span className="inline-flex w-fit items-center gap-2 rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
          <GitBranch className="h-3.5 w-3.5" />
          {releases.length} releases
        </span>
      </div>

      <div className="mt-4 overflow-x-auto rounded-lg border border-border">
        <table className="min-w-[980px] w-full border-collapse text-sm">
          <thead className="bg-muted text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">Version</th>
              <th className="px-3 py-2 text-left font-semibold">Role</th>
              <th className="px-3 py-2 text-right font-semibold">Bible ref</th>
              <th className="px-3 py-2 text-right font-semibold">Usage</th>
              <th className="px-3 py-2 text-right font-semibold">Elder rows</th>
              <th className="px-3 py-2 text-left font-semibold">Decision</th>
              <th className="px-3 py-2 text-left font-semibold">Links</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {releases.map(({ model, release }) => {
              const key = modelReleaseKey(model.id, release.version);
              const modelUrl = firstArtifactUrl(release, 'model');
              const evalUrl = firstArtifactUrl(release, 'evaluation') || firstArtifactUrl(release, 'metadata');
              return (
                <tr key={key} className={cn(key === selectedKey && 'bg-[var(--color-primary)]/5')}>
                  <td className="px-3 py-3 align-top">
                    <a href={versionLabPath(model.id, release.version)} className="font-medium text-primary hover:underline">
                      {shortVersion(release.version)}
                    </a>
                    <p className="mt-1 max-w-48 break-words text-xs text-muted-foreground">{release.version}</p>
                  </td>
                  <td className="px-3 py-3 align-top">
                    <p className="max-w-56 font-medium">{release.role ?? release.dataset}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{formatStatus(release.status)}</p>
                  </td>
                  <td className="px-3 py-3 text-right align-top">{scoreValue(release.scorecard?.bibleRefChrf)}</td>
                  <td className="px-3 py-3 text-right align-top">{scoreValue(release.scorecard?.usageChrf)}</td>
                  <td className="px-3 py-3 text-right align-top">
                    {release.scorecard?.communitySentenceExact ?? scoreValue(release.scorecard?.communitySentenceChrf)}
                  </td>
                  <td className="px-3 py-3 align-top">
                    <p className="max-w-72 text-muted-foreground">{release.verdict ?? 'No verdict recorded.'}</p>
                  </td>
                  <td className="px-3 py-3 align-top">
                    <div className="flex flex-wrap gap-2">
                      {modelUrl && (
                        <a href={modelUrl} className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-1 text-xs font-medium hover:bg-muted">
                          <Layers3 className="h-3 w-3" />
                          model
                        </a>
                      )}
                      {evalUrl && (
                        <a href={evalUrl} className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-1 text-xs font-medium hover:bg-muted">
                          <Route className="h-3 w-3" />
                          eval
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ReleaseFact({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Database;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <Icon className="h-4 w-4 text-primary" />
      <p className="mt-3 text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold">{value}</p>
    </div>
  );
}

function ResourceRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
