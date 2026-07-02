import * as fs from 'fs';
import * as path from 'path';
import type { Metadata } from 'next';
import Link from 'next/link';
import SharedLayout from '../components/SharedLayout';
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  Cpu,
  Database,
  Download,
  FileText,
  GitBranch,
  ShieldCheck,
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'Models',
  description: 'Download versioned MobTranslate language models, model cards, manifests, and evaluation reports.',
  alternates: { canonical: '/models' },
  openGraph: { title: 'MobTranslate Models', url: '/models', type: 'website' },
};

type Artifact = {
  label: string;
  kind: string;
  format: string;
  url: string | null;
  available: boolean;
  note?: string;
  localPath?: string;
  sha256?: string;
};

type Release = {
  version: string;
  status: string;
  date: string;
  baseModel: string;
  dataset: string;
  directions: string[];
  rights: string;
  metrics: null | Record<string, number | string>;
  notes: string[];
  artifacts: Artifact[];
};

type ModelEntry = {
  id: string;
  name: string;
  family: string;
  task: string;
  language: {
    name: string;
    appCode: string;
    iso6393: string;
    region: string;
  };
  summary: string;
  releases: Release[];
};

type Registry = {
  schemaVersion: number;
  updatedAt: string;
  models: ModelEntry[];
};

function loadRegistry(): Registry {
  const file = path.join(process.cwd(), 'public', 'models', 'registry.json');
  return JSON.parse(fs.readFileSync(file, 'utf8')) as Registry;
}

function statusStyle(status: string): string {
  if (status === 'published') return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
  if (status === 'internal-proof') return 'bg-blue-500/10 text-blue-700 dark:text-blue-300';
  if (status === 'training-ready') return 'bg-amber-500/10 text-amber-700 dark:text-amber-300';
  return 'bg-muted text-muted-foreground';
}

function statusLabel(status: string): string {
  return status.replace(/-/g, ' ');
}

function artifactIcon(kind: string) {
  if (kind === 'model' || kind === 'adapter') return Cpu;
  if (kind === 'evaluation') return CheckCircle2;
  if (kind === 'metadata') return Database;
  return FileText;
}

function versionLabPath(modelId: string, version: string): string {
  return `/translate/v2/${encodeURIComponent(modelId)}/${encodeURIComponent(version)}`;
}

function metricValue(value: number | string): string {
  if (typeof value === 'number') {
    if (Math.abs(value) < 1) return value.toFixed(4);
    if (Math.abs(value) < 10) return value.toFixed(3);
    return value.toFixed(1);
  }
  return value;
}

export default function ModelsPage() {
  const registry = loadRegistry();

  return (
    <SharedLayout>
      <main className="container-custom py-10 md:py-14">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold text-primary">Open model registry</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">
            Download MobTranslate language models
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
            Every public model gets a version, model card, dataset record, rights note, and evaluation report.
            Training-ready entries appear here before artifacts are published so the release path stays visible.
          </p>
        </div>

        <section className="mt-8 grid gap-4 md:grid-cols-3" aria-label="Registry guarantees">
          <div className="rounded-lg border border-border bg-card p-4">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <h2 className="mt-3 text-sm font-semibold">Rights visible</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Release rows carry corpus rights status and keep training consent separate from display rights.
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <GitBranch className="h-5 w-5 text-primary" />
            <h2 className="mt-3 text-sm font-semibold">Versioned artifacts</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Model, adapter, manifest, and eval files are tied to one immutable version.
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <Database className="h-5 w-5 text-primary" />
            <h2 className="mt-3 text-sm font-semibold">Dataset trace</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Each model points back to the exact corpus export used for training and evaluation.
            </p>
          </div>
        </section>

        <section className="mt-10 space-y-5" aria-label="Models">
          {registry.models.map((model) => (
            <article
              key={model.id}
              data-language={model.language.appCode}
              className="rounded-xl border border-border bg-card"
            >
              <div className="border-b border-border p-5 md:p-6">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-semibold md:text-2xl">{model.name}</h2>
                      <span className="rounded-full bg-[var(--lang-accent-soft)] px-2.5 py-1 text-xs font-medium text-[var(--lang-accent)]">
                        {model.language.iso6393}
                      </span>
                    </div>
                    <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                      {model.summary}
                    </p>
                  </div>
                  <div className="shrink-0 rounded-lg bg-muted px-3 py-2 text-sm">
                    <span className="font-medium">{model.family}</span>
                    <span className="block text-xs text-muted-foreground">{model.language.region}</span>
                  </div>
                </div>
              </div>

              <div className="divide-y divide-border">
                {model.releases.map((release) => (
                  <div key={release.version} className="p-5 md:p-6">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-semibold">Version {release.version}</h3>
                          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusStyle(release.status)}`}>
                            {statusLabel(release.status)}
                          </span>
                        </div>
                        <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                          <div>
                            <dt className="text-muted-foreground">Base model</dt>
                            <dd className="font-medium">{release.baseModel}</dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">Dataset</dt>
                            <dd className="font-medium">{release.dataset}</dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">Directions</dt>
                            <dd className="font-medium">{release.directions.join(', ')}</dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">Release date</dt>
                            <dd className="font-medium">{release.date}</dd>
                          </div>
                        </dl>
                      </div>
                  {release.status === 'published' ? (
                        <span className="inline-flex h-9 items-center gap-2 rounded-lg bg-emerald-500/10 px-3 text-sm font-medium text-emerald-700 dark:text-emerald-300">
                          <CheckCircle2 className="h-4 w-4" /> Published
                        </span>
                      ) : release.status === 'internal-proof' ? (
                        <Link
                          href={versionLabPath(model.id, release.version)}
                          className="inline-flex h-9 items-center gap-2 rounded-lg bg-blue-500/10 px-3 text-sm font-medium text-blue-700 hover:bg-blue-500/15 dark:text-blue-300"
                        >
                          <Cpu className="h-4 w-4" /> Test in v2
                        </Link>
                      ) : (
                        <span className="inline-flex h-9 items-center gap-2 rounded-lg bg-amber-500/10 px-3 text-sm font-medium text-amber-700 dark:text-amber-300">
                          <Clock3 className="h-4 w-4" /> Awaiting training run
                        </span>
                      )}
                    </div>

                    <p className="mt-4 max-w-4xl text-sm leading-relaxed text-muted-foreground">
                      {release.rights}
                    </p>

                    {release.metrics && (
                      <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        {Object.entries(release.metrics).slice(0, 8).map(([key, value]) => (
                          <div key={key} className="rounded-lg bg-muted p-3">
                            <dt className="text-xs text-muted-foreground">{key.replace(/_/g, ' ')}</dt>
                            <dd className="mt-1 text-sm font-semibold">{metricValue(value)}</dd>
                          </div>
                        ))}
                      </dl>
                    )}

                    <div className="mt-5 overflow-hidden rounded-lg border border-border">
                      <div className="grid grid-cols-[1fr_auto] gap-3 bg-muted px-4 py-2 text-xs font-semibold text-muted-foreground md:grid-cols-[1.5fr_0.7fr_0.7fr_auto]">
                        <span>Artifact</span>
                        <span className="hidden md:block">Kind</span>
                        <span className="hidden md:block">Format</span>
                        <span>Download</span>
                      </div>
                      <div className="divide-y divide-border">
                        {release.artifacts.map((artifact) => {
                          const Icon = artifactIcon(artifact.kind);
                          return (
                            <div
                              key={`${release.version}-${artifact.label}`}
                              className="grid grid-cols-[1fr_auto] gap-3 px-4 py-3 text-sm md:grid-cols-[1.5fr_0.7fr_0.7fr_auto] md:items-center"
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <Icon className="h-4 w-4 shrink-0 text-primary" />
                                  <span className="font-medium">{artifact.label}</span>
                                </div>
                                {artifact.note && (
                                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{artifact.note}</p>
                                )}
                              </div>
                              <span className="hidden text-muted-foreground md:block">{artifact.kind}</span>
                              <span className="hidden text-muted-foreground md:block">{artifact.format}</span>
                              {artifact.available && artifact.url ? (
                                <Link
                                  href={artifact.url}
                                  className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted"
                                >
                                  <Download className="h-4 w-4" /> Get
                                </Link>
                              ) : artifact.localPath ? (
                                <span className="inline-flex h-9 items-center justify-center rounded-lg bg-muted px-3 text-sm text-muted-foreground">
                                  Local
                                </span>
                              ) : (
                                <span className="inline-flex h-9 items-center justify-center rounded-lg bg-muted px-3 text-sm text-muted-foreground">
                                  Pending
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {release.notes.length > 0 && (
                      <ul className="mt-4 space-y-1 text-sm text-muted-foreground">
                        {release.notes.map((note) => (
                          <li key={note} className="flex gap-2">
                            <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                            <span>{note}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </article>
          ))}
        </section>

        <p className="mt-8 text-sm text-muted-foreground">
          Registry updated {new Date(registry.updatedAt).toLocaleDateString('en-AU', { dateStyle: 'long' })}.
        </p>
      </main>
    </SharedLayout>
  );
}
