import type { Metadata } from 'next';
import type { ComponentType } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Download,
  FileText,
  Table2,
  MapPinned,
  BookMarked,
  ScrollText,
  ShieldCheck,
  GitBranch,
  ExternalLink,
} from 'lucide-react';
import SharedLayout from '../../components/SharedLayout';
import CopyBlock from './CopyBlock';
import manifestData from '../../../data/atlas/manifest.json';
import coverageData from '../../../data/atlas/coverage-report.json';
import downloadsData from '../../../public/atlas-data/downloads/downloads.json';

export const metadata: Metadata = {
  title: 'Methods, sources & open data — Atlas of Australian Languages',
  description:
    'How the Atlas of Australian Languages is built and how to cite it: every upstream dataset with its version, licence and DOI; downloadable open datasets (CSV, GeoJSON, BibTeX, CITATION.cff); the join method and reproducibility; the uncertainty policy; and an Indigenous Data Sovereignty / ICIP statement.',
};

export const dynamic = 'force-static';

const DL_DIR = '/atlas-data/downloads';

function fmtBytes(n: number): string {
  if (!n) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtRows(n: number | null): string {
  if (n === null || n === undefined) return '';
  return n.toLocaleString('en-AU');
}

// Canonical link + verified DOI per upstream dataset. DOIs here are real
// (paper DOIs); dataset versioned Zenodo DOIs are intentionally left to the
// landing page rather than asserted, per the no-fabricated-DOI rule.
const SOURCE_LINKS: Record<string, { href: string; doi?: string; used: string }> = {
  Glottolog: {
    href: 'https://glottolog.org',
    used: 'Classification chains, coordinates, ISO/glottocodes, AES endangerment.',
  },
  Grambank: {
    href: 'https://grambank.clld.org',
    doi: '10.1126/sciadv.adg6175',
    used: 'Grammatical feature profiles (the /atlas/grammar lens + grammar-values.csv).',
  },
  WALS: {
    href: 'https://wals.info',
    used: 'Supplementary grammatical features baked into the feature tables.',
  },
  'Australianist typology extension (AUS extension)': {
    href: '/atlas/grammar',
    used: 'Australia-specific features + recorded-agreement similarity neighbours.',
  },
  'AIATSIS AUSTLANG': {
    href: 'https://collection.aiatsis.gov.au/austlang',
    used: 'Canonical AU language codes, approximate coordinates, alt-name lists.',
  },
  'Bouckaert, Bowern & Atkinson 2018 (Phlorest)': {
    href: 'https://phlorest.clld.org',
    doi: '10.1038/s41559-018-0489-3',
    used: 'The dated Pama-Nyungan phylogeographic tree (deep-time positions on /atlas/spread).',
  },
  PHOIBLE: {
    href: 'https://phoible.org',
    used: 'Phonological inventories — referenced pointer only, not yet ingested.',
  },
  'E. M. Curr, The Australian Race (1886-87)': {
    href: 'https://archive.org/details/australianrace01curruoft',
    used: '19th-century locality wordlists (historical appendix — colonial OCR, not community lexicons).',
  },
  'English Wiktionary': {
    href: 'https://kaikki.org',
    used: 'Open lexical resources for some languoids.',
  },
  'mobtranslate-pg (live DB)': {
    href: '/atlas',
    used: 'Live, community-curated dictionary word-counts (read-only build-time snapshot).',
  },
};

const FILE_ICON: Record<string, ComponentType<{ size?: number; className?: string }>> = {
  'languages.csv': Table2,
  'languages.geojson': MapPinned,
  'grammar-values.csv': Table2,
  'theses.json': ScrollText,
  'sources.bib': BookMarked,
  'CITATION.cff': FileText,
  'README.md': FileText,
};

export default function MethodsPage() {
  const manifest: any = manifestData;
  const coverage: any = coverageData;
  const downloads: any = downloadsData;

  const sources: any[] = manifest?.source_datasets ?? [];
  const release: string = manifest?.data_release_version ?? '1.1.0';
  const buildDate: string = downloads?.build_date ?? (manifest?.build_stamp ?? '').slice(0, 10);
  const files: any[] = (downloads?.files ?? []).filter((f: any) => f.file !== 'downloads.json');

  const cov = coverage ?? {};
  const genuine = cov.genuine_languoids ?? 980;

  const suggestedCite = `Mob Translate project & Claude (2026). The Atlas of Australian Languages, data release ${release}. https://mobtranslate.com/atlas (accessed <date>).`;
  const atlasBibtex = `@misc{atlas_australian_languages,
  author       = {{Mob Translate project and Claude (Anthropic)}},
  title        = {The Atlas of Australian Languages},
  year         = {2026},
  version      = {${release}},
  howpublished = {\\url{https://mobtranslate.com/atlas}},
  note         = {Data release ${release}, build ${buildDate}. Derived layer CC-BY-4.0. Cite the upstream datasets too (see sources.bib).}
}`;

  const covStat = (n: number | undefined, label: string) => ({
    frac: `${(n ?? 0).toLocaleString('en-AU')} / ${genuine.toLocaleString('en-AU')}`,
    label,
  });
  const coverageStats = [
    covStat(cov.coordinates?.any, 'located (with a real or approximate coordinate)'),
    covStat(cov.classification?.with_family_chain, 'with a full classification chain'),
    covStat(cov.grammar_profiled, 'grammatically profiled (Grambank/WALS/AUS)'),
    covStat(cov.deep_time_dated, 'with a dated deep-time position'),
    covStat(cov.endangerment_known, 'with a coded endangerment level'),
    covStat(cov.ids?.glottocode, 'with a Glottolog code'),
  ];

  return (
    <SharedLayout>
      <div className="mx-auto max-w-3xl py-6">
        <Link
          href="/atlas"
          className="inline-flex items-center gap-1.5 rounded text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <ArrowLeft size={15} aria-hidden="true" />
          Back to the atlas
        </Link>

        <header className="mt-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
            Methods, sources &amp; open data
          </p>
          <h1 className="marketing mt-1 text-3xl font-bold leading-tight text-foreground sm:text-4xl">
            How this atlas is built, and how to cite it
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
            The Atlas of Australian Languages is assembled from open scholarly datasets and served as
            versioned static artifacts — never a live database query at request time. Every field on
            every profile carries its source, coverage is reported as honest fractions rather than
            rounded to imply completeness, and the whole joined dataset is downloadable below under the
            upstream licences.{' '}
            <span className="whitespace-nowrap font-medium text-foreground">
              Data release {release}
            </span>{' '}
            · build {buildDate}.
          </p>
        </header>

        {/* ---------------------------------------------- Upstream datasets -- */}
        {sources.length > 0 && (
          <section className="mt-12" aria-labelledby="sources-h">
            <h2
              id="sources-h"
              className="text-sm font-semibold uppercase tracking-wider text-foreground"
            >
              Upstream datasets
            </h2>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
              Each source is used for a specific plane of the atlas. Versions and licences are exactly
              as released; where a versioned Zenodo DOI is best obtained from the dataset&apos;s own
              landing page we link the canonical page rather than assert an identifier we have not
              verified.
            </p>
            <div className="mt-4 overflow-x-auto rounded-2xl border border-border">
              <table className="w-full min-w-[640px] border-collapse text-left text-[13px]">
                <caption className="sr-only">
                  Upstream datasets with version, licence, canonical link or DOI, and what the atlas
                  uses each for.
                </caption>
                <thead className="bg-muted/60 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-4 py-2.5 font-semibold">Dataset</th>
                    <th scope="col" className="px-4 py-2.5 font-semibold">Version</th>
                    <th scope="col" className="px-4 py-2.5 font-semibold">Licence</th>
                    <th scope="col" className="px-4 py-2.5 font-semibold">Link / DOI</th>
                    <th scope="col" className="px-4 py-2.5 font-semibold">Used for</th>
                  </tr>
                </thead>
                <tbody>
                  {sources.map((s, i) => {
                    const meta = SOURCE_LINKS[s.name];
                    const external = meta?.href?.startsWith('http');
                    return (
                      <tr
                        key={s.name}
                        className={i % 2 ? 'bg-card' : 'bg-card/40'}
                      >
                        <th
                          scope="row"
                          className="px-4 py-2.5 text-left font-medium text-foreground align-top"
                        >
                          {s.name}
                        </th>
                        <td className="px-4 py-2.5 text-muted-foreground align-top">{s.version}</td>
                        <td className="px-4 py-2.5 align-top">
                          <span className="inline-block rounded-full bg-secondary/12 px-2 py-0.5 text-[11px] font-medium text-secondary">
                            {s.license}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 align-top">
                          {meta ? (
                            <div className="flex flex-col gap-1">
                              <Link
                                href={meta.href}
                                target={external ? '_blank' : undefined}
                                rel={external ? 'noopener noreferrer' : undefined}
                                className="inline-flex items-center gap-1 rounded font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                              >
                                {external ? new URL(meta.href).hostname.replace('www.', '') : meta.href}
                                {external && <ExternalLink size={11} aria-hidden="true" />}
                              </Link>
                              {meta.doi && (
                                <a
                                  href={`https://doi.org/${meta.doi}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="rounded font-mono text-[11px] text-muted-foreground hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                                >
                                  doi:{meta.doi}
                                </a>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground align-top">
                          {meta?.used ?? s.role}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3.5 text-[12.5px] leading-relaxed text-muted-foreground">
              <strong className="text-foreground">CC-BY vs CC-BY-NC.</strong> The Bouckaert et&nbsp;al.
              2018 phylogeny is used here via the <strong>Phlorest CLDF release (CC-BY-4.0)</strong>. The
              same tree is also distributed through <strong>D-PLACE</strong>, parts of which carry
              <strong> CC-BY-NC</strong>. The atlas deliberately sources the CC-BY-4.0 Phlorest release
              so the deep-time layer is free of a non-commercial clause. Share-alike sources —
              Wiktionary (CC-BY-SA-4.0) and PHOIBLE (CC-BY-SA-3.0) — keep their share-alike terms if you
              redistribute those fields.
            </p>
          </section>
        )}

        {/* ------------------------------------------------------ Downloads -- */}
        {files.length > 0 && (
          <section className="mt-12" aria-labelledby="downloads-h">
            <h2
              id="downloads-h"
              className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-foreground"
            >
              <Download size={15} className="text-primary" aria-hidden="true" />
              Download the open data
            </h2>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
              A deterministic, reproducible snapshot of release {release}. These are open data under the
              upstream licences — <strong className="text-foreground">attribute accordingly</strong>. The
              atlas&apos;s own derived layer (the joins, tiers, provenance flags, coverage tables) is
              released <strong className="text-foreground">CC-BY-4.0</strong>.
            </p>
            <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {files.map((f) => {
                const Icon = FILE_ICON[f.file] ?? FileText;
                const ext = f.file.split('.').pop()?.toUpperCase() ?? 'FILE';
                return (
                  <li key={f.file}>
                    <a
                      href={`${DL_DIR}/${f.file}`}
                      download
                      className="group flex h-full flex-col gap-2 rounded-2xl border border-border bg-card p-4 shadow-sm transition-colors hover:border-primary/50 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Icon size={16} className="shrink-0 text-primary" aria-hidden="true" />
                          <span className="truncate font-mono text-[13px] font-semibold text-foreground">
                            {f.file}
                          </span>
                        </div>
                        <Download
                          size={14}
                          className="mt-0.5 shrink-0 text-muted-foreground transition-colors group-hover:text-primary"
                          aria-hidden="true"
                        />
                      </div>
                      <p className="text-[12.5px] leading-relaxed text-muted-foreground">
                        {f.description}
                      </p>
                      <p className="mt-auto text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        {ext} · {fmtBytes(f.bytes)}
                        {f.rows ? ` · ${fmtRows(f.rows)} rows` : ''}
                      </p>
                    </a>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
              Prefer a single documented bundle? The{' '}
              <a
                href={`${DL_DIR}/README.md`}
                download
                className="rounded font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                README / data dictionary
              </a>{' '}
              describes every file, column and licence. A CLDF package is not yet emitted; the
              CSV&nbsp;+&nbsp;GeoJSON&nbsp;+&nbsp;BibTeX&nbsp;+&nbsp;CITATION.cff set above is the
              interchange format for this release.
            </p>
          </section>
        )}

        {/* ------------------------------------------------------ How to cite -- */}
        <section className="mt-12" aria-labelledby="cite-h">
          <h2
            id="cite-h"
            className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-foreground"
          >
            <BookMarked size={15} className="text-primary" aria-hidden="true" />
            How to cite this atlas
          </h2>
          <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
            Cite the atlas <em>and</em> the upstream datasets you rely on. The machine-readable{' '}
            <a
              href={`${DL_DIR}/CITATION.cff`}
              download
              className="rounded font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              CITATION.cff
            </a>{' '}
            and the full{' '}
            <a
              href={`${DL_DIR}/sources.bib`}
              download
              className="rounded font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              sources.bib
            </a>{' '}
            (upstream datasets + the {files.length ? '' : ''}scholarly references behind the movement
            theses) are in the downloads.
          </p>

          <div className="mt-4">
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Suggested citation
            </p>
            <CopyBlock text={suggestedCite} label="suggested citation" />
          </div>

          <div className="mt-4">
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              BibTeX
            </p>
            <CopyBlock text={atlasBibtex} label="BibTeX entry" />
          </div>
        </section>

        {/* ------------------------------------------ Method & reproducibility -- */}
        <section className="mt-12" aria-labelledby="method-h">
          <h2
            id="method-h"
            className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-foreground"
          >
            <GitBranch size={15} className="text-primary" aria-hidden="true" />
            Method &amp; reproducibility
          </h2>
          <div className="mt-3 space-y-4 text-[13.5px] leading-relaxed text-muted-foreground">
            <p>
              A single committed build script, <code className="rounded bg-muted px-1.5 py-0.5 text-[12px] text-foreground">pnpm atlas:build-data</code>,
              reads the canonical AIATSIS registry (1,029 languoids), a{' '}
              <strong className="text-foreground">read-only</strong> snapshot of the live dictionary
              database, the Bouckaert 2018 phylogeography, and the Grambank/WALS/AUS typology plane, and
              joins them deterministically. A sibling step,{' '}
              <code className="rounded bg-muted px-1.5 py-0.5 text-[12px] text-foreground">pnpm atlas:build-exports</code>,
              emits the download files above. The build is deterministic (the version and build stamp
              come from the manifest, never the wall clock), so a release is a git tag and re-running
              reproduces byte-identical artifacts.
            </p>
            <p>
              <strong className="text-foreground">Join keys.</strong> Everything is keyed on{' '}
              <strong className="text-foreground">glottocode</strong> first, falling back to AUSTLANG
              code, then normalised name / DB slug, with a legacy-alias map so old links resolve.
            </p>
            <p>
              <strong className="text-foreground">Coordinate fallback chain.</strong> (1) Glottolog
              point; (2) AUSTLANG approximate location; (3) subgroup-centroid of sibling leaves, flagged
              <em> derived</em>; (4) if none, the language is <em>not</em> given a coordinate — it stays
              in the directory and CSV with <code className="rounded bg-muted px-1.5 py-0.5 text-[12px] text-foreground">coord_provenance=none</code>.
              A coordinate is never fabricated to look complete.
            </p>
            <p>
              <strong className="text-foreground">What &ldquo;genuine languoid&rdquo; excludes.</strong>{' '}
              {cov.non_language_nodes_appendixed ?? 49}{' '}Sign-language, Pidgin, Bookkeeping and
              mixed/artificial nodes are moved to a clearly-labelled appendix rather than counted as
              languages; Mi&apos;gmaq is excluded as non-Australian; the Curr 1886-87 OCR wordlists are
              kept as a historical appendix, not as modern language identities.
            </p>
          </div>
        </section>

        {/* ------------------------------------------------------ Coverage -- */}
        <section className="mt-12" aria-labelledby="coverage-h">
          <h2
            id="coverage-h"
            className="text-sm font-semibold uppercase tracking-wider text-foreground"
          >
            Coverage, shown as fractions
          </h2>
          <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
            Out of <strong className="text-foreground">{genuine.toLocaleString('en-AU')}</strong> genuine
            languoids ({(cov.universe_registry_languoids ?? 1029).toLocaleString('en-AU')} registry nodes
            minus {cov.non_language_nodes_appendixed ?? 49} appendixed non-language nodes). Fractions are
            never rounded up to imply completeness.
          </p>
          <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {coverageStats.map((s) => (
              <div
                key={s.label}
                className="rounded-2xl border border-border bg-card p-4 shadow-sm"
              >
                <dt className="text-[12px] leading-snug text-muted-foreground">{s.label}</dt>
                <dd className="mt-1.5 font-mono text-lg font-semibold text-foreground">{s.frac}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* ------------------------------------------ Uncertainty & honesty -- */}
        <section className="mt-12" aria-labelledby="honesty-h">
          <h2
            id="honesty-h"
            className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-foreground"
          >
            <ShieldCheck size={15} className="text-primary" aria-hidden="true" />
            Uncertainty &amp; honesty policy
          </h2>
          <ul className="mt-3 space-y-3">
            {[
              {
                h: 'Coordinates carry provenance.',
                b: (
                  <>
                    Every point is flagged <code className="rounded bg-muted px-1 py-0.5 text-[11px] text-foreground">glottolog</code> /{' '}
                    <code className="rounded bg-muted px-1 py-0.5 text-[11px] text-foreground">austlang</code> /{' '}
                    <code className="rounded bg-muted px-1 py-0.5 text-[11px] text-foreground">derived_centroid</code> /{' '}
                    <code className="rounded bg-muted px-1 py-0.5 text-[11px] text-foreground">none</code>. Approximate and
                    derived points are labelled as such; unlocated languages are listed, never plotted at a
                    fake point.
                  </>
                ),
              },
              {
                h: 'Autonyms are unverified candidates.',
                b: (
                  <>
                    Names drawn from alt-name lists (which conflate endonyms with spelling variants) are shown
                    as <em>candidates</em>, never asserted as a community-confirmed autonym.
                  </>
                ),
              },
              {
                h: 'Grammar coverage is partial and honest.',
                b: (
                  <>
                    {(cov.grammar_profiled ?? 203).toLocaleString('en-AU')} of{' '}
                    {genuine.toLocaleString('en-AU')} languoids are grammatically profiled; the rest are shown
                    as <em>not profiled</em>, never as absence of a feature.{' '}
                    <Link href="/atlas/grammar" className="rounded font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                      The grammar lens
                    </Link>{' '}
                    reports <code className="rounded bg-muted px-1 py-0.5 text-[11px] text-foreground">grammar_recorded_agreement</code> —
                    agreement over jointly-recorded features only, <strong>not</strong> overall grammatical
                    similarity and <strong>not</strong> genetic relatedness (always read <code className="rounded bg-muted px-1 py-0.5 text-[11px] text-foreground">n_joint</code>).
                  </>
                ),
              },
              {
                h: 'Deep-time dates a language lineage, not a population.',
                b: (
                  <>
                    The Bouckaert 2018 ages ({(cov.deep_time_dated ?? 224).toLocaleString('en-AU')} of{' '}
                    {genuine.toLocaleString('en-AU')} leaves dated) reconstruct the movement of{' '}
                    <em>language lineages</em> across a continent already populated for ~65,000 years — not a
                    peopling event. The deepest Pama-Nyungan nodes have weak posterior support and are shown
                    with their 95% HPD, not a bare number.{' '}
                    <Link href="/atlas/spread" className="rounded font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                      See the deep-time spread
                    </Link>.
                  </>
                ),
              },
              {
                h: 'The movement theses preserve contradiction.',
                b: (
                  <>
                    The eight &ldquo;why did the languages move?&rdquo; theses are held side by side — each with
                    mandatory evidence <em>against</em> and a contestation level. No single winner is declared.{' '}
                    <Link href="/atlas/spread" className="rounded font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                      Read the thesis matrix
                    </Link>.
                  </>
                ),
              },
            ].map((item) => (
              <li
                key={item.h}
                className="rounded-xl border border-border bg-muted/30 p-4 text-[13px] leading-relaxed text-muted-foreground"
              >
                <p className="font-semibold text-foreground">{item.h}</p>
                <p className="mt-1">{item.b}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* --------------------------------------- ICIP / CARE statement -- */}
        <section className="mt-12" aria-labelledby="icip-h">
          <div className="overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-b from-primary/[0.06] to-transparent">
            <div className="p-6">
              <h2
                id="icip-h"
                className="text-sm font-semibold uppercase tracking-wider text-primary"
              >
                Indigenous Data Sovereignty · CARE · ICIP
              </h2>
              <div className="mt-3 space-y-4 text-[13.5px] leading-relaxed text-muted-foreground">
                <p>
                  These languages belong to the First Peoples of this continent, who have spoken them on
                  Country for tens of thousands of years and speak many of them today. This atlas
                  aggregates <strong className="text-foreground">open scholarly and catalogue records</strong> to
                  help people find, cite and care for that knowledge. It is a scholarly aggregation — it is{' '}
                  <strong className="text-foreground">not</strong> a substitute for community authority, and it
                  claims no community endorsement.
                </p>
                <p>
                  Names, autonyms and locations drawn from catalogues are shown{' '}
                  <strong className="text-foreground">with their uncertainty</strong>, not as settled fact.
                  Rights-managed materials — AIATSIS and language-centre dictionaries — appear only as{' '}
                  <strong className="text-foreground">catalogue pointers</strong>; they are never scraped or
                  reproduced. Nineteenth-century colonial wordlists are labelled as historical sources, not as
                  community-approved lexicons.{' '}
                  <strong className="text-foreground">Communities are the final word on their own languages.</strong>
                </p>
                <p>
                  We follow the spirit of the{' '}
                  <a
                    href="https://www.gida-global.org/care"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    CARE Principles for Indigenous Data Governance
                  </a>{' '}
                  — Collective benefit, Authority to control, Responsibility, Ethics — alongside FAIR, and the{' '}
                  <a
                    href="https://localcontexts.org"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    Local Contexts / Traditional Knowledge (TK) &amp; ICIP
                  </a>{' '}
                  framework for Indigenous Cultural and Intellectual Property.
                </p>
                <p>
                  If any record here is wrong, sensitive, or should be withheld, please tell us — we will
                  correct or remove it. Contact{' '}
                  <a
                    href="mailto:ajax@mobtranslate.com?subject=Atlas%20of%20Australian%20Languages%20—%20correction%2Fremoval%20request"
                    className="rounded font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    ajax@mobtranslate.com
                  </a>
                  .
                </p>
                <p className="border-t border-primary/15 pt-4 text-foreground">
                  We pay our respects to Elders past and present, and to the language custodians and speakers
                  whose knowledge this records.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* --------------------------------------------- Attribution / credits -- */}
        <section className="mt-12 rounded-2xl border border-border bg-card p-5 shadow-sm" aria-labelledby="credits-h">
          <h2 id="credits-h" className="text-sm font-semibold text-foreground">
            Attribution &amp; credits
          </h2>
          <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
            With thanks to <strong className="text-foreground">Glottolog</strong>,{' '}
            <strong className="text-foreground">Grambank</strong>, <strong className="text-foreground">WALS</strong>,{' '}
            <strong className="text-foreground">PHOIBLE</strong>, <strong className="text-foreground">D-PLACE</strong>,{' '}
            <strong className="text-foreground">Phlorest</strong>,{' '}
            <strong className="text-foreground">AIATSIS AUSTLANG</strong>, and to{' '}
            <strong className="text-foreground">Bouckaert, Bowern &amp; Atkinson</strong>, whose open work
            makes this possible; to <strong className="text-foreground">E. M. Curr (1886–87)</strong> for the
            historical wordlists (colonial OCR, not community-approved lexicons); and, above all, to the
            language communities and custodians whose knowledge this records. Full references are in{' '}
            <a
              href={`${DL_DIR}/sources.bib`}
              download
              className="rounded font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              sources.bib
            </a>
            .
          </p>
        </section>
      </div>
    </SharedLayout>
  );
}
