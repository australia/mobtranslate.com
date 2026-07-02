'use client';

import { FormEvent, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Cpu,
  Database,
  Gauge,
  Loader2,
  Server,
  ShieldCheck,
} from 'lucide-react';
import { Button, Textarea, cn } from '@mobtranslate/ui';
import type { ModelEntry, ModelRegistry, ModelRelease, ModelReleaseResults, ModelResultMap, TranslateV2Response } from '@/lib/models/types';

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

const examples = ['God made the water.', 'My friend is walking.', 'The people heard the story.'];

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

export default function TranslateV2Client({ registry, results, initialModelId, initialVersion }: TranslateV2ClientProps) {
  const releases = useMemo(() => flattenReleases(registry), [registry]);
  const [selectedKey, setSelectedKey] = useState(modelReleaseKey(initialModelId, initialVersion));
  const selected = releases.find(({ model, release }) => modelReleaseKey(model.id, release.version) === selectedKey) ?? releases[0];
  const [direction, setDirection] = useState(selected?.release.directions[0] ?? 'eng-gvn');
  const [text, setText] = useState(examples[0]);
  const [maxNewTokens, setMaxNewTokens] = useState(192);
  const [numBeams, setNumBeams] = useState(4);
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<TranslateV2Response | null>(null);

  const model = selected?.model;
  const release = selected?.release;
  const selectedResults = results[selectedKey];
  const canTranslate = Boolean(model && release && text.trim() && !loading);

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!canTranslate || !model || !release) return;

    setLoading(true);
    setResponse(null);
    try {
      const res = await fetch('/api/translate/v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelId: model.id,
          version: release.version,
          direction,
          text,
          maxNewTokens,
          numBeams,
        }),
      });
      const payload = (await res.json()) as TranslateV2Response;
      setResponse(payload);
    } catch (error) {
      setResponse({
        success: false,
        status: 'endpoint_error',
        error: error instanceof Error ? error.message : 'Could not reach the translate/v2 API.',
      });
    } finally {
      setLoading(false);
    }
  };

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
            Model test bench for versioned MobTranslate language models. Results are draft machine output and stay tied to the selected model release.
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

      <div className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
        <form onSubmit={submit} className="rounded-lg border border-border bg-card">
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
                    setResponse(null);
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
            <label className="grid gap-2 text-sm font-medium">
              English source
              <Textarea
                value={text}
                onChange={(event) => setText(event.target.value)}
                className="min-h-40 resize-y rounded-lg text-base leading-relaxed"
                placeholder="Enter English text"
              />
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
              {examples.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => {
                    setText(example);
                    setResponse(null);
                  }}
                  className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  {example}
                </button>
              ))}
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-medium">
                Max tokens
                <input
                  type="number"
                  min={1}
                  max={512}
                  value={maxNewTokens}
                  onChange={(event) => setMaxNewTokens(Number(event.target.value))}
                  className="h-11 rounded-lg border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                Beams
                <input
                  type="number"
                  min={1}
                  max={8}
                  value={numBeams}
                  onChange={(event) => setNumBeams(Number(event.target.value))}
                  className="h-11 rounded-lg border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </label>
            </div>

            <div className="mt-5 flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs leading-relaxed text-muted-foreground">
                {release.baseModel} · {release.dataset}
              </p>
              <Button type="button" onClick={() => void submit()} disabled={!canTranslate} className="h-11 rounded-lg">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                Run model
              </Button>
            </div>
          </div>
        </form>

        <section className="rounded-lg border border-border bg-card" aria-live="polite">
          <div className="flex items-center justify-between border-b border-border p-4 md:p-5">
            <div>
              <h2 className="text-base font-semibold">Result</h2>
              <p className="text-sm text-muted-foreground">{model.language.name} · {release.version}</p>
            </div>
            {response?.success ? (
              <CheckCircle2 className="h-5 w-5 text-[var(--color-success)]" />
            ) : response ? (
              <AlertTriangle className="h-5 w-5 text-[var(--color-warning)]" />
            ) : (
              <Clock3 className="h-5 w-5 text-muted-foreground" />
            )}
          </div>

          <div className="p-4 md:p-5">
            {loading ? (
              <div className="space-y-3" aria-hidden="true">
                <div className="h-7 w-3/4 animate-pulse rounded bg-muted" />
                <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
                <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
              </div>
            ) : response?.success ? (
              <div>
                <p className="headword text-2xl font-semibold leading-snug" lang="gvn">
                  {response.translation}
                </p>
                {response.gloss && <p className="mt-2 text-sm text-muted-foreground">{response.gloss}</p>}
                <dl className="mt-5 grid gap-3 rounded-lg bg-muted p-4 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-muted-foreground">Latency</dt>
                    <dd className="font-medium">{response.latencyMs ?? 0} ms</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Endpoint</dt>
                    <dd className="truncate font-medium">{response.endpoint?.url ?? 'configured'}</dd>
                  </div>
                </dl>
              </div>
            ) : response?.status === 'not_configured' ? (
              <div className="space-y-4">
                <div className="rounded-lg border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/10 p-4">
                  <div className="flex items-start gap-3">
                    <Server className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-warning)]" />
                    <div>
                      <h3 className="text-sm font-semibold">Inference endpoint not configured</h3>
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{response.error}</p>
                    </div>
                  </div>
                </div>
                {response.setup && (
                  <div className="rounded-lg bg-muted p-4">
                    <p className="text-xs font-semibold text-muted-foreground">{response.setup.envVar}</p>
                    <code className="mt-2 block whitespace-pre-wrap break-words rounded-md bg-background p-3 text-xs text-foreground">
                      {response.setup.runCommand}
                    </code>
                  </div>
                )}
              </div>
            ) : response ? (
              <div className="rounded-lg border border-[var(--color-error)]/30 bg-[var(--color-error)]/10 p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-error)]" />
                  <div>
                    <h3 className="text-sm font-semibold">Model request failed</h3>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{response.error}</p>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm leading-relaxed text-muted-foreground">
                No model output yet. The selected release is visible below so each test stays tied to its dataset, metrics, and resource profile.
              </p>
            )}

            <p className="mt-5 border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">
              Machine translation output is a draft aid. Keep the model version, corpus rights, and review status attached to every test result.
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
              <ResourceRow label="Max GPU" value={release.resources.maxGpuUtilPct != null ? `${release.resources.maxGpuUtilPct}%` : 'n/a'} />
              <ResourceRow label="Max VRAM" value={release.resources.maxVramMiB ? `${release.resources.maxVramMiB.toLocaleString()} MiB` : 'n/a'} />
              <ResourceRow label="Max power" value={release.resources.maxPowerW ? `${release.resources.maxPowerW} W` : 'n/a'} />
              <ResourceRow label="Cost class" value={release.resources.costPerHourUsd ? `$${release.resources.costPerHourUsd}/hr` : 'n/a'} />
            </dl>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">No resource samples yet.</p>
          )}
        </div>
      </section>
    </main>
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
