import type { Metadata } from 'next';
import fs from 'node:fs';
import path from 'node:path';
import Link from 'next/link';
import { ArrowLeft, Grid3x3, ExternalLink } from 'lucide-react';
import SharedLayout from '../../components/SharedLayout';
import GrammarLens from './GrammarLens';
import type { GrammarPointCollection } from './GrammarMap';
import type { GrammarCatalog, GrammarMatrix } from './grammarTypes';

export const metadata: Metadata = {
  title: 'Grammar & similarity — Atlas of Australian Languages',
  description:
    'Colour the map by any Grambank or WALS grammatical feature across every language that codes it, ' +
    'compare two languages feature by feature with an honest recorded-agreement score (and n_joint), ' +
    'and see closest-by-agreement neighbours. Unknown and not-coded values are shown explicitly grey, ' +
    'never as absent. Built on open (CC-BY) data: Grambank v1.0.3, WALS 2020.4.',
  alternates: { canonical: '/atlas/grammar' },
};

export const dynamic = 'force-static';

interface IndexLang {
  slug: string;
  name: string;
  family: string;
  lat: number | null;
  lon: number | null;
}

function loadData(): { catalog: GrammarCatalog; points: GrammarPointCollection } {
  const dir = path.join(process.cwd(), 'data', 'atlas');
  const matrix = JSON.parse(
    fs.readFileSync(path.join(dir, 'grammar-matrix.json'), 'utf8'),
  ) as GrammarMatrix;
  const index = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8')) as {
    languages: IndexLang[];
  };

  // Catalogue = everything the client needs SSR'd, minus the big `values` map
  // (which GrammarLens fetches lazily from public/).
  const catalog: GrammarCatalog = {
    version: matrix.version,
    build_stamp: matrix.build_stamp,
    metric: matrix.metric,
    baseline_caveat: matrix.baseline_caveat,
    coverage: matrix.coverage,
    domains: matrix.domains,
    features: matrix.features,
    langs: matrix.langs,
    neighbours: matrix.neighbours,
    top_pairs: matrix.top_pairs,
  };

  // Every LOCATED language is a map point (profiled ones get coloured, the rest
  // render as a faint neutral so the whole continent stays visible + honest).
  const located = index.languages.filter((l) => l.lat != null && l.lon != null);
  const points: GrammarPointCollection = {
    type: 'FeatureCollection',
    features: located.map((l) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [l.lon as number, l.lat as number] },
      properties: {
        slug: l.slug,
        name: l.name,
        family: l.family,
        __c: '#8a8172',
        __o: 0.14,
        __r: 0,
        __sel: false,
      },
    })),
  };

  return { catalog, points };
}

export default function GrammarPage() {
  const { catalog, points } = loadData();
  const cov = catalog.coverage;

  return (
    <SharedLayout>
      <div className="mx-auto max-w-[1400px]">
        <Link
          href="/atlas"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft size={15} />
          Back to the atlas
        </Link>

        {/* Header */}
        <header className="mt-4 flex items-start gap-3">
          <span
            className="mt-1 hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary sm:flex"
            aria-hidden="true"
          >
            <Grid3x3 size={22} />
          </span>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
              Grammar &amp; similarity
            </p>
            <h1 className="marketing mt-1 text-3xl font-bold leading-tight text-foreground sm:text-4xl">
              The typology lens
            </h1>
            <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
              Colour the whole map by any single grammatical feature, or set two languages side by side
              and read exactly where they agree and differ. Grammar is coded for{' '}
              <span className="font-medium text-foreground">{cov.profiled_languages}</span> of the{' '}
              {cov.genuine_languoids.toLocaleString()} languages — the rest stay on the map, honestly
              greyed as &ldquo;not grammatically profiled&rdquo;.
            </p>
          </div>
        </header>

        {/* coverage strip */}
        <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-4">
          {[
            { v: cov.profiled_languages.toString(), l: 'languages profiled', s: `of ${cov.genuine_languoids.toLocaleString()} total` },
            { v: cov.features_total.toString(), l: 'features', s: `${cov.by_source['Grambank'] ?? 0} Grambank · ${cov.by_source['WALS'] ?? 0} WALS · ${cov.by_source['AUS extension'] ?? 0} ext.` },
            { v: cov.coded_data_points.toLocaleString(), l: 'coded data points', s: 'value where recorded' },
            { v: cov.similarity_pairs.toLocaleString(), l: 'agreement pairs', s: 'recorded Grambank agreement' },
          ].map((s) => (
            <div key={s.l} className="bg-card p-4">
              <div className="font-display text-2xl font-bold text-foreground">{s.v}</div>
              <div className="mt-0.5 text-[13px] font-medium leading-tight text-foreground/90">{s.l}</div>
              <div className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{s.s}</div>
            </div>
          ))}
        </div>

        {/* The lens */}
        <div className="mt-6">
          <GrammarLens
            catalog={catalog}
            points={points}
            matrixUrl="/atlas-data/grammar-matrix.json"
          />
        </div>

        {/* About / Method */}
        <section className="mt-8 rounded-2xl border border-border bg-muted/30 p-5" aria-labelledby="method-heading">
          <h2 id="method-heading" className="text-sm font-semibold uppercase tracking-wider text-foreground">
            About this lens &amp; its method
          </h2>
          <div className="mt-3 grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div className="space-y-2 text-[13px] leading-relaxed text-muted-foreground">
              <p>
                <span className="font-semibold text-foreground">The data.</span> Grammatical feature
                values come from{' '}
                <a href="https://grambank.clld.org" target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">
                  Grambank v1.0.3 <ExternalLink size={11} className="inline" />
                </a>{' '}
                (~195 standardized variables) and{' '}
                <a href="https://wals.info" target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">
                  WALS 2020.4 <ExternalLink size={11} className="inline" />
                </a>
                , with an Australianist extension layer — all CC-BY-4.0. They are joined to the atlas by
                Glottocode from a read-only build-time snapshot; nothing is queried live.
              </p>
              <p>
                <span className="font-semibold text-foreground">A baseline, not the grammar.</span>{' '}
                Grambank&rsquo;s variables are a cross-linguistic <em>baseline</em> for comparison, not a
                complete description of any language&rsquo;s grammar. A language coding few of them is not
                &ldquo;simpler&rdquo; — it is less fully profiled.
              </p>
            </div>
            <div className="space-y-2 text-[13px] leading-relaxed text-muted-foreground">
              <p>
                <span className="font-semibold text-foreground">The similarity metric</span> is{' '}
                <code className="font-mono text-[11px]">grammar_recorded_agreement</code> —{' '}
                &ldquo;{catalog.metric.label}&rdquo;. It is the fraction of{' '}
                <em>jointly-coded Grambank</em> features on which two languages carry the same value.
                &lsquo;?&rsquo;-unknown and N/A are excluded from both sides of that fraction. We always
                show <span className="font-mono text-[11px]">n_joint</span> — a 90% agreement over 8 shared
                features is not the same as over 150.
              </p>
              <p>
                <span className="font-semibold text-foreground">It is not relatedness.</span> Recorded
                agreement is <em>not</em> overall grammatical similarity and <em>not</em> genetic
                relatedness — unrelated languages can share many baseline values. Unknown and not-coded
                cells render an explicit grey, never conflated with &ldquo;absent&rdquo;.
              </p>
            </div>
          </div>
          <p className="mt-3 border-t border-border/60 pt-3 text-[11.5px] text-muted-foreground">
            Data release {catalog.version} · reproducible via{' '}
            <code className="font-mono text-[11px]">pnpm atlas:build-data</code> · sources &amp; licences
            in the{' '}
            <Link href="/atlas/methods" className="font-medium text-primary hover:underline">
              methodology
            </Link>
            . A spreading language lineage is not the same as a moving population.
          </p>
        </section>
      </div>
    </SharedLayout>
  );
}
